import express, { Router } from "express";
import { prisma } from "./db";
import { PRICES, PRICES_CHECKED, STEP_LABELS, type UsageKind } from "./aiUsage";
import { READING_STAGES, effectiveStage, normalizeStage, stageInfo } from "./readingStages";

// The admin Costs page: what the AI costs per chapter, per family and per week.
// Spend counts each call on the day it was made. A chapter's cost is everything
// ever spent on it: writing, checks, pictures, and later redraws and rewrites.
// Only chapters made after tracking began have a cost; older ones show as untracked.

const router: Router = express.Router();
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const KINDS: UsageKind[] = ["text", "image", "voice"];
const MADE_BY = ["family", "weekly", "admin", "visitor", "system"];
const MAX_CHAPTERS = 500;

const instant = (v: unknown) => {
  const d = typeof v === "string" && v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const pick = (v: unknown, allowed: string[]) => (typeof v === "string" && allowed.includes(v) ? v : "");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// The chapter's reading stage as it was made (from its snapshot, without parsing all of it).
const snapshotStage = (snapshot: string | null) => normalizeStage(snapshot?.match(/"readerAgeBand":"([^"]+)"/)?.[1] ?? null);

// Monday 00:00 in the viewer's time zone (tz: minutes behind UTC, as getTimezoneOffset gives).
const weekStart = (t: number, tz: number) => {
  const local = new Date(t - tz * 60_000);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday) + tz * 60_000;
};

router.get("/admin/costs", async (req, res) => {
  const now = new Date();
  const tz = Math.max(-840, Math.min(840, Number(req.query.tz) || 0));
  const to = instant(req.query.to) ?? now;
  const from = instant(req.query.from); // none: all time
  const families = await prisma.household.findMany({
    include: { owner: true, contributors: true, children: { include: { storybooks: true } } },
    orderBy: { createdAt: "asc" },
  });
  const familyIds = families.map((f) => f.id);
  const filters = {
    family: pick(req.query.family, familyIds),
    stage: pick(req.query.stage, READING_STAGES.map((s) => s.key)),
    madeBy: pick(req.query.madeBy, MADE_BY),
    kind: pick(req.query.kind, KINDS),
  };

  const familyInfo = new Map(
    families.map((h) => {
      const storybook = h.children.flatMap((c) => c.storybooks.map((s) => ({ ...s, child: c })))[0];
      const owner = h.contributors.find((c) => c.role === "owner" && c.inviteStatus !== "revoked");
      return [
        h.id,
        {
          id: h.id,
          name: `${h.children.map((c) => c.displayName).join(" & ") || h.name || "Unnamed family"}${h.guestToken ? " (visitor, unsaved)" : ""}`,
          owner: owner?.name ?? h.owner?.name ?? h.owner?.phone ?? null,
          stage: storybook ? effectiveStage(storybook, now) : null,
          createdAt: h.createdAt,
        },
      ];
    })
  );

  const firstUsage = await prisma.aiUsage.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const trackingSince = firstUsage?.createdAt ?? null;
  const range = { gte: from ?? undefined, lt: to };

  // --- Chapters made in the period, with everything ever spent on them ---
  const chapterList = await prisma.chapter.findMany({
    where: { createdAt: range, ...(filters.family ? { storybook: { child: { householdId: filters.family } } } : {}) },
    select: {
      id: true,
      title: true,
      createdAt: true,
      version: true,
      status: true,
      generationSnapshot: true,
      storybook: { select: { id: true, child: { select: { displayName: true, householdId: true } } } },
      pages: { select: { pictureSize: true, _count: { select: { assets: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  const chapterRows = await prisma.aiUsage.findMany({ where: { chapterId: { in: chapterList.map((c) => c.id) } }, orderBy: { createdAt: "asc" } });
  const rowsByChapter = new Map<string, typeof chapterRows>();
  for (const r of chapterRows) rowsByChapter.set(r.chapterId!, [...(rowsByChapter.get(r.chapterId!) ?? []), r]);

  const chapters = chapterList
    .map((c) => {
      const rows = rowsByChapter.get(c.id) ?? [];
      const counted = rows.filter((r) => !filters.kind || r.kind === filters.kind);
      const tracked = Boolean(trackingSince && c.createdAt >= trackingSince);
      const byKind = Object.fromEntries(KINDS.map((k) => [k, sum(counted.filter((r) => r.kind === k).map((r) => r.costUsd))])) as Record<UsageKind, number>;
      return {
        id: c.id,
        title: c.title,
        familyId: c.storybook.child.householdId,
        family: c.storybook.child.displayName,
        storybookId: c.storybook.id,
        createdAt: c.createdAt,
        status: c.status,
        stage: snapshotStage(c.generationSnapshot),
        madeBy: rows[0]?.trigger ?? null, // whoever started its first call
        pages: c.pages.length,
        pictures: c.pages.filter((p) => p.pictureSize !== "none").length,
        drawn: sum(c.pages.map((p) => p._count.assets)),
        rewrites: c.version - 1,
        tracked,
        cost: tracked ? sum(counted.map((r) => r.costUsd)) : null,
        byKind: tracked ? byKind : null,
        steps: tracked ? counted.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.step]: (acc[r.step] ?? 0) + r.costUsd }), {}) : null,
      };
    })
    .filter((c) => (!filters.stage || c.stage === filters.stage) && (!filters.madeBy || c.madeBy === filters.madeBy));

  // --- Spend in the period ---
  const allRows = await prisma.aiUsage.findMany({
    where: {
      createdAt: range,
      ...(filters.family ? { householdId: filters.family } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.madeBy ? { trigger: filters.madeBy } : {}),
    },
  });
  // A reading stage filter keeps a chapter's spend by the stage it was made at,
  // and other spend (memories, family characters) by the family's stage today.
  const chapterStages = new Map(chapterList.map((c) => [c.id, snapshotStage(c.generationSnapshot)]));
  const missing = [...new Set(allRows.map((r) => r.chapterId).filter((id): id is string => Boolean(id) && !chapterStages.has(id!)))];
  if (filters.stage && missing.length) {
    const more = await prisma.chapter.findMany({ where: { id: { in: missing } }, select: { id: true, generationSnapshot: true } });
    more.forEach((c) => chapterStages.set(c.id, snapshotStage(c.generationSnapshot)));
  }
  const rows = allRows.filter((r) => {
    if (!filters.stage) return true;
    if (r.chapterId && chapterStages.has(r.chapterId)) return chapterStages.get(r.chapterId) === filters.stage;
    return Boolean(r.householdId) && familyInfo.get(r.householdId!)?.stage === filters.stage;
  });

  // --- Period length, for weekly and monthly rates ---
  const end = Math.min(to.getTime(), now.getTime());
  const firstFamily = families[0]?.createdAt.getTime() ?? end;
  const start = Math.max(from?.getTime() ?? firstFamily, firstFamily);
  const weeksFor = (since: number) => Math.max(1, (end - Math.max(start, since)) / WEEK);
  const spendStart = Math.max(from?.getTime() ?? 0, trackingSince?.getTime() ?? end);
  const spendDays = Math.max(1, (end - spendStart) / DAY);

  // --- Totals ---
  const spend = sum(rows.map((r) => r.costUsd));
  const tracked = chapters.filter((c) => c.tracked);
  const costs = tracked.map((c) => c.cost!);
  const familySpend = sum(rows.filter((r) => r.householdId).map((r) => r.costUsd));
  const shownFamilies = families.filter(
    (f) => !f.guestToken && (!filters.family || f.id === filters.family) && (!filters.stage || familyInfo.get(f.id)?.stage === filters.stage || chapters.some((c) => c.familyId === f.id))
  );
  const familyWeeks = sum(shownFamilies.filter((f) => f.createdAt.getTime() < end).map((f) => weeksFor(f.createdAt.getTime())));
  const stepSpend = (steps: string[]) => sum(rows.filter((r) => steps.includes(r.step)).map((r) => r.costUsd));
  const pictureRows = rows.filter((r) => r.step === "page_picture");

  const totals = {
    spend,
    byKind: Object.fromEntries(KINDS.map((k) => [k, sum(rows.filter((r) => r.kind === k).map((r) => r.costUsd))])),
    calls: rows.length,
    estimatedCalls: rows.filter((r) => r.estimated).length,
    chapters: chapters.length,
    trackedChapters: tracked.length,
    avgPerChapter: costs.length ? sum(costs) / costs.length : null,
    medianPerChapter: median(costs),
    maxPerChapter: costs.length ? Math.max(...costs) : null,
    allInPerChapter: tracked.length ? familySpend / tracked.length : null,
    perPage: tracked.length ? sum(costs) / Math.max(1, sum(tracked.map((c) => c.pages))) : null,
    perPicture: pictureRows.length ? sum(pictureRows.map((r) => r.costUsd)) / pictureRows.length : null,
    redrawShare: stepSpend(["page_picture", "page_fix", "page_redraw", "chapter_sheet"])
      ? stepSpend(["page_fix", "page_redraw"]) / stepSpend(["page_picture", "page_fix", "page_redraw", "chapter_sheet"])
      : null,
    families: shownFamilies.length,
    activeFamilies: new Set(chapters.map((c) => c.familyId)).size,
    chaptersPerFamilyWeek: familyWeeks ? chapters.length / familyWeeks : null,
    perDay: trackingSince ? spend / spendDays : null,
    monthly: trackingSince ? (spend / spendDays) * 30.4 : null,
  };

  // --- Week by week ---
  const weeks = new Map<number, { start: number; spend: number; text: number; image: number; voice: number; chapters: number; families: Set<string> }>();
  const week = (t: number) => {
    const key = weekStart(t, tz);
    if (!weeks.has(key)) weeks.set(key, { start: key, spend: 0, text: 0, image: 0, voice: 0, chapters: 0, families: new Set() });
    return weeks.get(key)!;
  };
  if (end > start) for (let t = weekStart(start, tz); t < end; t += WEEK) week(t);
  for (const r of rows) {
    const w = week(r.createdAt.getTime());
    w.spend += r.costUsd;
    w[r.kind as UsageKind] += r.costUsd;
  }
  for (const c of chapters) {
    const w = week(c.createdAt.getTime());
    w.chapters += 1;
    w.families.add(c.familyId);
  }

  // --- By step ---
  const steps = Object.entries(
    rows.reduce<Record<string, typeof rows>>((acc, r) => ({ ...acc, [r.step]: [...(acc[r.step] ?? []), r] }), {})
  )
    .map(([step, list]) => {
      const info = STEP_LABELS[step];
      const spentOnChapters = sum(tracked.map((c) => c.steps?.[step] ?? 0));
      return {
        step,
        label: info?.label ?? step,
        kind: info?.kind ?? list[0].kind,
        group: info?.group ?? "chapter",
        calls: list.length,
        spend: sum(list.map((r) => r.costUsd)),
        perCall: sum(list.map((r) => r.costUsd)) / list.length,
        perChapter: info?.group === "chapter" && tracked.length ? spentOnChapters / tracked.length : null,
        models: [...new Set(list.map((r) => r.model))],
      };
    })
    .sort((a, b) => b.spend - a.spend);

  // --- By family ---
  const familyRows = shownFamilies
    .map((f) => {
      const info = familyInfo.get(f.id)!;
      const own = rows.filter((r) => r.householdId === f.id);
      const theirChapters = chapters.filter((c) => c.familyId === f.id);
      const theirCosts = theirChapters.filter((c) => c.tracked).map((c) => c.cost!);
      const group = (g: string) => sum(own.filter((r) => (STEP_LABELS[r.step]?.group ?? "chapter") === g).map((r) => r.costUsd));
      const familySpendTotal = sum(own.map((r) => r.costUsd));
      return {
        id: f.id,
        name: info.name,
        owner: info.owner,
        stage: info.stage ? stageInfo(info.stage).label : "—",
        joined: f.createdAt,
        chapters: theirChapters.length,
        chaptersPerWeek: f.createdAt.getTime() < end ? theirChapters.length / weeksFor(f.createdAt.getTime()) : 0,
        avgPerChapter: theirCosts.length ? sum(theirCosts) / theirCosts.length : null,
        spend: familySpendTotal,
        chapterSpend: group("chapter"),
        memorySpend: group("memory"),
        characterSpend: group("family"),
        monthly: trackingSince ? (familySpendTotal / Math.max(1, (end - Math.max(spendStart, f.createdAt.getTime())) / DAY)) * 30.4 : null,
      };
    })
    .filter((f) => f.chapters || f.spend || filters.family)
    .sort((a, b) => b.spend - a.spend || b.chapters - a.chapters);

  res.json({
    trackingSince,
    pricesChecked: PRICES_CHECKED,
    prices: PRICES,
    period: { from: from ?? (families[0]?.createdAt ?? null), to: new Date(end) },
    options: {
      families: [...familyInfo.values()].map((f) => ({ id: f.id, name: f.name, owner: f.owner })),
      stages: READING_STAGES.map((s) => ({ key: s.key, label: s.label })),
    },
    totals,
    weeks: [...weeks.values()]
      .sort((a, b) => a.start - b.start)
      .map(({ families: active, ...w }) => ({ ...w, start: new Date(w.start), activeFamilies: active.size })),
    steps,
    families: familyRows,
    chapters: chapters.slice(0, MAX_CHAPTERS).map(({ steps: _steps, ...c }) => ({ ...c, stage: stageInfo(c.stage).label })),
    moreChapters: Math.max(0, chapters.length - MAX_CHAPTERS),
    unattributedSpend: sum(rows.filter((r) => !r.householdId).map((r) => r.costUsd)),
  });
});

export default router;
