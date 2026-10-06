import type { Request, Response } from "express";
import { prisma } from "./db";
import { getCurrentUser } from "./session";

// Who may see what inside a storybook:
// - Original recordings and transcripts: their recorder, plus the whole family
//   when the recorder chose "Everyone in the family".
// - Chapters: the owner always (they review drafts); everyone else only once
//   published, and only if the chapter is shared with them.

export type Member = NonNullable<Awaited<ReturnType<typeof findMember>>>;

async function findMember(userId: string, storybookId: string) {
  const storybook = await prisma.storybook.findUnique({
    where: { id: storybookId },
    include: { child: { include: { household: { include: { contributors: { orderBy: { createdAt: "asc" } } } } } } },
  });
  if (!storybook) return null;
  // Someone can hold two places in a family (e.g. invited before they started it); the owner place wins.
  const mine = storybook.child.household.contributors.filter((c) => c.userId === userId && c.inviteStatus !== "revoked");
  const me = mine.find((c) => c.role === "owner") ?? mine[0];
  return me ? { storybook, me } : { storybook, me: null };
}

// Sends 401/403/404 and returns null when the signed-in user isn't in the storybook's family.
export async function requireMember(req: Request, res: Response, storybookId: string, options: { owner?: boolean } = {}) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in first" });
    return null;
  }
  const found = await findMember(user.id, storybookId);
  if (!found) {
    res.status(404).json({ error: "Storybook not found" });
    return null;
  }
  if (!found.me) {
    res.status(403).json({ error: "access_denied" });
    return null;
  }
  if (options.owner && found.me.role !== "owner") {
    res.status(403).json({ error: "Only the storybook's owner can do that." });
    return null;
  }
  return { user, storybook: found.storybook, me: found.me };
}

export const isOwner = (me: { role: string }) => me.role === "owner";

export function canSeeMemory(memory: { contributorId: string; visibility: string }, me: { id: string }) {
  return memory.contributorId === me.id || memory.visibility === "household";
}

export function canSeeChapter(
  chapter: { status: string; shareMode: string; access?: { contributorId: string }[] },
  me: { id: string; role: string }
) {
  if (isOwner(me)) return true;
  if (chapter.status !== "published") return false;
  if (chapter.shareMode === "family") return true;
  if (chapter.shareMode === "selected") return (chapter.access ?? []).some((a) => a.contributorId === me.id);
  return false;
}

// Recordings are served through an access check, never as public files.
export const audioSrc = (memory: { id: string; audioUrl: string | null }) => (memory.audioUrl ? `/api/memories/${memory.id}/audio` : null);

export async function memberForMemory(req: Request, res: Response, memoryId: string) {
  const memory = await prisma.memory.findUnique({ where: { id: memoryId } });
  if (!memory) {
    res.status(404).json({ error: "Memory not found" });
    return null;
  }
  const member = await requireMember(req, res, memory.storybookId);
  if (!member) return null;
  if (!canSeeMemory(memory, member.me)) {
    res.status(403).json({ error: "access_denied" });
    return null;
  }
  return { ...member, memory };
}

export async function memberForChapter(req: Request, res: Response, chapterId: string, options: { owner?: boolean } = {}) {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, include: { access: true } });
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return null;
  }
  const member = await requireMember(req, res, chapter.storybookId, options);
  if (!member) return null;
  if (!canSeeChapter(chapter, member.me)) {
    res.status(403).json({ error: "access_denied" });
    return null;
  }
  return { ...member, chapter };
}

export const parseIds = (json: string): string[] => {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
};
