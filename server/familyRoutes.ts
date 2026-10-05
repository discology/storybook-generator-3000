import crypto from "crypto";
import express, { Router } from "express";
import { prisma } from "./db";
import { getCurrentUser } from "./session";
import { renderMessage, appUrl } from "./messageTemplates";

const router: Router = express.Router();

router.get("/storybooks/:id/family", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const storybook = await prisma.storybook.findUnique({
    where: { id: req.params.id },
    include: { child: { include: { household: { include: { contributors: { orderBy: { createdAt: "asc" } } } } } } },
  });
  if (!storybook) return res.status(404).json({ error: "Storybook not found" });
  const me = storybook.child.household.contributors.find((c) => c.userId === user.id);
  if (!me) return res.status(403).json({ error: "access_denied" });

  res.json({ contributors: storybook.child.household.contributors, myContributorId: me.id });
});

router.post("/storybooks/:id/family/invite", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const { contact, relationship } = req.body ?? {};
  if (!contact || !String(contact).trim()) return res.status(400).json({ error: "contact is required" });

  const storybook = await prisma.storybook.findUnique({
    where: { id: req.params.id },
    include: { child: { include: { household: { include: { contributors: true } } } } },
  });
  if (!storybook) return res.status(404).json({ error: "Storybook not found" });
  const me = storybook.child.household.contributors.find((c) => c.userId === user.id);
  if (!me) return res.status(403).json({ error: "access_denied" });

  const contributor = await prisma.contributor.create({
    data: {
      householdId: storybook.child.householdId,
      name: String(contact).trim(),
      relationship: relationship || null,
      role: "contributor",
      inviteStatus: "pending",
    },
  });

  const token = crypto.randomBytes(16).toString("hex");
  const invitation = await prisma.invitation.create({
    data: {
      householdId: storybook.child.householdId,
      contributorId: contributor.id,
      invitedByName: me.name,
      contact: String(contact).trim(),
      relationship: relationship || null,
      token,
    },
  });

  // Dev mode: texting invites needs a Twilio sending number, which isn't set up yet,
  // so the invite text (from the admin-editable template) is returned for the
  // inviter to send themselves. inviteMessage is null if admins turned invites off.
  const inviteLink = `/invitations/${token}`;
  const inviteMessage = await renderMessage("invite", {
    inviter_name: me.name,
    child_name: storybook.child.displayName,
    relationship: relationship || "family member",
    storybook_title: storybook.title,
    invite_url: appUrl(inviteLink),
  });
  res.status(201).json({ contributor, invitation, inviteLink, inviteMessage, devMode: true });
});

router.delete("/family/:contributorId", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const contributor = await prisma.contributor.findUnique({ where: { id: req.params.contributorId } });
  if (!contributor) return res.status(404).json({ error: "Not found" });

  await prisma.invitation.updateMany({ where: { contributorId: contributor.id }, data: { status: "revoked" } });
  await prisma.contributor.update({ where: { id: contributor.id }, data: { inviteStatus: "revoked" } });
  res.json({ ok: true });
});

// --- Invitation acceptance (token-based, no storybook id needed) ---
router.get("/invitations/:token", async (req, res) => {
  const invitation = await prisma.invitation.findUnique({
    where: { token: req.params.token },
    include: {
      household: { include: { children: { include: { storybooks: true } } } },
    },
  });
  if (!invitation) return res.status(404).json({ error: "not_found" });

  if (invitation.status === "revoked") return res.status(410).json({ error: "revoked" });
  const expired = Date.now() - invitation.createdAt.getTime() > 1000 * 60 * 60 * 24 * 14; // 14 days
  if (expired && invitation.status === "pending") return res.status(410).json({ error: "expired" });

  const child = invitation.household.children[0];
  res.json({
    status: invitation.status,
    invitedByName: invitation.invitedByName,
    relationship: invitation.relationship,
    childName: child?.displayName ?? "their child",
    storybookTitle: child?.storybooks[0]?.title ?? null,
    storybookId: child?.storybooks[0]?.id ?? null,
  });
});

router.post("/invitations/:token/accept", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const invitation = await prisma.invitation.findUnique({ where: { token: req.params.token } });
  if (!invitation) return res.status(404).json({ error: "not_found" });
  if (invitation.status !== "pending") return res.status(410).json({ error: invitation.status });

  await prisma.contributor.update({
    where: { id: invitation.contributorId },
    data: { userId: user.id, inviteStatus: "joined", name: user.name || user.phone || "Contributor" },
  });
  await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "accepted", respondedAt: new Date() } });

  const household = await prisma.household.findUnique({
    where: { id: invitation.householdId },
    include: { children: { include: { storybooks: true } } },
  });
  const storybookId = household?.children[0]?.storybooks[0]?.id ?? null;
  res.json({ ok: true, storybookId });
});

router.post("/invitations/:token/request-new", async (req, res) => {
  // Dev mode: no notification system wired up yet — this just acknowledges the request.
  res.json({ ok: true });
});

export default router;
