import { prisma } from "./db";
import { Prisma } from "../src/generated/prisma/client";
import { currentTrigger } from "./aiUsage";
import { overSpendCap } from "./spendCaps";

// What a household may make, and the one place a chapter is admitted. Plans are
// rows (prisma Plan); credits are an append-only ledger (CreditEntry). A chapter
// is paid for by a "chapter_spend" row written when it starts and reversed by a
// "chapter_refund" row if it fails, so a failed chapter costs nothing.

export const PAST_DUE_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const GENERATION = "Generation";

type Db = Prisma.TransactionClient | typeof prisma;

export type Pool = "allowance" | "credits";
export type Refusal = "paywall" | "quota" | "past_due" | "capped";
export type EntitlementReason = "grandfathered" | "sample" | "free" | "plan" | "past_due_grace" | "credits_only";

export type Entitlements = {
  planId: string;
  status: string; // the subscription's status, or "none"
  reason: EntitlementReason;
  allowance: number | null; // chapters this period from the plan; null is unlimited
  allowanceUsed: number;
  periodStart: Date | null; // null for a lifetime allowance
  credits: number;
  maxPages: number | null;
  maxStage: number | null;
  seats: number | null;
  maxChildren: number | null;
};

export type Admission = { ok: true; pool: Pool } | { ok: false; why: Refusal };

export class ChapterRefused extends Error {
  constructor(readonly why: Refusal) {
    super(why);
  }
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

function periodStart(period: string, now: Date) {
  return period === "lifetime" ? null : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function allowanceUsed(db: Db, householdId: string, since: Date | null) {
  const spends = await db.creditEntry.findMany({
    where: { householdId, pool: "allowance", reason: "chapter_spend", ...(since ? { createdAt: { gte: since } } : {}) },
    select: { refId: true },
  });
  if (spends.length === 0) return 0;
  // A refund cancels its own spend, whichever month it lands in.
  const refunded = await db.creditEntry.count({
    where: { householdId, reason: "chapter_refund", refType: GENERATION, refId: { in: spends.map((s) => s.refId!).filter(Boolean) } },
  });
  return spends.length - refunded;
}

async function creditBalance(db: Db, householdId: string) {
  const sum = await db.creditEntry.aggregate({ where: { householdId, pool: "credits" }, _sum: { delta: true } });
  return sum._sum.delta ?? 0;
}

async function resolve(db: Db, householdId: string, now: Date): Promise<Entitlements> {
  const household = await db.household.findUniqueOrThrow({
    where: { id: householdId },
    select: { grandfathered: true, isSample: true, subscription: { include: { plan: true } } },
  });
  const sub = household.subscription;
  const free = await db.plan.findUniqueOrThrow({ where: { id: "free" } });

  let plan = free;
  let reason: EntitlementReason = "free";
  let allowance: number | null = free.chapterAllowance;
  if (sub && (sub.status === "active" || sub.status === "trialing")) {
    plan = sub.plan;
    reason = "plan";
    allowance = plan.chapterAllowance;
  } else if (sub?.status === "past_due") {
    plan = sub.plan;
    const since = sub.pastDueSince ?? sub.updatedAt;
    const inGrace = now.getTime() - since.getTime() < PAST_DUE_GRACE_DAYS * DAY_MS;
    reason = inGrace ? "past_due_grace" : "credits_only";
    allowance = inGrace ? plan.chapterAllowance : 0;
  }
  if (household.grandfathered || household.isSample) {
    reason = household.isSample ? "sample" : "grandfathered";
    allowance = null;
  }

  const start = periodStart(plan.allowancePeriod, now);
  const [used, credits] = await Promise.all([allowanceUsed(db, householdId, start), creditBalance(db, householdId)]);
  return {
    planId: plan.id,
    status: sub?.status ?? "none",
    reason,
    allowance,
    allowanceUsed: used,
    periodStart: start,
    credits,
    maxPages: plan.maxPagesPerChapter,
    maxStage: plan.maxReadingStage,
    seats: plan.familySeats,
    maxChildren: plan.maxChildren,
  };
}

export const entitlements = (householdId: string, now = new Date()) => resolve(prisma, householdId, now);

// A refusal by plan is the family's to settle by paying; a spend cap is ours,
// and it lifts by itself, so it isn't "payment required".
export const refusalStatus = (why: Refusal) => (why === "capped" ? 503 : 402);

function refusal(e: Entitlements): Refusal {
  if (e.reason === "credits_only") return "past_due";
  return e.reason === "free" ? "paywall" : "quota";
}

function decide(e: Entitlements, spending: 0 | 1): Admission {
  // `spending` is 1 when the candidate spend row is already counted in e.
  if (e.allowance === null || e.allowanceUsed - spending < e.allowance) return { ok: true, pool: "allowance" };
  if (e.credits > 0) return { ok: true, pool: "credits" };
  return { ok: false, why: refusal(e) };
}

export async function canGenerateChapter(householdId: string, now = new Date()): Promise<Admission> {
  // The cap on what this kind of work may spend comes first: no plan, however
  // generous, spends past it (server/spendCaps.ts).
  if (await overSpendCap(currentTrigger(), now)) return { ok: false, why: "capped" };
  return decide(await entitlements(householdId, now), 0);
}

// One reservation at a time in this process. Concurrent interactive
// transactions on SQLite wait in its busy handler, and 20 of them at once (for
// one family or for 20) stalled Prisma's engine until its socket timeout in the
// tests, so they queue here instead; each takes a few milliseconds. The app
// runs on one machine (SQLite), so this covers every request, and the
// write-first transaction still keeps the count and the spend together.
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(run);
  queue = next;
  return next;
}

// Reserves one chapter for `key`. Safe to call twice with the same key, and
// safe under concurrency: requests for a household are queued, and the spend
// row is written first, which takes SQLite's write lock before anything is
// counted, so two requests can't both see the last chapter as free.
export function reserveChapter(householdId: string, key: string, now = new Date()): Promise<Admission> {
  return oneAtATime(() => reserveNow(householdId, key, now));
}

async function reserveNow(householdId: string, key: string, now: Date): Promise<Admission> {
  const existing = await prisma.creditEntry.findUnique({
    where: { householdId_reason_refType_refId: { householdId, reason: "chapter_spend", refType: GENERATION, refId: key } },
  });
  if (existing) {
    const refunded = await prisma.creditEntry.count({ where: { householdId, reason: "chapter_refund", refType: GENERATION, refId: key } });
    if (refunded) throw new Error(`Chapter key ${key} was already refunded; use a new key.`);
    return { ok: true, pool: existing.pool as Pool };
  }
  try {
    return await prisma.$transaction(
      async (tx) => {
        const spend = await tx.creditEntry.create({
          data: { householdId, delta: -1, pool: "allowance", reason: "chapter_spend", refType: GENERATION, refId: key },
        });
        const e = await resolve(tx, householdId, now);
        if (e.allowance === null || e.allowanceUsed <= e.allowance) return { ok: true as const, pool: "allowance" as const };
        // Over the allowance: the same spend comes out of credits instead. The
        // row is still uncommitted, so this isn't an edit of the ledger.
        if (e.credits > 0) {
          await tx.creditEntry.update({ where: { id: spend.id }, data: { pool: "credits" } });
          return { ok: true as const, pool: "credits" as const };
        }
        throw new ChapterRefused(refusal(e));
      },
      { maxWait: 15_000, timeout: 15_000 }
    );
  } catch (error) {
    if (error instanceof ChapterRefused) return { ok: false, why: error.why };
    if (isUniqueViolation(error)) return reserveNow(householdId, key, now);
    throw error;
  }
}

// Gives back a reserved chapter. A second refund for the same key does nothing.
export async function refundChapter(householdId: string, key: string) {
  const spend = await prisma.creditEntry.findUnique({
    where: { householdId_reason_refType_refId: { householdId, reason: "chapter_spend", refType: GENERATION, refId: key } },
  });
  if (!spend) return false;
  try {
    await prisma.creditEntry.create({
      data: { householdId, delta: 1, pool: spend.pool, reason: "chapter_refund", refType: GENERATION, refId: key },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export type Grant = { delta: number; reason: "admin_comp" | "topup" | "referral_reward" | "referred_welcome" | "expiry"; refType?: string; refId?: string; note?: string };

// Adds credits. A grant with the same reason and reference is only ever written once.
export async function grantCredits(householdId: string, grant: Grant) {
  if (!Number.isInteger(grant.delta) || grant.delta === 0) throw new Error("A grant is a whole, non-zero number of chapters.");
  const data = { householdId, pool: "credits", ...grant, refType: grant.refType ?? null, refId: grant.refId ?? null };
  try {
    return { created: true, entry: await prisma.creditEntry.create({ data }) };
  } catch (error) {
    if (!isUniqueViolation(error) || !grant.refId) throw error;
    const entry = await prisma.creditEntry.findFirstOrThrow({ where: { householdId, reason: grant.reason, refType: data.refType, refId: grant.refId } });
    return { created: false, entry };
  }
}

// Runs `make` as an admitted chapter: reserved first, refunded if it throws or
// makes nothing (null). Returns the refusal instead of calling `make`.
export async function withChapterAdmission<T>(
  householdId: string,
  key: string,
  make: (e: Entitlements) => Promise<T | null>
): Promise<{ ok: true; value: T | null } | { ok: false; why: Refusal }> {
  if (await overSpendCap(currentTrigger())) return { ok: false, why: "capped" };
  const admission = await reserveChapter(householdId, key);
  if (!admission.ok) return admission;
  try {
    const value = await make(await entitlements(householdId));
    if (value === null) await refundChapter(householdId, key);
    return { ok: true, value };
  } catch (error) {
    await refundChapter(householdId, key).catch(() => undefined);
    throw error;
  }
}

export const REFUSAL_MESSAGES: Record<Refusal, string> = {
  paywall: "Your free chapter is in the book. More chapters come with the Family plan.",
  quota: "This month's chapters are all made. The next one comes after the 1st.",
  past_due: "The Family plan's payment is overdue, so new chapters are paused until it's paid.",
  capped: "Vambie has made all the stories it can for now. This starts again shortly, and nothing you've asked for is lost.",
};
