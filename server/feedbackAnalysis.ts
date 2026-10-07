import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { runAiStep, type AiImage } from "./aiService";
import { getAiInstruction } from "./aiInstructions";
import { getActiveRules, type PageRules } from "./pageRules";
import { PRICES, withUsage } from "./aiUsage";
import { FLAG_CATEGORIES } from "./flagCategories";
import { ENFORCEMENT_TARGETS, describeGuide, getGuide } from "./guideBook";
import { drawComparison } from "./storyPages";
import { DAYS, zonedParts, zonedToUtc } from "./weeklyChapters";

// The AI analysis of flags (VSB-103): patterns, the Guide Book rules they break,
// root causes and suggested fixes with exact wording; a weekly digest; and
// trying a suggested picture-rule change on a test copy of the rules (VSB-104).

const MAX_FLAGS = 60;
const MAX_PICTURES = 30;
const OPEN_STATUSES = ["new", "reviewed", "action"];

const parse = <T,>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

// The Page Rules fields a picture fix can change, and how they're named.
export const PICTURE_RULE_FIELDS: Record<string, keyof PageRules> = {
  "page_rules.illustrationStyle": "illustrationStyle",
  "page_rules.peopleStyle": "peopleStyle",
  "page_rules.pictureDirection": "pictureDirection",
};

type FlagRow = Awaited<ReturnType<typeof loadFlags>>[number];

async function loadFlags(ids: string[]) {
  return prisma.flag.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: { redraws: { where: { kind: "today", status: "ready" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
}

// The flags in the analysis prompt, each with a ref, plus their pictures as small images.
function describeFlags(flags: FlagRow[]) {
  const images: AiImage[] = [];
  const lines = flags.map((f, i) => {
    const s = parse<Record<string, any>>(f.snapshot, {});
    const cats = parse<string[]>(f.categories, []).map((c) => FLAG_CATEGORIES[c] ?? c).join(", ");
    const parts = [`F${i + 1} (${f.source}${f.source === "family" ? `, ${s.from ?? "family"}` : ""}; ${f.target}; ${cats}; stage ${s.stage ?? "?"}; rules v${s.ruleSetVersion ?? "?"})`];
    parts.push(`Note: "${f.note}"`);
    if (f.shouldBe) parts.push(`Should be: "${f.shouldBe}"`);
    if (s.chapterTitle) parts.push(`Chapter: "${s.chapterTitle}"${s.pageNumber ? `, page ${s.pageNumber}` : ""}`);
    if (s.text && f.target !== "picture") parts.push(`Words: "${s.text}"`);
    const plan = s.plan;
    if (plan) {
      const shot = plan.shot ? [plan.shot.type, plan.shot.angle, plan.shot.focus && `focus: ${plan.shot.focus}`].filter(Boolean).join(", ") : "";
      parts.push(`Planned: ${[shot && `camera ${shot}`, plan.visibleAction && `action: ${plan.visibleAction}`, plan.emotionalTone && `mood: ${plan.emotionalTone}`].filter(Boolean).join("; ")}`);
    }
    const picture = s.picture?.imagePath as string | undefined;
    if (f.target !== "words" && picture && images.length < MAX_PICTURES && fs.existsSync(path.join(process.cwd(), picture))) {
      images.push({ url: `data:image/jpeg;base64,${fs.readFileSync(path.join(process.cwd(), picture)).toString("base64")}`, detail: "low" });
      parts.push(`Picture: image ${images.length}`);
    }
    if (f.redraws[0]) parts.push(`Redrawn with rules v${f.redraws[0].ruleSetVersion} (not attached)`);
    return parts.join("\n  ");
  });
  return { text: lines.join("\n\n") || "(no flags)", images };
}

async function currentWording() {
  const { rules } = await getActiveRules();
  const plan = await getAiInstruction("page_plan");
  const check = await getAiInstruction("illustration_check");
  return [
    `Page Rules: Art style (page_rules.illustrationStyle):\n${rules.illustrationStyle}`,
    `Page Rules: How people are drawn (page_rules.peopleStyle):\n${rules.peopleStyle}`,
    `Page Rules: Camera and acting (page_rules.pictureDirection):\n${rules.pictureDirection ?? "(not set)"}`,
    `AI instruction: Plan pages (instruction.page_plan):\n${plan.body}`,
    `AI instruction: Check illustration (instruction.illustration_check):\n${check.body}`,
  ].join("\n\n");
}

async function previousAnalysis() {
  const last = await prisma.feedbackAnalysis.findFirst({ where: { status: "ready" }, orderBy: { createdAt: "desc" } });
  if (!last) return "(no earlier analysis)";
  const patterns = parse<{ name: string; flagIds: string[]; ruleIds: string[] }[]>(last.patterns, []);
  return `${last.createdAt.toISOString().slice(0, 10)}:\n${patterns.map((p) => `- ${p.name}: ${p.flagIds.length} flags (${p.ruleIds.join(", ") || "no rule"})`).join("\n") || "(no patterns)"}`;
}

async function decidedSuggestions() {
  const decided = await prisma.analysisSuggestion.findMany({ where: { status: { in: ["accepted", "dismissed"] } }, orderBy: { createdAt: "desc" }, take: 40 });
  return decided.map((d) => `${d.status === "accepted" ? "Accepted" : "Dismissed"}: ${d.title} (${d.target})`).join("\n") || "(none yet)";
}

// Which flags an analysis covers: the given ones, or the open ones, newest first.
export async function flagsToAnalyze(flagIds?: string[]) {
  const rows = await prisma.flag.findMany({
    where: flagIds?.length ? { id: { in: flagIds } } : { status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: "desc" },
    take: MAX_FLAGS,
    select: { id: true, target: true },
  });
  return rows;
}

// A rough cost before running: the prompt's size, small pictures, and the answer.
export async function estimateAnalysis(flagCount: number, pictureCount: number) {
  const guide = await getGuide();
  const inputTokens = (describeGuide(guide.rules).length + (await currentWording()).length + flagCount * 500) / 4 + Math.min(pictureCount, MAX_PICTURES) * 100;
  const price = PRICES["gpt-5.5"];
  return Math.round(((inputTokens * price.input + 8000 * price.output) / 1_000_000) * 100) / 100;
}

export async function startAnalysis(input: { trigger: "manual" | "weekly"; filters?: Record<string, unknown>; flagIds: string[] }) {
  const guide = await getGuide();
  const { version } = await getActiveRules();
  const run = await prisma.feedbackAnalysis.create({
    data: {
      trigger: input.trigger,
      filters: JSON.stringify(input.filters ?? {}),
      flagIds: JSON.stringify(input.flagIds),
      guideVersion: guide.version,
      ruleSetVersion: version,
    },
  });
  void withUsage({ trigger: "admin" }, () => analyze(run.id)).catch(async (error) => {
    console.error("Feedback analysis failed:", error?.message);
    await prisma.feedbackAnalysis.update({ where: { id: run.id }, data: { status: "failed", error: String(error?.message ?? "Failed").slice(0, 300) } });
  });
  return run;
}

async function analyze(runId: string) {
  const run = await prisma.feedbackAnalysis.findUniqueOrThrow({ where: { id: runId } });
  const flags = await loadFlags(parse<string[]>(run.flagIds, []));
  if (!flags.length) throw new Error("There are no flags to analyze.");
  const guide = await getGuide();
  const { text, images } = describeFlags(flags);
  const { output, usageId } = await runAiStep(
    "feedback_analysis",
    {
      guide: describeGuide(guide.rules),
      current_wording: await currentWording(),
      targets: Object.entries(ENFORCEMENT_TARGETS)
        .map(([key, name]) => `${key}: ${name}`)
        .join("\n"),
      flags: text,
      previous_analysis: await previousAnalysis(),
      decided: await decidedSuggestions(),
    },
    undefined,
    images
  );
  const refToId = (ref: unknown) => flags[Number(String(ref).replace(/\D/g, "")) - 1]?.id;
  const ruleIds = new Set(guide.rules.map((r) => r.id));
  const patterns = (Array.isArray(output?.patterns) ? output.patterns : []).slice(0, 6).map((p: any) => ({
    name: String(p?.name ?? "Pattern").slice(0, 120),
    summary: String(p?.summary ?? ""),
    flagIds: [...new Set((Array.isArray(p?.flagRefs) ? p.flagRefs : []).map(refToId).filter(Boolean))] as string[],
    ruleIds: (Array.isArray(p?.ruleIds) ? p.ruleIds.map(String) : []).filter((id: string) => ruleIds.has(id)),
    rootCause: String(p?.rootCause ?? "other"),
    rootCauseNote: String(p?.rootCauseNote ?? ""),
    trend: String(p?.trend ?? "new"),
    suggestions: Array.isArray(p?.suggestions) ? p.suggestions.slice(0, 2) : [],
  }));
  for (const p of patterns) {
    for (const s of p.suggestions) {
      const target = String(s?.target ?? "");
      if (!(target in ENFORCEMENT_TARGETS) && !/^guide:([A-Z]-\d+|new)$/.test(target)) continue;
      await prisma.analysisSuggestion.create({
        data: {
          analysisId: runId,
          pattern: p.name,
          title: String(s?.title ?? "Suggested fix").slice(0, 200),
          target,
          before: String(s?.before ?? ""),
          after: String(s?.after ?? ""),
          why: String(s?.why ?? ""),
          verify: String(s?.verify ?? ""),
          confidence: ["high", "medium", "low"].includes(s?.confidence) ? s.confidence : "medium",
          flagIds: JSON.stringify(p.flagIds),
          ruleIds: JSON.stringify(p.ruleIds),
        },
      });
    }
  }
  const usage = usageId ? await prisma.aiUsage.findUnique({ where: { id: usageId } }) : null;
  await prisma.feedbackAnalysis.update({
    where: { id: runId },
    data: {
      status: "ready",
      summary: String(output?.summary ?? ""),
      patterns: JSON.stringify(patterns.map(({ suggestions: _s, ...rest }: { suggestions: unknown }) => rest)),
      costUsd: usage?.costUsd ?? null,
    },
  });
}

// --- Trying a suggestion on a test copy of the rules (VSB-104) ---

// The rules with a suggestion's wording applied: "before" replaced by "after",
// or "after" added when "before" is empty or no longer there.
export async function testRulesFor(suggestion: { target: string; before: string; after: string }) {
  const field = PICTURE_RULE_FIELDS[suggestion.target];
  if (!field) return null;
  const { rules } = await getActiveRules();
  const current = String(rules[field] ?? "");
  const next = suggestion.before && current.includes(suggestion.before) ? current.replace(suggestion.before, suggestion.after) : `${current} ${suggestion.after}`.trim();
  return { ...rules, [field]: next } as PageRules;
}

export async function trialFlags(suggestionId: string) {
  const s = await prisma.analysisSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
  return prisma.flag.findMany({ where: { id: { in: parse<string[]>(s.flagIds, []) }, target: { in: ["picture", "both"] }, pageId: { not: null } }, select: { id: true, pageId: true } });
}

const trying = new Set<string>();

export async function startTrial(suggestionId: string) {
  if (trying.has(suggestionId)) throw new Error("Already trying this suggestion.");
  const s = await prisma.analysisSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
  const rules = await testRulesFor(s);
  if (!rules) throw new Error("Try it works for picture wording: art style, how people are drawn, or camera and acting.");
  // Only flags without a finished trial, so trying again fills in failures.
  const done = new Set((await prisma.flagRedraw.findMany({ where: { suggestionId, status: "ready" }, select: { flagId: true } })).map((r) => r.flagId));
  const flags = (await trialFlags(suggestionId)).filter((f) => !done.has(f.id));
  if (!flags.length) throw new Error("Every flagged picture in this pattern already has a trial.");
  trying.add(suggestionId);
  void withUsage({ trigger: "admin" }, async () => {
    for (const f of flags) {
      const row = await prisma.flagRedraw.create({ data: { flagId: f.id, kind: "trial", suggestionId } });
      try {
        const drawn = await drawComparison(f.pageId!, `${f.id}-trial-${Date.now()}.jpg`, rules);
        await prisma.flagRedraw.update({ where: { id: row.id }, data: { status: "ready", ...drawn } });
      } catch (error: any) {
        await prisma.flagRedraw.update({ where: { id: row.id }, data: { status: "failed", error: String(error?.message ?? "Failed").slice(0, 300) } });
      }
    }
  }).finally(() => trying.delete(suggestionId));
  return flags.length;
}

// --- The weekly digest: Monday 8 AM Pacific, when there are new flags ---

const DIGEST_DAY = DAYS.indexOf("Monday");
const DIGEST_HOUR = 8;
const TZ = "America/Los_Angeles";

function lastDigestTime(now: Date) {
  const local = zonedParts(now, TZ);
  let daysBack = (local.weekday - DIGEST_DAY + 7) % 7;
  if (daysBack === 0 && local.hour < DIGEST_HOUR) daysBack = 7;
  const d = new Date(Date.UTC(local.year, local.month - 1, local.day - daysBack));
  return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), DIGEST_HOUR, TZ);
}

async function digestTick() {
  const due = lastDigestTime(new Date());
  if (Date.now() - due.getTime() > 6 * 60 * 60 * 1000) return; // missed by hours: wait for next week
  const already = await prisma.feedbackAnalysis.count({ where: { trigger: "weekly", createdAt: { gte: due } } });
  if (already) return;
  const last = await prisma.feedbackAnalysis.findFirst({ where: { status: "ready" }, orderBy: { createdAt: "desc" } });
  const newFlags = await prisma.flag.count({ where: { createdAt: { gt: last?.createdAt ?? new Date(0) } } });
  if (!newFlags) return;
  const flags = await flagsToAnalyze();
  if (flags.length) await startAnalysis({ trigger: "weekly", filters: { status: "open" }, flagIds: flags.map((f) => f.id) });
}

export function startWeeklyDigest() {
  setInterval(() => void digestTick().catch((e) => console.error("Weekly feedback digest:", e?.message)), 30 * 60 * 1000);
}
