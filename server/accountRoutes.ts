import express, { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { SESSION_COOKIE, getCurrentUser } from "./session";

const router: Router = express.Router();

const removeFile = (p: string | null | undefined) => {
  if (!p) return;
  const abs = path.join(process.cwd(), p.replace(/^\//, ""));
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
};

router.get("/account", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });
  const places = await prisma.contributor.findMany({
    where: { userId: user.id, inviteStatus: { not: "revoked" } },
    include: { household: { include: { children: { include: { storybooks: true } } } } },
  });
  const storybooks = places.flatMap((c) =>
    c.household.children.flatMap((child) => child.storybooks.map((s) => ({ id: s.id, title: s.title, childName: child.displayName, role: c.role })))
  );
  // Someone can hold two places in one family; list each storybook once, as owner if they own it.
  const unique = [...new Map(storybooks.sort((a, b) => (a.role === "owner" ? -1 : 1) - (b.role === "owner" ? -1 : 1)).map((s) => [s.id, s])).values()];
  res.json({ user: { id: user.id, name: user.name, phone: user.phone }, storybooks: unique });
});

router.put("/account", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });
  const name = String(req.body?.name ?? "").trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: "Your name can't be empty." });
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  // Family lists show the name too.
  await prisma.contributor.updateMany({ where: { userId: user.id }, data: { name } });
  res.json({ ok: true, name });
});

// What deleting the account removes: storybooks they own (with everyone's
// memories and chapters in them) and their own memories everywhere else.
async function deletionPlan(userId: string) {
  const places = await prisma.contributor.findMany({
    where: { userId, inviteStatus: { not: "revoked" } },
    include: { household: { include: { children: { include: { storybooks: { include: { _count: { select: { memories: true, chapters: true } } } } } }, contributors: true } } },
  });
  const ownedIds = new Set(places.filter((c) => c.role === "owner").map((c) => c.householdId));
  const owned = [...ownedIds].map((householdId) => {
    const place = places.find((c) => c.householdId === householdId)!;
    const book = place.household.children[0]?.storybooks[0];
    return {
      householdId,
      storybookId: book?.id ?? null,
      title: book?.title ?? "Storybook",
      childName: place.household.children[0]?.displayName ?? "",
      memoryCount: book?._count.memories ?? 0,
      chapterCount: book?._count.chapters ?? 0,
      familyCount: place.household.contributors.filter((c) => c.inviteStatus !== "revoked" && c.userId !== userId).length,
    };
  });
  const contributing = [];
  for (const place of places.filter((c) => !ownedIds.has(c.householdId))) {
    const book = place.household.children[0]?.storybooks[0];
    const memories = await prisma.memory.findMany({ where: { contributorId: place.id }, include: { chapterSources: true } });
    contributing.push({
      contributorId: place.id,
      storybookId: book?.id ?? null,
      title: book?.title ?? "Storybook",
      childName: place.household.children[0]?.displayName ?? "",
      memoryCount: memories.length,
      heldChapterCount: new Set(memories.flatMap((m) => m.chapterSources.map((s) => s.chapterId))).size,
    });
  }
  return { owned, contributing };
}

router.get("/account/deletion-preview", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });
  res.json(await deletionPlan(user.id));
});

// Deletes everything the plan lists, then the account itself, in one
// transaction: either all of it goes or none of it. Files are removed after
// the database change is committed.
export async function deleteAccount(userId: string) {
  const plan = await deletionPlan(userId);
  const files: (string | null)[] = [];

  await prisma.$transaction(async (tx) => {
    for (const book of plan.owned) {
      const storybooks = await tx.storybook.findMany({
        where: { child: { householdId: book.householdId } },
        include: { memories: true, exportRequests: true, chapters: { include: { pages: { include: { assets: true } } } } },
      });
      for (const sb of storybooks) {
        files.push(...sb.memories.map((m) => m.audioUrl), ...sb.exportRequests.map((e) => e.filePath));
        sb.chapters.forEach((c) => files.push(c.characterSheetImage, ...c.pages.flatMap((p) => p.assets.map((a) => a.imagePath))));
        // Memories and chapters (with their pages) go with the storybook.
        await tx.storybook.delete({ where: { id: sb.id } });
      }
      const designs = await tx.characterDesign.findMany({ where: { familyCharacter: { householdId: book.householdId } }, include: { proposals: true } });
      designs.forEach((d) => files.push(d.photoPath, d.portraitPath, d.sheetPath, ...d.proposals.map((p) => p.imagePath)));
      // Contributors, invitations and family characters go with the household.
      await tx.household.delete({ where: { id: book.householdId } });
      // What their AI use cost stays in the admin totals, no longer tied to them.
      await tx.aiUsage.updateMany({
        where: { householdId: book.householdId },
        data: { householdId: null, chapterId: null, memoryId: null, userId: null },
      });
    }

    for (const place of plan.contributing) {
      const memories = await tx.memory.findMany({ where: { contributorId: place.contributorId }, include: { chapterSources: true } });
      for (const chapterId of new Set(memories.flatMap((m) => m.chapterSources.map((s) => s.chapterId)))) {
        await tx.guardianFinding.create({
          data: {
            chapterId,
            category: "source_removed",
            status: "needs_revision",
            note: "A family member deleted their account, which removed a memory this chapter was made from. Review the chapter before it can be published again.",
          },
        });
        await tx.chapter.update({ where: { id: chapterId }, data: { guardianStatus: "needs_revision", status: "guardian_review" } });
      }
      files.push(...memories.map((m) => m.audioUrl));
      await tx.aiUsage.updateMany({ where: { memoryId: { in: memories.map((m) => m.id) } }, data: { memoryId: null } });
      await tx.memory.deleteMany({ where: { contributorId: place.contributorId } });
      const exports = await tx.exportRequest.findMany({ where: { contributorId: place.contributorId } });
      files.push(...exports.map((e) => e.filePath));
      await tx.exportRequest.deleteMany({ where: { contributorId: place.contributorId } });
      await tx.invitation.deleteMany({ where: { contributorId: place.contributorId } });
      await tx.contributor.delete({ where: { id: place.contributorId } });
    }

    // Places already removed from a family: drop them, or detach them if they still hold memories.
    for (const c of await tx.contributor.findMany({ where: { userId } })) {
      if ((await tx.memory.count({ where: { contributorId: c.id } })) === 0) await tx.contributor.delete({ where: { id: c.id } });
      else await tx.contributor.update({ where: { id: c.id }, data: { userId: null } });
    }
    await tx.aiUsage.updateMany({ where: { userId }, data: { userId: null } });
    await tx.user.delete({ where: { id: userId } }); // sessions go with it
  });

  files.forEach((f) => {
    try {
      removeFile(f);
    } catch (error: any) {
      console.error(`Couldn't remove ${f}:`, error?.message);
    }
  });
  return plan;
}

router.delete("/account", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });
  if (req.body?.confirm !== "DELETE") return res.status(400).json({ error: "Type DELETE to confirm." });
  try {
    await deleteAccount(user.id);
  } catch (error: any) {
    console.error("Account deletion failed:", error?.message ?? error);
    return res.status(500).json({ error: "We couldn't delete your account. Nothing was removed; try again." });
  }
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

export default router;
