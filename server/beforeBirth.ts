import type { ReadingProfile } from "./pageRules";

// Chapters made before the birth (VSB-116: VSB-118, VSB-119, VSB-120). While a
// family is expecting, a chapter is a collection of the family's messages for
// the baby: one page per message, in the speaker's own words, with their
// recording playable on the page. Baby Vambie doesn't appear until the first
// chapter after the birthday. Chapters are still made weekly.

// The editable wording (Admin, AI instructions, "Before you arrive"), snapshotted
// with each pre-birth chapter like The Vambie world.
export const BEFORE_BIRTH_KEY = "before_you_arrive";

export const DEFAULT_BEFORE_BIRTH = `Before <child_name> arrives
This chapter is made before the child is born. The memories below are not events: each one is a message a family member recorded for the child, often finishing a sentence such as "Call me…", "Come to me when…" or "I promise…".
- Each message gets one page. The page's text is the message cut to one or two sentences in the speaker's own words and register, keeping the feeling and the specific answer (the blanket, the pancakes, the song). Drop nothing that makes it theirs and add nothing. Start with what the child will call them and "says:", for example "Mama says: I'll learn every song you like. Even the terrible ones." When an answer only makes sense with its question (an answer like "How to lose at cards gracefully" to "What will you teach them?"), carry the question into their sentence in their voice: "Aunt Mei says: I'll teach you how to lose at cards gracefully." An answer to "Call me…" keeps the name they chose: "Papa says: Call me Papa. My dad was Papa to me." Write it plainly: no storybook voice, no refrains, sound words or rhythm games, and no morals.
- The picture shows that person, drawn as a Vambie like everyone in this book, in a place that fits what they said, mid-action, speaking to the child who isn't here yet. Every page has a picture: framed or full for each message; the opening and closing pages may be vignettes.
- Baby Vambie has not arrived yet and never appears in this chapter: not in the pictures, not in the words, not as a glimpse. Ignore any other instruction to show Baby Vambie standing in for <child_name>.
- Open with one short page of the waiting (one plain sentence about the room, the house or the road) and close with one short page for the child (one plain sentence, never a moral). Either may be wordless.
- The title is a phrase from one of the messages.
- Ignore the reading level's voice and picture pattern; keep only its word limits.`;

// The first chapter after the birth, when the chapters before it were made from
// the family's words.
export const arrivalNote = (childName: string) =>
  `This is the first chapter since ${childName} was born. The chapters before it were made from the family's words while they waited. Open this chapter with Baby Vambie's arrival: Baby Vambie has come to choose this family, and one page says it plainly, for example "Baby Vambie chose you." Then go on from the memories below, with Baby Vambie standing in for ${childName} as always.`;

// What Check pages is told about a pre-birth chapter.
export const CHECK_NOTE =
  "This chapter was made before the child is born: each page is a family member's message cut to one or two sentences in their own words. A faithful trim of what they said is expected, not an added fact, and so is carrying the question they answered into their sentence. The short opening page (the waiting) and closing page (for the child) are part of the design: they are not messages and need no source. Flag a page where Baby Vambie appears, or where the words change what the person said.";

// What the Guardian is told instead of a reading stage.
export const GUARDIAN_READER_LEVEL =
  "Not judged for this chapter: it holds the family's own messages for a baby who isn't born yet, to be read to the child later. Mark reader_fit ok.";

// Pre-birth pages follow their own limits instead of the reading stage's.
export const BEFORE_BIRTH_PROFILE: ReadingProfile = {
  label: "Before you arrive",
  pagesMin: 3,
  pagesMax: 16,
  maxWordsPerPage: 45,
  maxWordsPerSentence: 30,
  maxSentences: 2,
  vocabulary: "Each family member's own words, cut to one or two plain sentences.",
  pictures: "A picture on every page: framed or full for each message; the opening and closing pages may be vignettes.",
};

export const PAGES_PER_PERSON = 2;

// The prompt gets the Before you arrive text wherever an instruction says
// <before_birth>; instructions saved before it existed get it at the top.
export const withBeforeBirth = (body: string) => (body.includes("<before_birth>") ? body : `<before_birth>\n\n${body}`);

export const isBeforeBirth = (generationSnapshot: string | null | undefined) => Boolean(generationSnapshot && generationSnapshot.includes('"beforeBirth":true'));

// At most two messages per person in one chapter; the rest wait for the next one.
export function capPerPerson<T extends { contributorId: string }>(memories: T[], perPerson = PAGES_PER_PERSON) {
  const counts = new Map<string, number>();
  return memories.filter((m) => {
    const n = counts.get(m.contributorId) ?? 0;
    counts.set(m.contributorId, n + 1);
    return n < perPerson;
  });
}

// "Grandma Rose says: …" → "Grandma Rose", for "Hear Grandma Rose say it".
export function speakerOf(text: string): string | null {
  const m = text.match(/^\s*([^:.!?]{1,40}?)\s+says:/i);
  return m ? m[1].trim() : null;
}
