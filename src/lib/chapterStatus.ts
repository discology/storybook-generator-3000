import type { MascotName } from "../components/ui";
import type { StorybookChapter } from "../types";
import { possessive } from "./format";

// What a chapter that isn't in the book yet needs from the parent, if anything:
// the chapter list's "Waiting for you" and the tags on home's chapter covers (VSB-129).
export function chapterStep(c: StorybookChapter, childName: string) {
  if (c.status === "published") return null;
  if (c.pagesStatus === "needs_characters")
    return { kicker: "Who's who?", tag: "Who's who?", text: "Tell us who someone in this memory is, so we can draw them right.", art: "magnifier" as MascotName, cta: "pages" as const };
  if (c.pagesStatus === "illustrating") return { kicker: "Drawing the pictures", tag: "Drawing", text: "This takes a few minutes. You can leave this page.", spinner: true, cta: "pages" as const };
  if (c.pagesStatus === "needs_attention")
    return { kicker: "A picture needs another try", tag: "Needs a redraw", text: "Open the chapter to redraw it.", art: "peek-worried" as MascotName, cta: "pages" as const };
  if (c.approvedPages < c.pageCount)
    return { kicker: "Ready to review", tag: "To review", text: `Look through the pages and add it to ${possessive(childName)} book.`, art: "open-book" as MascotName, cta: "pages" as const };
  if (c.guardianStatus !== "approved")
    return { kicker: "Almost ready", tag: "Almost ready", text: "The Vambie team is giving it a final read.", art: "papers" as MascotName, cta: null };
  return { kicker: "Ready to publish", tag: "To publish", text: `Publish it to add it to ${possessive(childName)} book.`, art: "hug-book" as MascotName, cta: "pages" as const };
}

// The owner's chapters that aren't in the book yet, newest first, with what each needs.
export const waitingChapters = (chapters: StorybookChapter[], childName: string) =>
  chapters
    .filter((c) => c.status !== "published")
    .sort((a, b) => b.sequence - a.sequence)
    .map((c) => ({ chapter: c, step: chapterStep(c, childName) }))
    .filter((x): x is { chapter: StorybookChapter; step: NonNullable<ReturnType<typeof chapterStep>> } => Boolean(x.step));
