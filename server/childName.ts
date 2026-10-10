// What to call the child (VSB-121). Shared with the web app (src/lib/format.ts).
// While expecting, a name is optional. Until it's given, the parents read "your
// baby" and everyone else "the baby"; the pages speak to the child as "you"; the
// name is asked for with the birthday.
export const hasName = (name: string | null | undefined) => Boolean(name?.trim());
export const childLabel = (name: string | null | undefined, toParent = false) => name?.trim() || (toParent ? "your baby" : "the baby");
// Admin lists, where neither reads well.
export const adminChildLabel = (name: string | null | undefined) => name?.trim() || "Baby on the way";
// A label that starts a sentence gets its capital: "The baby's storybook is ready!"
export const startSentences = (text: string) =>
  text.replace(/(^|[.!?]["”')]?\s+)(your baby|the baby)\b/g, (_m, before: string, label: string) => before + label[0].toUpperCase() + label.slice(1));
// The book's title until someone changes it.
export const UNNAMED_TITLE = "The baby's growing story";
export const defaultTitle = (name: string | null | undefined) => (name?.trim() ? `${name.trim()}'s growing story` : UNNAMED_TITLE);
