import crypto from "crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "./db";

// Funnel instrumentation (GitHub #2). Where a visitor came from is kept in a
// first-party cookie from their first tagged landing, and each step they take
// is a FunnelEvent, so ads and referrals can be measured end to end. Admin →
// Overview shows the funnel by source and campaign. Kept apart from the app
// cookie (REF_COOKIE in referrals.ts), which decides who gets the credit.

export const ATTR_COOKIE = "sb_attr";
export const VID_COOKIE = "sb_vid";
const REF_COOKIE = "sb_ref"; // referrals.ts
const DAY = 24 * 60 * 60 * 1000;
const production = process.env.NODE_ENV === "production";

// The steps in funnel order. The three the server can't see are reported by
// the visitor's browser; the rest are recorded where they happen.
export const FUNNEL_STEPS = [
  "landing_view",
  "lesson_submitted",
  "preview_started",
  "preview_viewed",
  "preview_completed",
  "signup_verified",
  "first_memory_saved",
  "first_chapter_published",
  "invite_sent",
  "invite_accepted",
  "subscribed",
  "canceled",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];
const CLIENT_STEPS = new Set<FunnelStep>(["landing_view", "preview_viewed", "preview_completed"]);

const ATTR_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "gclid"] as const;

const cookieOpts = (days: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: production, maxAge: days * DAY });

// Every page the app serves can be a landing: a tagged link's first visit sets
// the attribution cookie, and every visitor gets an id. The first tags within
// the cookie's life win, like the referral cookie.
export function captureAttribution(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET") return next();
  if (!req.cookies?.[VID_COOKIE]) res.cookie(VID_COOKIE, crypto.randomUUID(), cookieOpts(400));
  if (!req.cookies?.[ATTR_COOKIE] && ATTR_KEYS.some((k) => typeof req.query[k] === "string" && req.query[k])) {
    const attr = Object.fromEntries(ATTR_KEYS.map((k) => [k, String(req.query[k] ?? "").slice(0, 150)]).filter(([, v]) => v));
    res.cookie(ATTR_COOKIE, JSON.stringify(attr), cookieOpts(180));
  }
  next();
}

interface Attribution {
  visitorId: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  clickId: string | null;
  referral: string | null;
}

function attributionFrom(req: Request): Attribution {
  let attr: Record<string, string> = {};
  try {
    attr = JSON.parse(String(req.cookies?.[ATTR_COOKIE] ?? "{}"));
  } catch {
    attr = {};
  }
  return {
    visitorId: String(req.cookies?.[VID_COOKIE] ?? "unknown"),
    source: attr.utm_source || null,
    medium: attr.utm_medium || null,
    campaign: attr.utm_campaign || null,
    content: attr.utm_content || null,
    clickId: attr.fbclid ? `fb:${attr.fbclid}` : attr.gclid ? `gg:${attr.gclid}` : null,
    referral: typeof req.cookies?.[REF_COOKIE] === "string" ? String(req.cookies[REF_COOKIE]) : null,
  };
}

// Server-side steps with no visitor request of their own (a chapter published
// by a weekly run, a subscription set by an admin) borrow the family's
// attribution from their earliest recorded step.
async function attributionFromHousehold(householdId: string): Promise<Attribution> {
  const first = await prisma.funnelEvent.findFirst({
    where: { householdId },
    orderBy: { createdAt: "asc" },
    select: { visitorId: true, source: true, medium: true, campaign: true, content: true, clickId: true, referral: true },
  });
  return {
    visitorId: first?.visitorId ?? "unknown",
    source: first?.source ?? null,
    medium: first?.medium ?? null,
    campaign: first?.campaign ?? null,
    content: first?.content ?? null,
    clickId: first?.clickId ?? null,
    referral: first?.referral ?? null,
  };
}

// Records a step. Never throws: a lost event must not break the step itself.
export async function recordEvent(req: Request | null, name: FunnelStep, opts: { householdId?: string | null; props?: Record<string, unknown> } = {}) {
  try {
    const a = req ? attributionFrom(req) : opts.householdId ? await attributionFromHousehold(opts.householdId) : null;
    if (!a) return;
    await prisma.funnelEvent.create({
      data: { ...a, name, householdId: opts.householdId ?? null, props: opts.props ? JSON.stringify(opts.props).slice(0, 500) : null },
    });
  } catch (error: any) {
    console.error(`Funnel event ${name} failed:`, error?.message);
  }
}

// The household's first published chapter, from whichever path published it
// (the Publish tap, auto-publish, or a living chapter joining the book).
export async function recordFirstChapterPublished(chapterId: string) {
  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { storybook: { select: { child: { select: { householdId: true } } } } } });
    const householdId = chapter?.storybook.child.householdId;
    if (!householdId) return;
    // Once per family, however many publish paths fire for the same chapter.
    const already = await prisma.funnelEvent.findFirst({ where: { householdId, name: "first_chapter_published" }, select: { id: true } });
    if (already) return;
    const others = await prisma.chapter.count({ where: { id: { not: chapterId }, status: "published", storybook: { child: { householdId } } } });
    if (others === 0) await recordEvent(null, "first_chapter_published", { householdId });
  } catch (error: any) {
    console.error("Funnel event first_chapter_published failed:", error?.message);
  }
}

const router = Router();

// The browser's own steps. One per visitor per step, so a reload or a resumed
// session doesn't double-count.
router.post("/funnel/events", async (req, res) => {
  const name = String(req.body?.name ?? "") as FunnelStep;
  if (!CLIENT_STEPS.has(name)) return res.status(400).json({ error: "Unknown step." });
  const a = attributionFrom(req);
  if (a.visitorId === "unknown") return res.status(204).end();
  const existing = await prisma.funnelEvent.findFirst({ where: { visitorId: a.visitorId, name }, select: { id: true } });
  if (!existing) await recordEvent(req, name);
  res.status(204).end();
});

// Admin → Overview: the funnel for a date range, overall and by source/campaign.
router.get("/admin/funnel", async (req, res) => {
  const to = typeof req.query.to === "string" && req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : new Date();
  const from = typeof req.query.from === "string" && req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * DAY);
  const events = await prisma.funnelEvent.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { name: true, visitorId: true, source: true, campaign: true, referral: true },
  });
  const steps = FUNNEL_STEPS.map((name) => {
    const mine = events.filter((e) => e.name === name);
    return { name, events: mine.length, visitors: new Set(mine.map((e) => e.visitorId)).size };
  });
  interface SourceRow {
    source: string;
    campaign: string | null;
    landing: number;
    preview: number;
    signup: number;
    chapter: number;
    paying: number;
  }
  const KEY = { landing_view: "landing", preview_started: "preview", signup_verified: "signup", first_chapter_published: "chapter", subscribed: "paying" } as const;
  const rows = new Map<string, { row: SourceRow; sets: Record<string, Set<string>> }>();
  for (const e of events) {
    const source = e.source ?? (e.referral ? "referral" : "direct");
    const key = `${source} ${e.campaign ?? ""}`;
    let r = rows.get(key);
    if (!r) {
      r = { row: { source, campaign: e.campaign, landing: 0, preview: 0, signup: 0, chapter: 0, paying: 0 }, sets: {} };
      rows.set(key, r);
    }
    const col = KEY[e.name as keyof typeof KEY];
    if (col) {
      (r.sets[col] ??= new Set()).add(e.visitorId);
      r.row[col] = r.sets[col].size;
    }
  }
  const sources = [...rows.values()].map((r) => r.row).sort((a, b) => b.landing - a.landing);
  res.json({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), steps, sources });
});

export default router;
