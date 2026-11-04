import { prisma } from "./db";
import { canSeeChapter } from "./access";
import { childLabel } from "./beforeBirth";
import { appUrl, renderMessage } from "./messageTemplates";
import { isLiving, parseUnresolved } from "./storyPages";
import { sendText } from "./texts";

// Chapters go into the book on their own (VSB-137): no page review and no
// Publish button. A chapter publishes as soon as its pictures are drawn, nobody
// in it is left to identify (Who's who), and the read-through has passed it, or
// the Vambie team has approved it after a hold. A page a check flagged goes in
// anyway; its note stays on the page for the owner to fix later.
// Chapters before the birth grow a page at a time and publish themselves
// (VSB-134, livingChapters.ts), and visitors' previews aren't a family's book:
// neither is touched here.

export async function autoPublish(chapterId: string, options: { quiet?: boolean } = {}): Promise<boolean> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { storybook: { select: { status: true } }, pages: { include: { assets: { where: { status: "ready" }, take: 1 } } } },
  });
  if (!chapter || chapter.status === "published" || chapter.storybook.status === "guest") return false;
  if (isLiving(chapter.generationSnapshot)) return false;
  if (chapter.pagesStatus !== "ready" || chapter.guardianStatus !== "approved") return false;
  if (parseUnresolved(chapter.unresolvedPeople).length) return false;
  if (chapter.pages.length === 0 || chapter.pages.some((p) => p.pictureSize !== "none" && p.assets.length === 0)) return false;

  const now = new Date();
  await prisma.storyPage.updateMany({ where: { chapterId, approvedAt: null }, data: { approvedAt: now } });
  // Only one caller wins if two finish at once, so the family is texted once.
  const done = await prisma.chapter.updateMany({ where: { id: chapterId, status: { not: "published" } }, data: { status: "published", publishedAt: now } });
  if (done.count === 0) return false;
  if (!options.quiet) await textNewChapter(chapterId, null).catch((e) => console.error("New chapter texts:", e?.message));
  return true;
}

// "A new chapter is ready" to everyone in the family who can read it, except
// whoever published it by hand (a chapter that publishes itself texts the owner too).
export async function textNewChapter(chapterId: string, publisherId: string | null) {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { access: true, storybook: { include: { child: { include: { household: { include: { contributors: { include: { user: true } } } } } } } } },
  });
  const sb = chapter.storybook;
  const body = await renderMessage("chapter_ready", {
    child_name: childLabel(sb.child.displayName),
    storybook_title: sb.title,
    chapter_title: chapter.title,
    chapter_url: appUrl(`/storybooks/${sb.id}/read/${chapter.id}`),
  });
  if (!body) return;
  for (const c of sb.child.household.contributors) {
    if (c.id === publisherId || c.inviteStatus !== "joined" || !c.user?.phone || !canSeeChapter(chapter, c)) continue;
    await sendText({ event: "chapter_ready", to: { userId: c.user.id, phone: c.user.phone }, body, householdId: sb.child.householdId });
  }
}

// Once, on the release that brought this in: chapters already waiting for the
// owner's review or Publish tap go into the book without texting anyone.
const BACKFILL_KEY = "auto_publish_backfill_v1";
export async function publishWaitingChapters() {
  const done = await prisma.appSetting.findUnique({ where: { key: BACKFILL_KEY } });
  if (done) return;
  const waiting = await prisma.chapter.findMany({ where: { status: { not: "published" }, storybook: { status: { not: "guest" } } }, select: { id: true } });
  let published = 0;
  for (const { id } of waiting) if (await autoPublish(id, { quiet: true }).catch(() => false)) published++;
  await prisma.appSetting.create({ data: { key: BACKFILL_KEY, value: JSON.stringify({ at: new Date().toISOString(), published, checked: waiting.length }) } });
  console.log(`Auto-publish: ${published} of ${waiting.length} waiting chapters published quietly.`);
}
