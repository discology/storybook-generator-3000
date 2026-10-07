import { prisma } from "./db";
import { createPagedChapter, recordedBy } from "./storyPages";
import { withUsage } from "./aiUsage";

// Each week's memories become one chapter, made at 6 AM (the family's time)
// the morning after their weekly reminder, so memories recorded in answer to
// the reminder still make it in. Parents can also make it right away.

export const TIMEZONES: Record<string, string> = {
  "Pacific Time": "America/Los_Angeles",
  "Mountain Time": "America/Denver",
  "Central Time": "America/Chicago",
  "Eastern Time": "America/New_York",
  "Alaska Time": "America/Anchorage",
  "Hawaii Time": "Pacific/Honolulu",
};

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const BATCH_HOUR = 6;
const TICK_MS = 5 * 60 * 1000;

const generating = new Set<string>();
const lastErrors = new Map<string, string>();

export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "long",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: +get("year"), month: +get("month"), day: +get("day"), hour: +get("hour"), minute: +get("minute"), weekday: DAYS.indexOf(get("weekday")) };
}

// The UTC instant of a wall-clock time in a time zone.
export function zonedToUtc(year: number, month: number, day: number, hour: number, timeZone: string, minute = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const seen = zonedParts(new Date(guess), timeZone);
  const offset = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) - guess;
  return new Date(guess - offset);
}

// The most recent scheduled batch time at or before `now`.
export function lastScheduledBatch(storybook: { reminderDay: string; reminderTimezone: string }, now = new Date()) {
  const tz = TIMEZONES[storybook.reminderTimezone] ?? TIMEZONES["Pacific Time"];
  const batchDay = (Math.max(0, DAYS.indexOf(storybook.reminderDay)) + 1) % 7;
  const local = zonedParts(now, tz);
  let daysBack = (local.weekday - batchDay + 7) % 7;
  if (daysBack === 0 && local.hour < BATCH_HOUR) daysBack = 7;
  const d = new Date(Date.UTC(local.year, local.month - 1, local.day - daysBack));
  return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), BATCH_HOUR, tz);
}

export function nextScheduledBatch(storybook: { reminderDay: string; reminderTimezone: string }, now = new Date()) {
  const last = lastScheduledBatch(storybook, now);
  return lastScheduledBatch(storybook, new Date(last.getTime() + 8 * 24 * 60 * 60 * 1000));
}

// Interpreted memories the family allowed in stories that no chapter used yet.
export const eligibleMemories = (storybookId: string) =>
  prisma.memory.findMany({
    where: { storybookId, storyUseConsent: true, status: "interpreted", chapterSources: { none: {} } },
    include: { transcripts: { orderBy: { createdAt: "desc" }, take: 1 }, interpretation: true, contributor: true },
    orderBy: { recordedAt: "asc" },
  });

export const isGenerating = (storybookId: string) => generating.has(storybookId);
export const lastBatchError = (storybookId: string) => lastErrors.get(storybookId) ?? null;

// Makes this week's chapter now. Returns the chapter, or null if there was nothing to make.
export async function makeWeeklyChapter(storybookId: string) {
  if (generating.has(storybookId)) return null;
  generating.add(storybookId);
  lastErrors.delete(storybookId);
  try {
    const storybook = await prisma.storybook.findUniqueOrThrow({ where: { id: storybookId } });
    const memories = await eligibleMemories(storybookId);
    if (memories.length === 0) {
      await prisma.storybook.update({ where: { id: storybookId }, data: { lastBatchAt: new Date() } });
      return null;
    }
    let castKeys: string[] = [];
    try {
      castKeys = JSON.parse(storybook.pendingCastKeys);
    } catch {
      castKeys = [];
    }
    const chapter = await createPagedChapter({
      storybookId,
      castKeys,
      memories: memories.map((m) => ({
        id: m.id,
        transcript: m.transcripts[0]?.text ?? "",
        events: m.interpretation?.events ?? "",
        emotions: m.interpretation?.emotions ?? "",
        themes: m.interpretation?.themes ?? "",
        recordedBy: recordedBy(m.contributor),
      })),
    });
    await prisma.memory.updateMany({ where: { id: { in: memories.map((m) => m.id) } }, data: { status: "ready" } });
    await prisma.storybook.update({ where: { id: storybookId }, data: { lastBatchAt: new Date(), pendingCastKeys: "[]" } });
    return chapter;
  } catch (error: any) {
    // Recorded so the family sees it; not retried automatically, so a failing
    // AI call can't repeat every few minutes. "Make it now" tries again.
    lastErrors.set(storybookId, error?.message ?? "Something went wrong");
    await prisma.storybook.update({ where: { id: storybookId }, data: { lastBatchAt: new Date() } }).catch(() => undefined);
    console.error(`Weekly chapter for ${storybookId} failed:`, error?.message ?? error);
    throw error;
  } finally {
    generating.delete(storybookId);
  }
}

async function tick() {
  const now = new Date();
  const storybooks = await prisma.storybook.findMany({ where: { status: "active" } });
  for (const sb of storybooks) {
    const due = lastScheduledBatch(sb, now);
    if (due <= (sb.lastBatchAt ?? sb.createdAt)) continue;
    await withUsage({ trigger: "weekly" }, () => makeWeeklyChapter(sb.id)).catch(() => undefined);
  }
}

export function startWeeklyChapters() {
  setTimeout(() => void tick().catch((e) => console.error("Weekly chapters:", e)), 30_000);
  setInterval(() => void tick().catch((e) => console.error("Weekly chapters:", e)), TICK_MS);
}
