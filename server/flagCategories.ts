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

// Parents' chapter feedback (StoryFeedback reasons), shown in the same queue,
// and the signals recorded when a parent fixes a page themselves (VSB-107).
export const FAMILY_CATEGORIES: Record<string, string> = {
  missed_meaning: "Family: missed what they meant",
  too_private: "Family: too private",
  reading_level: "Family: reading level",
  wrong_detail: "Family: wrong character or detail",
  other_family: "Family: something else",
  redraw_requested: "Family: asked for a redraw",
  change_requested: "Family: asked for a change",
};

// "Something's off" on a page, in a parent's words (VSB-107), each mapped onto
// the team's categories so counts and the analysis stay coherent.
export const PARENT_REASONS: Record<string, { label: string; target: "picture" | "words" | "both"; categories: string[] }> = {
  not_like_memory: { label: "It doesn't look like the memory", target: "picture", categories: ["action"] },
  wrong_person: { label: "The wrong person, or they don't look right", target: "picture", categories: ["off_model"] },
  face_pose: { label: "The face or pose feels wrong", target: "picture", categories: ["expression"] },
  cut_off_busy: { label: "The picture is cut off or too busy", target: "picture", categories: ["camera", "composition"] },
  words_off: { label: "The words don't sound right", target: "words", categories: ["voice"] },
  other: { label: "Something else", target: "both", categories: ["other_family"] },
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
