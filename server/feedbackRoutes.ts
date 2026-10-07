import express, { Router } from "express";
import { prisma } from "./db";
import type { Prisma } from "../src/generated/prisma/client";
import { getCurrentUser } from "./session";
import { appUrl } from "./messageTemplates";
import { drawComparison } from "./storyPages";
import { createJiraIssue, jiraConfigured } from "./jira";
import { normalizeStage } from "./readingStages";
import { ACTION_AREAS, FAMILY_CATEGORIES, FLAG_CATEGORIES, FLAG_STATUSES, PICTURE_CATEGORIES, WORDS_CATEGORIES } from "./flagCategories";

// The feedback loop (VSB-94): the team flags a page's picture or words, parents'
// chapter feedback joins the same queue, flags become action items (and Jira
// tickets), flagged pictures are redrawn with today's rules to compare, and the
// whole set exports as a dataset. Admins only (server.ts guards /api/admin).

const router: Router = express.Router();

const parse = <T,>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

const OPEN_STATUSES = ["new", "reviewed", "action"];

// What was judged, saved with the flag so later changes don't lose it.
async function pageSnapshot(pageId: string) {
  const page = await prisma.storyPage.findUniqueOrThrow({
    where: { id: pageId },
    include: { chapter: true, assets: { where: { status: "ready" }, orderBy: { version: "desc" }, take: 1 } },
  });
  const generation = parse<{ readerAgeBand?: string } | null>(page.chapter.generationSnapshot ?? "", null);
  const asset = page.assets[0];
  return {
    page,
    asset,
    snapshot: {
      chapterTitle: page.chapter.title,
      ruleSetVersion: page.chapter.ruleSetVersion,
      stage: generation?.readerAgeBand ?? null,
      pageNumber: page.pageNumber,
      pictureSize: page.pictureSize,
      text: page.text,
      plan: {
        storyMoment: page.storyMoment,
        characters: parse<string[]>(page.characters, []),
        setting: page.setting,
        visibleAction: page.visibleAction,
        emotionalTone: page.emotionalTone,
        shot: parse(page.shot ?? "", null),
        continuity: page.continuity,
      },
      picture: asset ? { assetId: asset.id, version: asset.version, imagePath: asset.imagePath, prompt: asset.prompt, model: asset.model } : null,
    },
  };
}

// A parent's chapter feedback as a family flag (also done for older feedback by
// the migration that added flags).
export async function flagFromFeedback(feedbackId: string) {
  const f = await prisma.storyFeedback.findUniqueOrThrow({ where: { id: feedbackId }, include: { chapter: true, contributor: true } });
  const generation = parse<{ readerAgeBand?: string } | null>(f.chapter.generationSnapshot ?? "", null);
  return prisma.flag.create({
    data: {
      chapterId: f.chapterId,
      target: "chapter",
      categories: JSON.stringify([f.reason]),
      note: f.note,
      source: "family",
      feedbackId: f.id,
      snapshot: JSON.stringify({
        chapterTitle: f.chapter.title,
        ruleSetVersion: f.chapter.ruleSetVersion,
        stage: generation?.readerAgeBand ?? null,
        from: f.contributor.relationship || "Family member",
      }),
    },
  });
}

router.post("/admin/pages/:pageId/flags", async (req, res) => {
  const user = await getCurrentUser(req);
  const target = String(req.body?.target ?? "");
  if (!["picture", "words", "both"].includes(target)) return res.status(400).json({ error: "Flag the picture, the words, or both." });
  const allowed = target === "picture" ? PICTURE_CATEGORIES : target === "words" ? WORDS_CATEGORIES : { ...PICTURE_CATEGORIES, ...WORDS_CATEGORIES };
  const categories = (Array.isArray(req.body?.categories) ? req.body.categories : []).map(String).filter((c: string) => c in allowed);
  const note = String(req.body?.note ?? "").trim().slice(0, 2000);
  if (!categories.length) return res.status(400).json({ error: "Pick at least one category." });
  if (!note) return res.status(400).json({ error: "Say what's wrong." });
  const found = await prisma.storyPage.findUnique({ where: { id: req.params.pageId } });
  if (!found) return res.status(404).json({ error: "Page not found" });
  const { page, asset, snapshot } = await pageSnapshot(found.id);
  if (target !== "words" && !asset) return res.status(400).json({ error: "This page has no picture to flag." });
  const flag = await prisma.flag.create({
    data: {
      chapterId: page.chapterId,
      pageId: page.id,
      assetId: target === "words" ? null : asset?.id ?? null,
      target,
      categories: JSON.stringify(categories),
      note,
      shouldBe: String(req.body?.shouldBe ?? "").trim().slice(0, 2000),
      source: "team",
      createdById: user?.id ?? null,
      snapshot: JSON.stringify(snapshot),
    },
  });
  res.status(201).json(flag);
});

// --- The queue ---

type FlagWithAll = Prisma.FlagGetPayload<{
  include: { chapter: { select: { id: true; title: true } }; createdBy: { select: { name: true } }; actionItem: true; redraws: true };
}>;

const presentFlag = (f: FlagWithAll) => {
  const snapshot = parse<Record<string, any>>(f.snapshot, {});
  // Older chapters record an age band ("0-3"); show and filter by stage.
  if (snapshot.stage) snapshot.stage = normalizeStage(snapshot.stage);
  return {
    id: f.id,
    createdAt: f.createdAt,
    source: f.source,
    from: f.source === "family" ? snapshot.from ?? "Family member" : f.createdBy?.name ?? "The team",
    target: f.target,
    categories: parse<string[]>(f.categories, []),
    note: f.note,
    shouldBe: f.shouldBe,
    status: f.status,
    chapter: f.chapter,
    pageId: f.pageId,
    snapshot,
    actionItem: f.actionItem ? { id: f.actionItem.id, title: f.actionItem.title, status: f.actionItem.status, jiraKey: f.actionItem.jiraKey } : null,
    redraws: f.redraws
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({ id: r.id, status: r.status, imagePath: r.imagePath, ruleSetVersion: r.ruleSetVersion, error: r.error, createdAt: r.createdAt, prompt: r.prompt })),
  };
};

async function filteredFlags(query: Record<string, unknown>) {
  const q = (k: string) => (typeof query[k] === "string" && query[k] ? String(query[k]) : null);
  const where: Prisma.FlagWhereInput = {};
  if (q("source")) where.source = q("source")!;
  if (q("status")) where.status = q("status") === "open" ? { in: OPEN_STATUSES } : q("status")!;
  if (q("target") === "picture") where.target = { in: ["picture", "both"] };
  if (q("target") === "words") where.target = { in: ["words", "both", "chapter"] };
  const from = q("from") ? new Date(`${q("from")}T00:00:00`) : null;
  const to = q("to") ? new Date(`${q("to")}T23:59:59`) : null;
  if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const rows = await prisma.flag.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { chapter: { select: { id: true, title: true } }, createdBy: { select: { name: true } }, actionItem: true, redraws: true },
  });
  return rows
    .map(presentFlag)
    .filter((f) => !q("category") || f.categories.includes(q("category")!))
    .filter((f) => !q("stage") || f.snapshot.stage === q("stage"));
}

router.get("/admin/flags", async (req, res) => {
  const flags = await filteredFlags(req.query);
  // How often each category comes up in this view, most common first.
  const counts: Record<string, number> = {};
  for (const f of flags) for (const c of f.categories) counts[c] = (counts[c] ?? 0) + 1;
  res.json({
    flags,
    counts: Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, label: FLAG_CATEGORIES[key] ?? key, count })),
    jira: jiraConfigured(),
  });
});

router.put("/admin/flags/:id", async (req, res) => {
  const status = String(req.body?.status ?? "");
  if (!(FLAG_STATUSES as readonly string[]).includes(status)) return res.status(400).json({ error: "Unknown status." });
  const flag = await prisma.flag.update({ where: { id: req.params.id }, data: { status } }).catch(() => null);
  if (!flag) return res.status(404).json({ error: "Flag not found" });
  res.json(flag);
});

// --- Redraw to compare, and re-test a category (VSB-97) ---

async function redraw(flagId: string) {
  const flag = await prisma.flag.findUniqueOrThrow({ where: { id: flagId } });
  if (!flag.pageId) throw new Error("This flag isn't about a page picture.");
  const row = await prisma.flagRedraw.create({ data: { flagId } });
  try {
    const drawn = await drawComparison(flag.pageId, `${flagId}-${Date.now()}.jpg`);
    return prisma.flagRedraw.update({ where: { id: row.id }, data: { status: "ready", ...drawn } });
  } catch (error: any) {
    return prisma.flagRedraw.update({ where: { id: row.id }, data: { status: "failed", error: String(error?.message ?? "Redraw failed").slice(0, 300) } });
  }
}

router.post("/admin/flags/:id/redraw", async (req, res) => {
  const flag = await prisma.flag.findUnique({ where: { id: req.params.id } });
  if (!flag?.pageId || flag.target === "words") return res.status(400).json({ error: "Only a flagged picture can be redrawn." });
  const result = await redraw(flag.id);
  if (result.status === "failed") return res.status(502).json({ error: result.error });
  res.json(result);
});

// The average cost of one page picture lately, for estimates.
async function pictureCost() {
  const recent = await prisma.aiUsage.aggregate({
    where: { step: { in: ["page_picture", "page_redraw", "feedback_redraw"] }, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    _avg: { costUsd: true },
  });
  return recent._avg.costUsd ?? 0.06;
}

const retesting = new Set<string>();

router.post("/admin/flags/retest", async (req, res) => {
  const category = String(req.body?.category ?? "");
  if (!(category in PICTURE_CATEGORIES)) return res.status(400).json({ error: "Pick a picture category." });
  const candidates = await prisma.flag.findMany({
    where: { status: { in: OPEN_STATUSES }, target: { in: ["picture", "both"] }, pageId: { not: null } },
    select: { id: true, categories: true },
  });
  const ids = candidates.filter((f) => parse<string[]>(f.categories, []).includes(category)).map((f) => f.id);
  const estimate = Math.round(ids.length * (await pictureCost()) * 100) / 100;
  if (req.body?.confirm !== true) return res.json({ count: ids.length, estimate });
  if (retesting.has(category)) return res.status(409).json({ error: "Already re-testing this category." });
  retesting.add(category);
  // One after another; the image rate limit paces them. Each appears on its flag as it lands.
  void (async () => {
    for (const id of ids) await redraw(id).catch((e) => console.error(`Re-test of flag ${id} failed:`, e?.message));
  })().finally(() => retesting.delete(category));
  res.status(202).json({ started: ids.length, estimate });
});

// --- Action items (VSB-96) ---

router.get("/admin/action-items", async (_req, res) => {
  const items = await prisma.actionItem.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { flags: { select: { id: true, categories: true, note: true, chapter: { select: { title: true } } } } },
  });
  res.json({
    jira: jiraConfigured(),
    items: items.map((i) => ({ ...i, flags: i.flags.map((f) => ({ ...f, categories: parse<string[]>(f.categories, []) })) })),
  });
});

router.post("/admin/action-items", async (req, res) => {
  const user = await getCurrentUser(req);
  const title = String(req.body?.title ?? "").trim().slice(0, 200);
  const area = String(req.body?.area ?? "other");
  if (!title) return res.status(400).json({ error: "Give the action item a title." });
  if (!(area in ACTION_AREAS)) return res.status(400).json({ error: "Pick what to change." });
  const flagIds = (Array.isArray(req.body?.flagIds) ? req.body.flagIds : []).map(String);
  const item = await prisma.actionItem.create({
    data: { title, area, details: String(req.body?.details ?? "").trim().slice(0, 4000), createdById: user?.id ?? null },
  });
  if (flagIds.length) await prisma.flag.updateMany({ where: { id: { in: flagIds } }, data: { actionItemId: item.id, status: "action" } });
  res.status(201).json(item);
});

router.put("/admin/action-items/:id", async (req, res) => {
  const b = req.body ?? {};
  const data: Prisma.ActionItemUpdateInput = {};
  if (typeof b.title === "string" && b.title.trim()) data.title = b.title.trim().slice(0, 200);
  if (typeof b.details === "string") data.details = b.details.trim().slice(0, 4000);
  if (typeof b.area === "string" && b.area in ACTION_AREAS) data.area = b.area;
  if (b.status === "open" || b.status === "done") data.status = b.status;
  const item = await prisma.actionItem.update({ where: { id: req.params.id }, data }).catch(() => null);
  if (!item) return res.status(404).json({ error: "Action item not found" });
  res.json(item);
});

router.post("/admin/action-items/:id/jira", async (req, res) => {
  const item = await prisma.actionItem.findUnique({
    where: { id: req.params.id },
    include: { flags: { include: { chapter: { select: { title: true } } } } },
  });
  if (!item) return res.status(404).json({ error: "Action item not found" });
  if (item.jiraKey) return res.status(400).json({ error: `Already in Jira as ${item.jiraKey}.` });
  if (!jiraConfigured()) {
    return res.status(400).json({ error: "Jira isn't connected yet: add JIRA_SITE, JIRA_EMAIL and JIRA_API_TOKEN to the server's settings (see the admin guide)." });
  }
  const type = req.body?.type === "Story" ? "Story" : "Task";
  try {
    const issue = await createJiraIssue({
      summary: item.title,
      type,
      lines: [
        item.details,
        `What to change: ${ACTION_AREAS[item.area] ?? item.area}.`,
        `From ${item.flags.length} flag${item.flags.length === 1 ? "" : "s"} in Admin > Feedback: ${appUrl("/admin/feedback")}`,
        ...item.flags.map((f) => {
          const cats = parse<string[]>(f.categories, []).map((c) => FLAG_CATEGORIES[c] ?? c).join(", ");
          return `- "${f.chapter.title}"${cats ? ` (${cats})` : ""}: ${f.note}`;
        }),
      ],
    });
    const updated = await prisma.actionItem.update({ where: { id: item.id }, data: { jiraKey: issue.key } });
    res.json({ ...updated, jiraUrl: issue.url });
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? "Jira didn't create the ticket." });
  }
});

// --- Export (VSB-98) ---

router.get("/admin/flags/export", async (req, res) => {
  const flags = await filteredFlags(req.query);
  const link = (p: string | null | undefined) => (p ? appUrl(`/${p}`) : null);
  const data = {
    exportedAt: new Date().toISOString(),
    filters: req.query,
    categories: FLAG_CATEGORIES,
    familyCategories: Object.keys(FAMILY_CATEGORIES),
    flags: flags.map((f) => ({
      id: f.id,
      createdAt: f.createdAt,
      source: f.source,
      // Families by relationship only; the team member who flagged isn't named.
      from: f.source === "family" ? f.from : "team",
      target: f.target,
      categories: f.categories,
      note: f.note,
      shouldBe: f.shouldBe,
      status: f.status,
      chapter: f.chapter.title,
      ...f.snapshot,
      pictureUrl: link(f.snapshot.picture?.imagePath),
      redraws: f.redraws.map((r) => ({ createdAt: r.createdAt, status: r.status, ruleSetVersion: r.ruleSetVersion, pictureUrl: link(r.imagePath), prompt: r.prompt })),
      actionItem: f.actionItem,
    })),
  };
  res.setHeader("Content-Disposition", `attachment; filename="vambie-flags-${new Date().toISOString().slice(0, 10)}.json"`);
  res.type("application/json").send(JSON.stringify(data, null, 2));
});

export default router;
