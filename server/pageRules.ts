import { prisma } from "./db";
import { STAGE_KEYS, normalizeStage } from "./readingStages";

// Admin-configurable rules for turning a chapter into illustrated pages. Saving
// creates a new GenerationRuleSet version; chapters keep the version they used.
// How the AI plans and checks pages (chapter structure, page boundaries, etc.)
// is worded in the page_plan / page_check AI instructions.

export interface ReadingProfile {
  label: string;
  pagesMin: number;
  pagesMax: number;
  maxWordsPerPage: number;
  maxWordsPerSentence: number;
  vocabulary: string;
  pictures?: string; // the picture pattern for this stage
}

export type EmbellishmentLevel = "minimal" | "moderate" | "imaginative";

export interface PageRules {
  readingProfiles: Record<string, ReadingProfile>;
  embellishment: EmbellishmentLevel;
  illustrationStyle: string;
  // Only on rule versions from before the Character Library; character looks
  // now live on the Characters page.
  babyVambieAppearance?: string;
  peopleStyle: string;
  imageModel: string;
  imageQuality: "low" | "medium" | "high";
}

export const EMBELLISHMENT_LEVELS: Record<EmbellishmentLevel, { label: string; rule: string }> = {
  minimal: {
    label: "Minimal",
    rule: "Stay as close to the memory as possible. Baby Vambie may only watch and feel; it does not speak or act in ways that change events. Add no dialogue the parent didn't report.",
  },
  moderate: {
    label: "Moderate",
    rule: "Baby Vambie is the fictional stand-in for the child and may add small actions, sounds and short lines of dialogue that fit the memory's feelings. When the memory says something vague (\"wanted to change things\"), the story may show it as two or three small, ordinary, concrete actions in the same place with the same people. Never add events, people, places or outcomes that aren't in the memory.",
  },
  imaginative: {
    label: "Imaginative",
    rule: "Baby Vambie may add playful imagined moments (a pretend game, a talking sprout) that are clearly make-believe, as long as the real events, people and outcome of the memory stay unchanged.",
  },
};

export const IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"];

// The chosen art direction: classic ink line and watercolor wash, with the
// Vambies' signature colors as the only bright notes.
export const INK_AND_WASH_STYLE =
  "Art direction: a classic picture book drawn in expressive pen-and-ink line with fine cross-hatching, finished with transparent watercolor washes. Ink first, wash second: no 3D shading, glossy surfaces or smooth gradients. A muted, earthy palette (sage, olive, ochre, warm browns; dusky blue and violet for night and big feelings), in which the Vambies' signature colors, like Baby Vambie's aqua, are the only clear, bright colors. Warm cream paper texture. Simple faces; feelings show through posture and small gestures. Keep faces and the key action inside the central 80% of the frame. No text, letters, numbers or words anywhere in the image.";

// Everyone in the book is a Vambie in their own skin tone (VSB-86). Baby Vambie
// alone is teal-blue. Family-member designs follow this too.
export const PEOPLE_AS_VAMBIES =
  "Everyone in this world is a Vambie, never a human. Draw every person with the same creature design as Baby Vambie: an oversized round head on a small simple body with short arms and legs (about two and a half heads tall), huge round eyes with dark shadowy rings and small dark pupils, and two tiny fangs. Keep those Vambie proportions for everyone: grown-ups are only a little taller than children, and words like tall or broad change their size a little, never into human proportions. Each keeps their own skin tone, the same shade, and who they are shows through their skin tone, hair, glasses, clothes and accessories. Anyone whose skin tone isn't given has the classic Vambie pale gray-white skin. Teal-blue belongs to Baby Vambie alone: no one else is teal, blue or aqua. A description that says man, woman, child or person still means a Vambie of that age. Pets and other animals keep their own body, coat and markings and stand the way that animal does, with the Vambie eyes and tiny fangs. Never photorealistic.";

export const DEFAULT_RULES: PageRules = {
  readingProfiles: {
    read_to_me: {
      label: "Read to me · Ages 0–3",
      pagesMin: 4,
      pagesMax: 6,
      maxWordsPerPage: 15,
      maxWordsPerSentence: 8,
      vocabulary: "Very simple, concrete words a toddler hears every day, read aloud by a grown-up. Rhythm, repetition and sound words are welcome. One short line per page.",
      pictures: "A big picture on every page (mostly full and framed), and one wordless page for the most meaningful moment.",
    },
    picture_book: {
      label: "Picture book · Ages 3–5",
      pagesMin: 6,
      pagesMax: 8,
      maxWordsPerPage: 35,
      maxWordsPerSentence: 10,
      vocabulary: "Warm, simple words with a little rhythm; name feelings directly. A few short sentences per page.",
      pictures: "A picture on every page: a vignette to open, framed pictures as the feeling builds, a full page for the biggest moment.",
    },
    early_reader: {
      label: "Early reader · Ages 5–7",
      pagesMin: 6,
      pagesMax: 8,
      maxWordsPerPage: 50,
      maxWordsPerSentence: 12,
      vocabulary: "Short sentences a new reader can sound out, with simple dialogue. Name feelings directly.",
      pictures: "Mostly small vignettes and framed pictures above the text, so the words have room.",
    },
    chapter_book: {
      label: "Chapter book · Ages 7–9",
      pagesMin: 6,
      pagesMax: 10,
      maxWordsPerPage: 110,
      maxWordsPerSentence: 18,
      vocabulary: "Fuller sentences with dialogue and inner thoughts; short scenes that build. Feelings can be layered.",
      pictures: "Small spot pictures (vignettes) on about every other page; the pages between are text only (picture size none).",
    },
    big_kid: {
      label: "Big kid · Ages 9–12",
      pagesMin: 4,
      pagesMax: 8,
      maxWordsPerPage: 230,
      maxWordsPerSentence: 24,
      vocabulary: "Rich vocabulary and full paragraphs; real emotional nuance, inner voice and reflection.",
      pictures: "One opening picture (framed or full) on page 1; every other page is text only (picture size none).",
    },
  },
  embellishment: "moderate",
  illustrationStyle: INK_AND_WASH_STYLE,
  peopleStyle: PEOPLE_AS_VAMBIES,
  imageModel: "gpt-image-2",
  imageQuality: "medium",
};

export interface ActiveRuleSet {
  version: number;
  rules: PageRules;
  createdAt: Date;
}

// The newest version; version 1 is created from the defaults on first use.
export async function getActiveRules(): Promise<ActiveRuleSet> {
  const latest = await prisma.generationRuleSet.findFirst({ orderBy: { version: "desc" } });
  if (latest) return { version: latest.version, rules: JSON.parse(latest.rules), createdAt: latest.createdAt };
  const created = await prisma.generationRuleSet.create({ data: { version: 1, rules: JSON.stringify(DEFAULT_RULES) } });
  return { version: 1, rules: DEFAULT_RULES, createdAt: created.createdAt };
}

// Returns an error message, or null if the rules are usable.
export function validateRules(rules: any): string | null {
  if (!rules || typeof rules !== "object") return "Rules are missing.";
  for (const band of STAGE_KEYS) {
    const p = rules.readingProfiles?.[band];
    if (!p) return `Missing the reading profile for the ${band.replace(/_/g, " ")} stage.`;
    if (p.pictures !== undefined && typeof p.pictures !== "string") return `${p.label}: the picture pattern must be text.`;
    for (const field of ["pagesMin", "pagesMax", "maxWordsPerPage", "maxWordsPerSentence"] as const) {
      if (!Number.isInteger(p[field]) || p[field] < 1) return `${p.label}: ${field} must be a whole number above 0.`;
    }
    if (p.pagesMin > p.pagesMax) return `${p.label}: the minimum page count is above the maximum.`;
    if (p.pagesMax > 16) return `${p.label}: at most 16 pages per chapter.`;
    if (p.maxWordsPerSentence > p.maxWordsPerPage) return `${p.label}: words per sentence can't exceed words per page.`;
  }
  if (!(rules.embellishment in EMBELLISHMENT_LEVELS)) return "Pick an embellishment level.";
  for (const field of ["illustrationStyle", "peopleStyle"] as const) {
    if (typeof rules[field] !== "string" || !rules[field].trim()) return `${field} can't be empty.`;
  }
  if (!IMAGE_MODELS.includes(rules.imageModel)) return "Pick one of the listed image models.";
  if (!["low", "medium", "high"].includes(rules.imageQuality)) return "Pick an image quality.";
  return null;
}

export async function saveRules(rules: PageRules): Promise<ActiveRuleSet> {
  const { version } = await getActiveRules();
  const { babyVambieAppearance: _moved, ...current } = rules; // now on the Characters page
  const created = await prisma.generationRuleSet.create({ data: { version: version + 1, rules: JSON.stringify(current) } });
  return { version: created.version, rules: current, createdAt: created.createdAt };
}

// Accepts a stage key or a reading level from before the stages existed.
export const profileFor = (rules: PageRules, band: string): ReadingProfile => {
  const stage = normalizeStage(band);
  return rules.readingProfiles[stage] ?? DEFAULT_RULES.readingProfiles[stage];
};

// Reading-level text given to the AI for the page plan and checks.
export const describeProfile = (p: ReadingProfile) =>
  `${p.label}. ${p.vocabulary} Use ${p.pagesMin}-${p.pagesMax} pages. Each page's text: at most ${p.maxWordsPerPage} words, and no sentence longer than ${p.maxWordsPerSentence} words.${p.pictures ? ` Pictures: ${p.pictures}` : ""}`;

// Deterministic limit checks; returns one note per problem.
export function checkPageLimits(text: string, p: ReadingProfile): string[] {
  const notes: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) notes.push("This page has no text.");
  if (words.length > p.maxWordsPerPage) notes.push(`Text is ${words.length} words; the limit for this reading level is ${p.maxWordsPerPage}.`);
  const longest = text
    .split(/[.!?…]+["”’)]*\s*/)
    .map((s) => s.trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => Math.max(a, b), 0);
  if (longest > p.maxWordsPerSentence) notes.push(`A sentence is ${longest} words; the limit is ${p.maxWordsPerSentence}.`);
  return notes;
}
