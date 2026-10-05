import { prisma } from "./db";

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
}

export type EmbellishmentLevel = "minimal" | "moderate" | "imaginative";

export interface PageRules {
  readingProfiles: Record<string, ReadingProfile>;
  embellishment: EmbellishmentLevel;
  illustrationStyle: string;
  babyVambieAppearance: string;
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
    rule: "Baby Vambie is the fictional stand-in for the child and may add small actions, sounds and short lines of dialogue that fit the memory's feelings. Never add events, people, places or outcomes that aren't in the memory.",
  },
  imaginative: {
    label: "Imaginative",
    rule: "Baby Vambie may add playful imagined moments (a pretend game, a talking sprout) that are clearly make-believe, as long as the real events, people and outcome of the memory stay unchanged.",
  },
};

export const IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"];

export const DEFAULT_RULES: PageRules = {
  readingProfiles: {
    "0-3": {
      label: "Simple & short · Ages 0-3",
      pagesMin: 4,
      pagesMax: 6,
      maxWordsPerPage: 20,
      maxWordsPerSentence: 8,
      vocabulary: "Very simple, concrete words a toddler hears every day. Repetition and sound words are welcome.",
    },
    "4-7": {
      label: "A little more adventure · Ages 4-7",
      pagesMin: 6,
      pagesMax: 8,
      maxWordsPerPage: 40,
      maxWordsPerSentence: 12,
      vocabulary: "Simple, warm words an early reader can sound out; name feelings directly.",
    },
    "8-12": {
      label: "Longer stories · Ages 8-12",
      pagesMin: 6,
      pagesMax: 10,
      maxWordsPerPage: 80,
      maxWordsPerSentence: 18,
      vocabulary: "Richer vocabulary and fuller sentences; can hold more emotional nuance.",
    },
  },
  embellishment: "moderate",
  illustrationStyle:
    "Children's picture-book illustration, soft watercolor and gouache, warm natural light, gentle textures, cozy and calm. No text, letters, numbers or words anywhere in the image.",
  babyVambieAppearance:
    "Baby Vambie: a small, soft, round teal-blue creature with a round head, big friendly eyes and two tiny fangs. Smooth skin: no spikes, horns, wings or tail.",
  peopleStyle:
    "Draw family members as warm, simple storybook figures. Do not try to resemble real people, and never make them photorealistic.",
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
  for (const band of Object.keys(DEFAULT_RULES.readingProfiles)) {
    const p = rules.readingProfiles?.[band];
    if (!p) return `Missing reading profile for ages ${band}.`;
    for (const field of ["pagesMin", "pagesMax", "maxWordsPerPage", "maxWordsPerSentence"] as const) {
      if (!Number.isInteger(p[field]) || p[field] < 1) return `Ages ${band}: ${field} must be a whole number above 0.`;
    }
    if (p.pagesMin > p.pagesMax) return `Ages ${band}: the minimum page count is above the maximum.`;
    if (p.pagesMax > 16) return `Ages ${band}: at most 16 pages per chapter.`;
    if (p.maxWordsPerSentence > p.maxWordsPerPage) return `Ages ${band}: words per sentence can't exceed words per page.`;
  }
  if (!(rules.embellishment in EMBELLISHMENT_LEVELS)) return "Pick an embellishment level.";
  for (const field of ["illustrationStyle", "babyVambieAppearance", "peopleStyle"] as const) {
    if (typeof rules[field] !== "string" || !rules[field].trim()) return `${field} can't be empty.`;
  }
  if (!IMAGE_MODELS.includes(rules.imageModel)) return "Pick one of the listed image models.";
  if (!["low", "medium", "high"].includes(rules.imageQuality)) return "Pick an image quality.";
  return null;
}

export async function saveRules(rules: PageRules): Promise<ActiveRuleSet> {
  const { version } = await getActiveRules();
  const created = await prisma.generationRuleSet.create({ data: { version: version + 1, rules: JSON.stringify(rules) } });
  return { version: created.version, rules, createdAt: created.createdAt };
}

export const profileFor = (rules: PageRules, band: string): ReadingProfile =>
  rules.readingProfiles[band] ?? rules.readingProfiles["4-7"];

// Reading-level text given to the AI for the page plan and checks.
export const describeProfile = (p: ReadingProfile) =>
  `${p.label}. ${p.vocabulary} Use ${p.pagesMin}-${p.pagesMax} pages. Each page's text: at most ${p.maxWordsPerPage} words, and no sentence longer than ${p.maxWordsPerSentence} words.`;

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
