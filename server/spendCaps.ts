import { prisma } from "./db";
import { adminPhones } from "./admin";
import type { Trigger } from "./aiUsage";

// Spend guardrails (#13). Before this the only backstop was the visitors' 100
// free previews a day, about $40, and nothing at all stopped one family from
// asking for redraws until the bill hurt.
//
// Two kinds of limit:
//   * a global cap per day and per calendar month on what each trigger spends
//     (server/aiUsage.ts tags every call with what started it);
//   * a per-household count of redraws and rewrites, per chapter and per week.
//
// Caps are read from AppSetting on every check, so changing one in the admin
// panel takes effect at once without a restart.

export const CAP_TRIGGERS: Trigger[] = ["family", "weekly", "admin", "visitor", "system"];
export type CapPeriod = "daily" | "monthly";
export const CAP_PERIODS: CapPeriod[] = ["daily", "monthly"];

// US dollars. null is no cap. Only visitors start with one: they're the only
// people who spend our money without ever having asked to be a customer.
export const DEFAULT_CAPS: Record<Trigger, Record<CapPeriod, number | null>> = {
  visitor: { daily: 40, monthly: 600 },
  family: { daily: null, monthly: null },
  weekly: { daily: null, monthly: null },
  admin: { daily: null, monthly: null },
  system: { daily: null, monthly: null },
};

export const DEFAULT_REDRAWS_PER_CHAPTER = 12;
export const DEFAULT_REDRAWS_PER_WEEK = 40;
// Redraws and rewrites a person asked for. Automatic character fixes (page_fix)
// aren't anyone's choice, so they're not counted against a family.
const ASKED_FOR_STEPS = ["page_redraw", "page_revise"];
const WEEK_MS = 7 * 86_400_000;

const capKey = (trigger: Trigger, period: CapPeriod) => `spend_cap:${trigger}:${period}`;
const REDRAW_KEYS = { chapter: "redraw_cap:chapter", week: "redraw_cap:week" } as const;

const whole = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
};

async function settings(prefix: string) {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: prefix } } });
  return new Map(rows.map((r) => [r.key, r.value]));
}

export type Caps = Record<Trigger, Record<CapPeriod, number | null>>;

export async function spendCaps(): Promise<Caps> {
  const saved = await settings("spend_cap:");
  const read = (trigger: Trigger, period: CapPeriod) => {
    const value = saved.get(capKey(trigger, period));
    if (value === undefined) return DEFAULT_CAPS[trigger][period];
    const n = Number(value);
    // An empty or unreadable setting means "no cap", never "cap of zero".
    return value.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n;
  };
  return Object.fromEntries(CAP_TRIGGERS.map((t) => [t, { daily: read(t, "daily"), monthly: read(t, "monthly") }])) as Caps;
}

export async function setSpendCap(trigger: Trigger, period: CapPeriod, value: number | null) {
  const key = capKey(trigger, period);
  const stored = value === null ? "" : String(value);
  await prisma.appSetting.upsert({ where: { key }, update: { value: stored }, create: { key, value: stored } });
}

export async function redrawCaps() {
  const saved = await settings("redraw_cap:");
  return {
    perChapter: whole(saved.get(REDRAW_KEYS.chapter), DEFAULT_REDRAWS_PER_CHAPTER),
    perWeek: whole(saved.get(REDRAW_KEYS.week), DEFAULT_REDRAWS_PER_WEEK),
  };
}

export async function setRedrawCaps(perChapter: number, perWeek: number) {
  await prisma.appSetting.upsert({ where: { key: REDRAW_KEYS.chapter }, update: { value: String(perChapter) }, create: { key: REDRAW_KEYS.chapter, value: String(perChapter) } });
  await prisma.appSetting.upsert({ where: { key: REDRAW_KEYS.week }, update: { value: String(perWeek) }, create: { key: REDRAW_KEYS.week, value: String(perWeek) } });
}

// The start of today and of this month, in UTC, like the plans' allowance period.
export function periodStart(period: CapPeriod, now = new Date()) {
  return period === "daily"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const spentSince = async (trigger: Trigger, since: Date) =>
  (await prisma.aiUsage.aggregate({ _sum: { costUsd: true }, where: { trigger, createdAt: { gte: since } } }))._sum.costUsd ?? 0;

export interface CapStatus {
  trigger: Trigger;
  spent: Record<CapPeriod, number>;
  caps: Record<CapPeriod, number | null>;
  // The period whose cap is used up, if any. Spending stops at 100%.
  reached: CapPeriod | null;
  share: number | null; // how much of the tightest cap is used, 0–1+
}

export async function capStatus(trigger: Trigger, now = new Date()): Promise<CapStatus> {
  const caps = (await spendCaps())[trigger];
  const [daily, monthly] = await Promise.all(CAP_PERIODS.map((p) => spentSince(trigger, periodStart(p, now))));
  const spent = { daily, monthly };
  const shares = CAP_PERIODS.filter((p) => caps[p] !== null).map((p) => ({ period: p, share: caps[p]! > 0 ? spent[p] / caps[p]! : Infinity }));
  const tightest = shares.sort((a, b) => b.share - a.share)[0];
  return { trigger, spent, caps, reached: tightest && tightest.share >= 1 ? tightest.period : null, share: tightest ? tightest.share : null };
}

export const overSpendCap = async (trigger: Trigger, now = new Date()) => (await capStatus(trigger, now)).reached !== null;

export const spendReport = (now = new Date()) => Promise.all(CAP_TRIGGERS.map((t) => capStatus(t, now)));

// --- Alerts ---

const ALERT_SHARES = [0.5, 0.8, 1];
// Checking on every recorded call would mean a query per call; once a minute per
// trigger is soon enough to text someone before much more is spent.
const CHECKED_EVERY_MS = 60_000;
const lastChecked = new Map<string, number>();

// Texts the admins the first time each trigger passes 50%, 80% and 100% of a
// cap in a period. Never throws: recording a call must not fail on an alert.
export async function alertOnSpend(trigger: Trigger, now = new Date()) {
  try {
    const status = await capStatus(trigger, now);
    for (const period of CAP_PERIODS) {
      const cap = status.caps[period];
      if (cap === null) continue;
      const share = cap > 0 ? status.spent[period] / cap : 1;
      const passed = ALERT_SHARES.filter((s) => share >= s);
      if (!passed.length) continue;
      const highest = passed[passed.length - 1];
      const stamp = period === "daily" ? periodStart("daily", now).toISOString().slice(0, 10) : periodStart("monthly", now).toISOString().slice(0, 7);
      const key = `spend_alert:${trigger}:${period}:${stamp}:${highest}`;
      // The row is the record that this one was sent; writing it twice fails.
      try {
        await prisma.appSetting.create({ data: { key, value: new Date().toISOString() } });
      } catch {
        continue;
      }
      const body =
        `Vambie spend: ${trigger} is at ${Math.round(share * 100)}% of its ${period === "daily" ? "daily" : "monthly"} cap ` +
        `($${status.spent[period].toFixed(2)} of $${cap.toFixed(2)}).` +
        (share >= 1 ? ` New ${trigger} work is paused until the ${period === "daily" ? "next day" : "1st"}.` : "");
      // Imported here, not at the top: server/texts.ts records its own AI-free
      // usage through aiUsage, which reads this file.
      const { sendText } = await import("./texts");
      for (const phone of adminPhones()) await sendText({ event: `spend_cap:${trigger}`, to: { phone }, body });
      if (!adminPhones().length) console.warn(body);
    }
  } catch (error: any) {
    console.error("Spend cap alert:", error?.message);
  }
}

// Called after every recorded AI call (server/aiUsage.ts), in the background.
export function noteSpend(trigger: Trigger) {
  const last = lastChecked.get(trigger) ?? 0;
  if (Date.now() - last < CHECKED_EVERY_MS) return;
  lastChecked.set(trigger, Date.now());
  void alertOnSpend(trigger);
}

// --- Per-household redraws ---

export interface RedrawUse {
  chapter: number;
  week: number;
  perChapter: number;
  perWeek: number;
}

export async function redrawUse(householdId: string, chapterId: string, now = new Date()): Promise<RedrawUse> {
  const caps = await redrawCaps();
  const [chapter, week] = await Promise.all([
    prisma.aiUsage.count({ where: { chapterId, step: { in: ASKED_FOR_STEPS } } }),
    prisma.aiUsage.count({ where: { householdId, step: { in: ASKED_FOR_STEPS }, createdAt: { gte: new Date(now.getTime() - WEEK_MS) } } }),
  ]);
  return { chapter, week, perChapter: caps.perChapter, perWeek: caps.perWeek };
}

// The message to show the family, or null when they can ask for another.
export async function redrawRefusal(householdId: string, chapterId: string, now = new Date()): Promise<string | null> {
  const use = await redrawUse(householdId, chapterId, now);
  if (use.chapter >= use.perChapter) return `This chapter has had its ${use.perChapter} redraws. Tell us what's wrong with "Something's off" and we'll look at it.`;
  if (use.week >= use.perWeek) return `That's ${use.perWeek} redraws this week, which is our limit. They start again in a few days.`;
  return null;
}
