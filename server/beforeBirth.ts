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
- Open with one short page of the waiting (one plain sentence about the room, the house or the road); it may be wordless. End with one vignette page whose words are exactly: <closing_line> Nothing else goes on it: never sum up, list or repeat the messages.
- Lines you write yourself (any words that aren't a family member's message or the closing line) must make plain sense: something a parent could read aloud that anyone would understand at once, with no riddles and nothing that makes things or ideas think, know, remember or wait ("the stories will know where to go"). They fit the moment: the baby isn't born yet, so speak in the present or the future, never as if the baby is already here or looking back ("waited for you"). Never sum up, list or repeat the messages, and use no refrains, sound words or morals. Don't open the way earlier chapters opened.
- The title is a phrase from one of the messages.
- Ignore the reading level's voice and picture pattern; keep only its word limits.`;

// The last page of every pre-birth chapter: words the team writes, not the AI
// (VSB-125). Editable in Admin, AI instructions; <child_name> is filled in.
export const BEFORE_BIRTH_CLOSING_KEY = "before_you_arrive_closing";
export const DEFAULT_CLOSING_LINE = "We can't wait to meet you.";

// Ends a plan on the closing line. A last page that isn't a family member's
// message becomes it; after a message, a closing page is added, drawn like the
// opening page of the waiting.
export function withClosingPage<P extends { text: string; pictureSize: string; characters: string[]; visibleAction: string; sourceQuote?: string }>(pages: P[], line: string): P[] {
  const closing = line.trim();
  if (!closing || pages.length === 0) return pages;
  const last = pages[pages.length - 1];
  if (!speakerOf(last.text)) return [...pages.slice(0, -1), { ...last, text: closing, pictureSize: "vignette", sourceQuote: "" }];
  const opening = pages.find((p) => !speakerOf(p.text)) ?? { ...last, characters: [], visibleAction: "The place is quiet and ready, waiting. No one is in the picture." };
  return [...pages, { ...opening, text: closing, pictureSize: "vignette", sourceQuote: "" }];
}

// The first chapter after the birth, when the chapters before it were made from
// the family's words.
export const arrivalNote = (childName: string) =>
  `This is the first chapter since ${childName} was born. The chapters before it were made from the family's words while they waited. Open this chapter with Baby Vambie's arrival: Baby Vambie has come to choose this family, and one page says it plainly, for example "Baby Vambie chose you." Then go on from the memories below, with Baby Vambie standing in for ${childName} as always.`;

// What Check pages is told about a pre-birth chapter.
export const AI_LINE_RULE =
  "Words the planner wrote itself (any page that isn't a family member's message or the fixed closing line, such as the opening page about the waiting) must make plain sense: a parent could read it aloud and anyone would understand it at once, with no riddles and nothing that makes things or ideas think, know, remember or wait. It fits the moment: the baby isn't born yet, so it never speaks as if the baby is already here or looks back (\"waited for you\"). It never sums up, lists or repeats the messages, and it has no refrains, sound words or morals.";

export const checkNote = (closingLine: string) =>
  "This chapter was made before the child is born: each page is a family member's message cut to one or two sentences in their own words. A faithful trim of what they said is expected, not an added fact, and so is carrying the question they answered into their sentence. Flag a page where Baby Vambie appears, or where the words change what the person said. " +
  AI_LINE_RULE +
  " Check those pages against that and flag one that breaks it, saying which part." +
  (closingLine ? ` The family's fixed closing line is "${closingLine}": never flag a page whose words are exactly that, and check any other last page like the rest.` : "");

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

// What to call the child before a name is given: shared with the web app.
export * from "./childName";

// What the planner, the checks and revisions are told when there's no name yet.
export const NO_NAME_NOTE = `The family hasn't chosen a name yet. Never make one up or use a nickname: speak to the child as "you", and say "the baby" only where "you" won't do.`;

// --- Checking the words (VSB-127) ---

const CONTRACTIONS: Record<string, string> = {
  "i'll": "i will", "you'll": "you will", "we'll": "we will", "he'll": "he will", "she'll": "she will", "they'll": "they will", "it'll": "it will",
  "i'm": "i am", "you're": "you are", "we're": "we are", "they're": "they are", "it's": "it is", "that's": "that is", "there's": "there is",
  "don't": "do not", "doesn't": "does not", "didn't": "did not", "can't": "cannot", "won't": "will not", "isn't": "is not", "wasn't": "was not",
  "i've": "i have", "you've": "you have", "we've": "we have", "i'd": "i would", "you'd": "you would", "we'd": "we would", "let's": "let us",
};
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (CONTRACTIONS[w] ?? w).split(" "));

// How much of a message page is the person's own words: the share of its words
// that sit in a run of three or more words in a row from what they said (or the
// question they answered). A faithful trim scores high; a rewrite into fragments
// ("Too quiet? Call. Good blanket comes.") scores near zero.
export const OWN_WORDS_MIN = 0.7;
export function ownWords(pageText: string, sources: string[], run = 3) {
  const quote = words(pageText.replace(/^\s*[^:.!?]{1,40}?\s+says:\s*/i, ""));
  const grams = new Set<string>();
  for (const source of sources) {
    const w = words(source);
    for (let i = 0; i + run <= w.length; i++) grams.add(w.slice(i, i + run).join(" "));
  }
  const covered = quote.map(() => false);
  for (let i = 0; i + run <= quote.length; i++) if (grams.has(quote.slice(i, i + run).join(" "))) for (let k = i; k < i + run; k++) covered[k] = true;
  const share = quote.length ? covered.filter(Boolean).length / quote.length : 1;
  return { share, notTheirs: [...new Set(quote.filter((_, i) => !covered[i]))] };
}

// An opening that echoes an earlier chapter's ("The room waits…" every time).
export function echoesEarlierOpening(text: string, earlier: string[]) {
  const w = words(text);
  if (w.length === 0) return null;
  const start = w.slice(0, 3).join(" ");
  for (const other of earlier) {
    const o = words(other);
    if (o.length === 0) continue;
    const overlap = w.filter((x) => o.includes(x)).length / new Set([...w, ...o]).size;
    if ((w.length >= 3 && o.slice(0, 3).join(" ") === start) || overlap >= 0.5) return other;
  }
  return null;
}
