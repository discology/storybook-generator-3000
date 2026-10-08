import crypto from "crypto";
import express, { Router } from "express";
import { prisma } from "./db";
import type { Invitation } from "../src/generated/prisma/client";
import { getCurrentUser } from "./session";
import { renderMessage, appUrl } from "./messageTemplates";
import { normalizePhone } from "./sms";
import { householdStorybook, sendText } from "./texts";

// An invitation is texted only to a number that already verified in the app:
// that person gave their own consent to texts (VSB-109). Everyone else gets
// the link from the parent.
async function textInvite(contact: string, message: string | null, householdId: string) {
  const phone = normalizePhone(contact);
  if (!phone || !message) return false;
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return false;
  const result = await sendText({ event: "invite", to: { userId: user.id, phone }, body: message, householdId });
  return result.sent;
}

// Texts the storybook's owner about something in their family.
async function textOwner(householdId: string, event: string, values: (storybook: NonNullable<Awaited<ReturnType<typeof householdStorybook>>>) => Record<string, string>) {
  const storybook = await householdStorybook(householdId);
  const owner = await prisma.contributor.findFirst({ where: { householdId, role: "owner", inviteStatus: "joined" }, include: { user: true } });
  if (!storybook || !owner?.user) return;
  const body = await renderMessage(event, values(storybook));
  if (body) await sendText({ event, to: { userId: owner.user.id, phone: owner.user.phone }, body, householdId });
}
import { isOwner, requireMember } from "./access";

const router: Router = express.Router();

export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

const isExpired = (invitation: { status: string; createdAt: Date }) =>
  invitation.status === "pending" && Date.now() - invitation.createdAt.getTime() > INVITE_TTL_MS;

// Texting invites needs a Twilio sending number, which isn't set up yet, so
// the invite text (from the admin-editable template) is returned for the
// inviter to send themselves. null when admins turned invites off.
async function inviteMessage(inviterName: string, childName: string, storybookTitle: string, relationship: string | null, token: string) {
  return renderMessage("invite", {
    inviter_name: inviterName,
    child_name: childName,
    relationship: relationship || "family member",
    storybook_title: storybookTitle,
    invite_url: appUrl(`/invitations/${token}`),
  });
}

router.get("/storybooks/:id/family", async (req, res) => {
  const member = await requireMember(req, res, req.params.id);
  if (!member) return;
  const invitations = await prisma.invitation.findMany({ where: { householdId: member.storybook.child.householdId } });
  res.json({
    myContributorId: member.me.id,
    isOwner: isOwner(member.me),
    childName: member.storybook.child.displayName,
    contributors: member.storybook.child.household.contributors
      .filter((c) => c.inviteStatus !== "revoked")
      .map((c) => {
        const invitation = invitations.find((i) => i.contributorId === c.id);
        return {
          id: c.id,
          name: c.name,
          relationship: c.relationship,
          role: c.role,
          inviteStatus: c.inviteStatus,
          isMe: c.id === member.me.id,
          contact: isOwner(member.me) ? invitation?.contact ?? null : null,
          invitedAt: invitation?.createdAt ?? null,
          inviteExpired: invitation ? isExpired(invitation) : false,
          renewRequested: Boolean(invitation?.renewRequestedAt) && c.inviteStatus === "pending",
        };
      }),
  });
});

router.post("/storybooks/:id/family/invite", async (req, res) => {
  const member = await requireMember(req, res, req.params.id, { owner: true });
  if (!member) return;
  const contact = String(req.body?.contact ?? "").trim();
  const relationship = req.body?.relationship ? String(req.body.relationship) : null;
  if (!contact) return res.status(400).json({ error: "Add a phone number or email." });
  const { storybook, me } = member;

  const contributor = await prisma.contributor.create({
    data: { householdId: storybook.child.householdId, name: contact, relationship, role: "contributor", inviteStatus: "pending" },
  });
  const token = crypto.randomBytes(16).toString("hex");
  const invitation = await prisma.invitation.create({
    data: { householdId: storybook.child.householdId, contributorId: contributor.id, invitedByName: me.name, contact, relationship, token },
  });
  const message = await inviteMessage(me.name, storybook.child.displayName, storybook.title, relationship, token);
  const texted = await textInvite(contact, message, storybook.child.householdId).catch(() => false);
  res.status(201).json({ contributor, invitation, inviteLink: appUrl(`/invitations/${token}`), inviteMessage: message, devMode: !texted, texted });
});

// A fresh link for a pending invite (the old link stops working).
router.post("/family/:contributorId/resend", async (req, res) => {
  const contributor = await prisma.contributor.findUnique({ where: { id: req.params.contributorId }, include: { household: { include: { children: { include: { storybooks: true } } } } } });
  const storybook = contributor?.household.children[0]?.storybooks[0];
  if (!contributor || !storybook) return res.status(404).json({ error: "Not found" });
  const member = await requireMember(req, res, storybook.id, { owner: true });
  if (!member) return;
  if (contributor.inviteStatus !== "pending") return res.status(400).json({ error: "They've already joined." });

  const token = crypto.randomBytes(16).toString("hex");
  const invitation = await prisma.invitation.update({
    where: { contributorId: contributor.id },
    data: { token, status: "pending", createdAt: new Date(), renewRequestedAt: null },
  });
  const message = await inviteMessage(member.me.name, member.storybook.child.displayName, storybook.title, invitation.relationship, token);
  const texted = await textInvite(invitation.contact, message, contributor.householdId).catch(() => false);
  res.json({ inviteLink: appUrl(`/invitations/${token}`), inviteMessage: message, devMode: !texted, texted });
});

// Cancels a pending invite or removes someone from the storybook.
router.delete("/family/:contributorId", async (req, res) => {
  const contributor = await prisma.contributor.findUnique({ where: { id: req.params.contributorId }, include: { household: { include: { children: { include: { storybooks: true } } } } } });
  const storybook = contributor?.household.children[0]?.storybooks[0];
  if (!contributor || !storybook) return res.status(404).json({ error: "Not found" });
  const member = await requireMember(req, res, storybook.id, { owner: true });
  if (!member) return;
  if (contributor.role === "owner") return res.status(400).json({ error: "The storybook's owner can't be removed." });

  await prisma.invitation.updateMany({ where: { contributorId: contributor.id }, data: { status: "revoked" } });
  await prisma.contributor.update({ where: { id: contributor.id }, data: { inviteStatus: "revoked" } });
  res.json({ ok: true });
});

// --- Invitation acceptance (token-based) ---
router.get("/invitations/:token", async (req, res) => {
  const invitation = await prisma.invitation.findUnique({
    where: { token: req.params.token },
    include: { household: { include: { children: { include: { storybooks: true } } } } },
  });
  if (!invitation) return res.status(404).json({ error: "not_found" });
  if (invitation.status === "revoked") return res.status(410).json({ error: "revoked" });
  if (isExpired(invitation)) return res.status(410).json({ error: "expired", renewRequested: Boolean(invitation.renewRequestedAt) });

  const child = invitation.household.children[0];
  const user = await getCurrentUser(req);
  const mine = user
    ? await prisma.contributor.findUnique({ where: { householdId_userId: { householdId: invitation.householdId, userId: user.id } } })
    : null;
  res.json({
    status: invitation.status,
    invitedByName: invitation.invitedByName,
    relationship: invitation.relationship,
    childName: child?.displayName ?? "their child",
    storybookTitle: child?.storybooks[0]?.title ?? null,
    storybookId: child?.storybooks[0]?.id ?? null,
    joinedByMe: invitation.status === "accepted" && mine?.inviteStatus === "joined",
    signedInName: user?.name ?? null,
  });
});

// Joins the signed-in person to the invitation's family and returns their place
// and the storybook. One place per person per family: someone who's already in
// it keeps their place (rejoining if they'd been removed), and the invite's
// placeholder goes. Also used when a relative recorded before joining (guests.ts).
export async function acceptInvitation(invitation: Invitation, user: { id: string; phone: string | null; name: string | null }, name: string) {
  if (!user.name) await prisma.user.update({ where: { id: user.id }, data: { name } });
  const existing = await prisma.contributor.findUnique({ where: { householdId_userId: { householdId: invitation.householdId, userId: user.id } } });
  const place = await prisma.$transaction(async (tx) => {
    await tx.invitation.update({ where: { id: invitation.id }, data: { status: "accepted", respondedAt: new Date() } });
    if (existing) {
      await tx.contributor.delete({ where: { id: invitation.contributorId } });
      return existing.inviteStatus === "joined"
        ? existing
        : tx.contributor.update({ where: { id: existing.id }, data: { inviteStatus: "joined", relationship: existing.relationship ?? invitation.relationship } });
    }
    return tx.contributor.update({ where: { id: invitation.contributorId }, data: { userId: user.id, inviteStatus: "joined", name, phone: user.phone } });
  });
  const household = await prisma.household.findUnique({ where: { id: invitation.householdId }, include: { children: { include: { storybooks: true } } } });
  // The parent hears that they joined (VSB-9), unless the parent is the one joining.
  if (user.id !== household?.ownerUserId) {
    void textOwner(invitation.householdId, "member_joined", (sb) => ({
      member_name: name,
      relationship: invitation.relationship ?? "",
      child_name: sb.child.displayName,
      storybook_title: sb.title,
      family_url: appUrl(`/storybooks/${sb.id}/family`),
    })).catch((e) => console.error("Joined text:", e?.message));
  }
  return { place, storybook: household?.children[0]?.storybooks[0] ?? null };
}

// Why an invitation can't be used, if it can't.
export const invitationProblem = (invitation: Invitation | null) =>
  !invitation ? "not_found" : invitation.status === "revoked" ? "revoked" : isExpired(invitation) ? "expired" : invitation.status !== "pending" ? invitation.status : null;

router.post("/invitations/:token/accept", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });
  const invitation = await prisma.invitation.findUnique({ where: { token: req.params.token } });
  const problem = invitationProblem(invitation);
  if (problem) return res.status(problem === "not_found" ? 404 : 410).json({ error: problem });

  const name = String(req.body?.name ?? "").trim() || user.name || "";
  if (!name) return res.status(400).json({ error: "Add your name so the family knows who's sharing." });
  const { storybook } = await acceptInvitation(invitation!, user, name);
  res.json({ ok: true, storybookId: storybook?.id ?? null });
});

// The invitee asks for a fresh link; the inviter sees it in Family.
router.post("/invitations/:token/request-new", async (req, res) => {
  const invitation = await prisma.invitation.findUnique({ where: { token: req.params.token } });
  if (!invitation) return res.status(404).json({ error: "not_found" });
  if (invitation.status === "pending" && !invitation.renewRequestedAt) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { renewRequestedAt: new Date() } });
    void textOwner(invitation.householdId, "new_link_requested", (sb) => ({
      member_name: invitation.contact,
      child_name: sb.child.displayName,
      storybook_title: sb.title,
      family_url: appUrl(`/storybooks/${sb.id}/family`),
    })).catch((e) => console.error("New link text:", e?.message));
  }
  // Same answer either way, so the request reveals nothing about the invite.
  res.json({ ok: true });
});

export default router;
