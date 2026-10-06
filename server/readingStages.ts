// Five reading stages, from a baby being read to up to a 12-year-old reading
// alone. A storybook either grows with the child (the stage follows their age)
// or stays at a stage the family picked. Page counts and word limits per stage
// live in the Page Rules (admin), keyed by these stage keys.

export interface ReadingStage {
  key: string;
  label: string;
  ages: string;
  minAge: number; // the stage applies from this age when growing with the child
  summary: string;
}

export const READING_STAGES: ReadingStage[] = [
  { key: "read_to_me", label: "Read to me", ages: "0–3", minAge: 0, summary: "Gentle read-aloud stories: one big line under each picture." },
  { key: "picture_book", label: "Picture book", ages: "3–5", minAge: 3, summary: "A picture on every page and a few short sentences." },
  { key: "early_reader", label: "Early reader", ages: "5–7", minAge: 5, summary: "Short lines and dialogue they can start reading themselves." },
  { key: "chapter_book", label: "Chapter book", ages: "7–9", minAge: 7, summary: "Longer pages, spot pictures and some pages of just text." },
  { key: "big_kid", label: "Big kid", ages: "9–12", minAge: 9, summary: "An opening picture, then full pages of story." },
];

export const STAGE_KEYS = READING_STAGES.map((s) => s.key);

// Reading levels from before the stages existed.
const LEGACY: Record<string, string> = { "0-3": "read_to_me", "4-7": "early_reader", "8-12": "chapter_book" };

export const normalizeStage = (key: string | null | undefined) =>
  key && STAGE_KEYS.includes(key) ? key : (key && LEGACY[key]) || "read_to_me";

export const stageInfo = (key: string) => READING_STAGES.find((s) => s.key === normalizeStage(key))!;

// Birth dates are calendar dates stored at UTC midnight, so they're read in UTC
// and compared with today's local calendar date.
export function ageInYears(birthDate: Date | string | null | undefined, now = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getUTCMonth() || (now.getMonth() === birth.getUTCMonth() && now.getDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

export function stageForAge(age: number | null) {
  if (age === null) return "read_to_me";
  return [...READING_STAGES].reverse().find((s) => age >= s.minAge)!.key;
}

interface StorybookStageInput {
  readerAgeBand: string;
  growWithChild: boolean;
  vambieNameAge?: number;
  child: { stage: string; birthDate: Date | string | null };
}

// The stage new chapters are written at.
export function effectiveStage(storybook: StorybookStageInput, now = new Date()) {
  if (!storybook.growWithChild) return normalizeStage(storybook.readerAgeBand);
  if (storybook.child.stage === "expecting") return "read_to_me";
  return stageForAge(ageInYears(storybook.child.birthDate, now));
}

// "Baby Vambie" is called just "Vambie" once the child reaches the family's chosen age.
export function vambieName(storybook: StorybookStageInput, now = new Date()) {
  const age = storybook.child.stage === "expecting" ? null : ageInYears(storybook.child.birthDate, now);
  return age !== null && age >= (storybook.vambieNameAge ?? 4) ? "Vambie" : "Baby Vambie";
}
