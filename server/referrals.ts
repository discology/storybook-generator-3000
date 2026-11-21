import crypto from "crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "./db";
import { requireMember } from "./access";
import { appUrl } from "./messageTemplates";

// Family-to-family referral (GitHub #3). Each family has a short code; its
// /r/<code> link drops a first-party cookie and lands on /try. When someone
// then saves a storybook of their own, the new family remembers who brought it.
// A relative joining an existing family is an invitation, not a referral.

export const REF_COOKIE = "sb_ref";
const REF_DAYS = 30;
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i
const CODE_PATTERN = /^[a-z0-9]{8}$/;

const newCode = () => Array.from(crypto.randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

export async function referralCodeFor(householdId: string): Promise<string> {
  const household = await prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { referralCode: true } });
  if (household.referralCode) return household.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    // Only sets a code if none was set meanwhile; a clash on the unique index retries.
    const set = await prisma.household
      .updateMany({ where: { id: householdId, referralCode: null }, data: { referralCode: code } })
      .catch((error) => (error?.code === "P2002" ? null : Promise.reject(error)));
    if (set) {
      const after = await prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { referralCode: true } });
      if (after.referralCode) return after.referralCode;
    }
  }
  throw new Error("Couldn't make a referral code.");
}

const referralUrl = (code: string) => appUrl(`/r/${code}`);

function setRefCookie(res: Response, code: string) {
  res.cookie(REF_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: REF_DAYS * 24 * 60 * 60 * 1000,
  });
}

export async function referralLanding(req: Request, res: Response) {
  const code = String(req.params.code ?? "").toLowerCase();
  const known = CODE_PATTERN.test(code) && (await prisma.household.count({ where: { referralCode: code } })) > 0;
  if (known) setRefCookie(res, code);
  res.redirect(302, known ? `/try?ref=${code}` : "/try");
}

// A page opened with ?ref=<code> (the landing page passing it through) counts
// like the link. The first referrer within the cookie's life wins.
export function captureReferral(req: Request, res: Response, next: NextFunction) {
  const code = typeof req.query.ref === "string" ? req.query.ref.toLowerCase() : "";
  if (req.method === "GET" && CODE_PATTERN.test(code) && !req.cookies?.[REF_COOKIE]) setRefCookie(res, code);
  next();
}

// Called when a household gets its owner. Never attributes a family to itself
// or to a family the same person owns, and never overwrites an attribution.
export async function attributeReferral(req: Request, householdId: string, userId: string) {
  const code = String(req.cookies?.[REF_COOKIE] ?? "").toLowerCase();
  if (!CODE_PATTERN.test(code)) return null;
  const referrer = await prisma.household.findUnique({ where: { referralCode: code }, select: { id: true, ownerUserId: true } });
  if (!referrer || referrer.id === householdId || referrer.ownerUserId === userId) return null;
  const updated = await prisma.household.updateMany({
    where: { id: householdId, referredByHouseholdId: null },
    data: { referredByHouseholdId: referrer.id, referredByUserId: userId },
  });
  return updated.count ? referrer.id : null;
}

const router = Router();

router.get("/storybooks/:id/referral", async (req, res) => {
  const member = await requireMember(req, res, req.params.id);
  if (!member) return;
  const code = await referralCodeFor(member.storybook.child.householdId);
  res.json({ code, url: referralUrl(code) });
});

// Admin → Overview: invites (relatives joining) and referrals (new families)
// per referring family, with the loop's base rates.
router.get("/admin/referrals", async (_req, res) => {
  const [invites, referred, families] = await Promise.all([
    prisma.invitation.groupBy({ by: ["householdId", "status"], _count: { _all: true } }),
    prisma.household.findMany({
      where: { referredByHouseholdId: { not: null } },
      select: { referredByHouseholdId: true, subscription: { select: { paidAt: true } } },
    }),
    prisma.household.count({ where: { ownerUserId: { not: null }, isSample: false } }),
  ]);
  const rows = new Map<string, { householdId: string; invitesSent: number; invitesAccepted: number; referralSignups: number; referralPaid: number }>();
  const row = (id: string) => {
    if (!rows.has(id)) rows.set(id, { householdId: id, invitesSent: 0, invitesAccepted: 0, referralSignups: 0, referralPaid: 0 });
    return rows.get(id)!;
  };
  for (const i of invites) {
    row(i.householdId).invitesSent += i._count._all;
    if (i.status === "accepted") row(i.householdId).invitesAccepted += i._count._all;
  }
  for (const h of referred) {
    const r = row(h.referredByHouseholdId!);
    r.referralSignups += 1;
    if (h.subscription?.paidAt) r.referralPaid += 1;
  }
  const ids = [...rows.keys()];
  const names = await prisma.household.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, children: { select: { displayName: true }, take: 1 } },
  });
  const label = new Map(names.map((h) => [h.id, h.name || h.children[0]?.displayName || "A family"]));
  const list = [...rows.values()].map((r) => ({ ...r, family: label.get(r.householdId) ?? "A family" }));
  const sum = (k: "invitesSent" | "invitesAccepted" | "referralSignups" | "referralPaid") => list.reduce((n, r) => n + r[k], 0);
  const totals = { families, invitesSent: sum("invitesSent"), invitesAccepted: sum("invitesAccepted"), referralSignups: sum("referralSignups"), referralPaid: sum("referralPaid") };
  res.json({
    totals,
    // New families per existing family: the referral loop's viral coefficient.
    kFactor: families ? totals.referralSignups / families : 0,
    families: list.sort((a, b) => b.referralSignups - a.referralSignups || b.invitesSent - a.invitesSent),
  });
});

export default router;
