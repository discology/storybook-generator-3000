// What a flag on a page can be about (VSB-95). Shared with the admin screens
// through src/lib/flags.ts.

export const PICTURE_CATEGORIES: Record<string, string> = {
  camera: "Camera / framing",
  composition: "Composition",
  expression: "Expression / emotion",
  off_model: "Character off-model",
  action: "Wrong action or continuity",
  text_in_picture: "Text in the picture",
  style: "Art style",
};

export const WORDS_CATEGORIES: Record<string, string> = {
  voice: "Voice / tone",
  reading_level: "Reading level",
  facts: "Facts / accuracy",
  pacing: "Pacing / length",
  title: "Title",
};

// Parents' chapter feedback (StoryFeedback reasons), shown in the same queue.
export const FAMILY_CATEGORIES: Record<string, string> = {
  missed_meaning: "Family: missed what they meant",
  too_private: "Family: too private",
  reading_level: "Family: reading level",
  wrong_detail: "Family: wrong character or detail",
};

export const FLAG_CATEGORIES: Record<string, string> = { ...PICTURE_CATEGORIES, ...WORDS_CATEGORIES, ...FAMILY_CATEGORIES };

export const FLAG_STATUSES = ["new", "reviewed", "action", "dismissed"] as const;

export const ACTION_AREAS: Record<string, string> = {
  picture_prompt: "Picture prompt / camera and acting",
  page_rules: "Page Rules",
  planner: "Planner wording",
  characters: "Character art",
  other: "Other",
};
