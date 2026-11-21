import crypto from "crypto";
import { Router } from "express";
import { prisma } from "./db";
import { entitlements, grantCredits } from "./entitlements";

// Admin: a household's plan, ledger and comps. Stripe will write subscriptions
// later (GitHub #1); until then an admin can set one by hand, e.g. to comp a family.

const router = Router();

router.get("/admin/households/:id/plan", async (req, res) => {
  const household = await prisma.household.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!household) return res.status(404).json({ error: "Not found" });
  const [plan, ledger] = await Promise.all([
    entitlements(household.id),
    prisma.creditEntry.findMany({ where: { householdId: household.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  res.json({ plan, ledger });
});

router.post("/admin/households/:id/credits", async (req, res) => {
  const delta = Number(req.body?.delta);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 24) return res.status(400).json({ error: "Give between 1 and 24 chapters (or take some back with a negative number)." });
  const household = await prisma.household.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!household) return res.status(404).json({ error: "Not found" });
  // The request id makes a double-click one comp, not two.
  const requestId = typeof req.body?.requestId === "string" && req.body.requestId ? req.body.requestId.slice(0, 64) : crypto.randomUUID();
  const { created } = await grantCredits(household.id, {
    delta,
    reason: "admin_comp",
    refType: "AdminRequest",
    refId: requestId,
    note: String(req.body?.note ?? "").slice(0, 200) || undefined,
  });
  const plan = await entitlements(household.id);
  res.status(created ? 201 : 200).json({ created, credits: plan.credits });
});

const STATUSES = new Set(["trialing", "active", "past_due", "canceled"]);

router.put("/admin/households/:id/subscription", async (req, res) => {
  const planId = String(req.body?.planId ?? "");
  const status = String(req.body?.status ?? "");
  if (!STATUSES.has(status)) return res.status(400).json({ error: "Status is trialing, active, past_due or canceled." });
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return res.status(400).json({ error: "No such plan." });
  const existing = await prisma.subscription.findUnique({ where: { householdId: req.params.id } });
  // Grace runs from when payment first went overdue, not from the latest edit.
  const pastDueSince = status === "past_due" ? (existing?.status === "past_due" ? existing.pastDueSince : new Date()) : null;
  const canceledAt = status === "canceled" ? (existing?.canceledAt ?? new Date()) : null;
  await prisma.subscription.upsert({
    where: { householdId: req.params.id },
    create: { householdId: req.params.id, planId, status, pastDueSince, canceledAt },
    update: { planId, status, pastDueSince, canceledAt },
  });
  res.json({ plan: await entitlements(req.params.id) });
});

export default router;
