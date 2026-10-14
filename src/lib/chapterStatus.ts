import type { MascotName } from "../components/ui";
import type { StorybookChapter } from "../types";
import { possessive } from "./format";

// What a chapter that isn't in the book yet needs from the parent, if anything:
// the chapter list's "Waiting for you", the tags on home's chapter covers and, when
// there's something to do (`go`), home's chapter slot (VSB-129).
export function chapterStep(c: StorybookChapter, childName: string) {
  if (c.status === "published") return null;
  if (c.pagesStatus === "needs_characters")
    return { kicker: "Who's who?", tag: "Who's who?", text: "Tell us who someone in this memory is, so we can draw them right.", art: "magnifier" as MascotName, cta: "pages" as const, go: "Tell us" };
  if (c.pagesStatus === "illustrating") return { kicker: "Drawing the pictures", tag: "Drawing", text: "This takes a few minutes. You can leave this page.", spinner: true, cta: "pages" as const, go: null };
  if (c.pagesStatus === "needs_attention")
    return { kicker: "A picture needs another try", tag: "Needs a redraw", text: "Open the chapter to redraw it.", art: "peek-worried" as MascotName, cta: "pages" as const, go: "Open" };
  if (c.approvedPages < c.pageCount)
    return { kicker: "Ready to review", tag: "To review", text: `Look through the pages and add it to ${possessive(childName)} book.`, art: "open-book" as MascotName, cta: "pages" as const, go: "Review" };
  if (c.guardianStatus !== "approved")
    return { kicker: "Almost ready", tag: "Almost ready", text: "The Vambie team is giving it a final read.", art: "papers" as MascotName, cta: null, go: null };
  return { kicker: "Ready to publish", tag: "To publish", text: `Publish it to add it to ${possessive(childName)} book.`, art: "hug-book" as MascotName, cta: "pages" as const, go: "Publish" };
}

// Before the birth a chapter grows a page per message and is in the book from its
// first page (VSB-134). A page a check held waits for the owner; the chapter shows
// how many voices it has until it finishes.
export const heldChapters = (chapters: StorybookChapter[]) =>
  chapters.filter((c) => c.status === "published" && c.living && (c.heldPages ?? 0) > 0).sort((a, b) => b.sequence - a.sequence);
export const heldLabel = (pages: number) => (pages === 1 ? "A page needs a look" : `${pages} pages need a look`);
export const voicesLine = (c: StorybookChapter) => `${c.voices ?? 0} of ${c.voicesToFinish ?? 8} voices`;

// The owner's chapters that aren't in the book yet, newest first, with what each needs.
export const waitingChapters = (chapters: StorybookChapter[], childName: string) =>
  chapters
    .filter((c) => c.status !== "published")
    .sort((a, b) => b.sequence - a.sequence)
    .map((c) => ({ chapter: c, step: chapterStep(c, childName) }))
    .filter((x): x is { chapter: StorybookChapter; step: NonNullable<ReturnType<typeof chapterStep>> } => Boolean(x.step));
