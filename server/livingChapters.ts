import { prisma } from "./db";
import { withUsage } from "./aiUsage";
import { canSeeChapter } from "./access";
import { LIVING_CHAPTER_PAGES, childLabel } from "./beforeBirth";
import { appUrl, renderMessage } from "./messageTemplates";
import { sendText } from "./texts";
import { closeLivingChapter, isLiving, messageVoices, openLivingChapter, publishLivingChapter, recordedBy, writeMessagePage } from "./storyPages";

// Before the birth, each message becomes its own page as soon as it's ready
// (VSB-134), instead of waiting for a weekly chapter. Pages collect in one
// growing chapter, one page per person. The chapter finishes at eight pages, or
// as soon as someone who already has a page in it records again (their message
// starts the next chapter), or on the birthday. A page publishes on its own when
// its checks pass; a flagged page waits for the parent.

// One storybook's messages are placed one at a time, oldest first.
const queues = new Map<string, Promise<unknown>>();
function oneAtATime<T>(storybookId: string, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(storybookId) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(storybookId, next);
  next
    .catch(() => undefined)
    .finally(() => {
      if (queues.get(storybookId) === next) queues.delete(storybookId);
    });
  return next;
}

// A message that couldn't be placed is tried again an hour later, three times at
// most, so a failing AI call can't repeat every few minutes.
const failures = new Map<string, { tries: number; at: number }>();
const RETRY_AFTER_MS = 60 * 60 * 1000;
const MAX_TRIES = 3;

// Messages the family allowed in the book that no page uses yet.
const waitingMessages = (storybookId: string) =>
  prisma.memory.findMany({
    where: { storybookId, storyUseConsent: true, status: "interpreted", chapterSources: { none: {} } },
    include: { transcripts: { orderBy: { createdAt: "desc" }, take: 1 }, interpretation: true, contributor: true },
    orderBy: { recordedAt: "asc" },
  });
type WaitingMessage = Awaited<ReturnType<typeof waitingMessages>>[number];

// Places every waiting message of an expecting family. Called when a message
// finishes processing, and by the weekly check as a safety net.
export function placeWaitingMessages(storybookId: string) {
  return oneAtATime(storybookId, () =>
    withUsage({ trigger: "family" }, async () => {
      const storybook = await prisma.storybook.findUnique({ where: { id: storybookId }, include: { child: true } });
      if (!storybook || storybook.status !== "active" || storybook.child.stage !== "expecting") return 0;
      let placed = 0;
      for (const message of await waitingMessages(storybookId)) {
        const failed = failures.get(message.id);
        if (failed && (failed.tries >= MAX_TRIES || Date.now() - failed.at < RETRY_AFTER_MS)) continue;
        try {
          await placeMessage(storybookId, message);
          failures.delete(message.id);
          placed++;
        } catch (error: any) {
          failures.set(message.id, { tries: (failed?.tries ?? 0) + 1, at: Date.now() });
          console.error(`Placing message ${message.id} failed:`, error?.message ?? error);
        }
      }
      return placed;
    })
  );
}

async function placeMessage(storybookId: string, message: WaitingMessage) {
  let open = await prisma.chapter.findFirst({ where: { storybookId, growing: true } });
  // One page per person: a second message from someone already in the open
  // chapter finishes it, and their message starts the next one.
  if (open && (await messageVoices(open.id)).includes(message.contributorId)) {
    await finish(open.id);
    open = null;
  }
  const opened = !open;
  if (!open) open = await openLivingChapter(storybookId);
  try {
    const page = await writeMessagePage(open.id, {
      id: message.id,
      transcript: message.transcripts[0]?.text ?? "",
      events: message.interpretation?.events ?? "",
      emotions: message.interpretation?.emotions ?? "",
      themes: message.interpretation?.themes ?? "",
      recordedBy: recordedBy(message.contributor),
      prompt: message.promptText,
    });
    if (page.published) await textPageAdded(page.pageId);
    if (page.pageNumber >= LIVING_CHAPTER_PAGES) await finish(open.id);
  } catch (error) {
    // Don't leave an empty chapter behind if its first page couldn't be written.
    if (opened && (await prisma.storyPage.count({ where: { chapterId: open.id } })) === 0) await prisma.chapter.delete({ where: { id: open.id } });
    throw error;
  }
}

async function finish(chapterId: string) {
  if (await closeLivingChapter(chapterId)) await textChapterFinished(chapterId);
}

// The birthday finishes the open chapter, whatever its count, before the first
// chapter after the birth (VSB-120).
export function finishOpenChapter(storybookId: string) {
  return oneAtATime(storybookId, () =>
    withUsage({ trigger: "family" }, async () => {
      const open = await prisma.chapter.findFirst({ where: { storybookId, growing: true }, include: { pages: { select: { id: true } } } });
      if (!open) return;
      if (open.pages.length === 0) {
        await prisma.chapter.delete({ where: { id: open.id } });
        return;
      }
      await finish(open.id);
    })
  );
}

// When the parent approves pages of a growing chapter that were waiting for
// them: the chapter joins the book if this is its first page, and each person
// hears their page is in.
export async function afterParentApproved(chapterId: string, pageIds: string[]) {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter || !isLiving(chapter.generationSnapshot) || pageIds.length === 0) return;
  await publishLivingChapter(chapterId);
  for (const pageId of pageIds) await textPageAdded(pageId);
}

// "Your page is in the book", to the family member who recorded the message.
async function textPageAdded(pageId: string) {
  const page = await prisma.storyPage.findUnique({ where: { id: pageId }, include: { chapter: { include: { storybook: { include: { child: true } } } } } });
  if (!page?.sourceMemoryId) return;
  const memory = await prisma.memory.findUnique({ where: { id: page.sourceMemoryId }, include: { contributor: { include: { user: true } } } });
  const user = memory?.contributor.user;
  const sb = page.chapter.storybook;
  if (!memory || !user?.phone || sb.status !== "active") return;
  const body = await renderMessage("page_added", {
    child_name: childLabel(sb.child.displayName, memory.contributor.role === "owner"),
    storybook_title: sb.title,
    chapter_title: page.chapter.title,
    chapter_url: appUrl(`/storybooks/${sb.id}/read/${page.chapterId}`),
  });
  if (body) await sendText({ event: "page_added", to: { userId: user.id, phone: user.phone }, body, householdId: sb.child.householdId });
}

// "A new chapter is ready", to everyone in the family who can read it.
async function textChapterFinished(chapterId: string) {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { access: true, storybook: { include: { child: { include: { household: { include: { contributors: { include: { user: true } } } } } } } } },
  });
  const sb = chapter.storybook;
  if (chapter.status !== "published" || sb.status !== "active") return;
  for (const c of sb.child.household.contributors) {
    if (c.inviteStatus !== "joined" || !c.user?.phone || !canSeeChapter(chapter, c)) continue;
    const body = await renderMessage("chapter_ready", {
      child_name: childLabel(sb.child.displayName, c.role === "owner"),
      storybook_title: sb.title,
      chapter_title: chapter.title,
      chapter_url: appUrl(`/storybooks/${sb.id}/read/${chapter.id}`),
    });
    if (body) await sendText({ event: "chapter_ready", to: { userId: c.user.id, phone: c.user.phone }, body, householdId: sb.child.householdId });
  }
}
