import type { PageRules } from "./pageRules";

// Shot rules (VSB-108): the shot types a page may use, each with the framing
// line its picture prompt gets; the shots that don't work on a Vambie; and how a
// planned shot is matched against both. The lists live in Page Rules (admins
// edit them; each save is a new version); the matching lives here, so a chapter
// made with an older version is judged by the lists it snapshotted.

export interface ShotType {
  key: string; // one of SHOT_KEYS; fixed, so matching never depends on the label
  label: string;
  framing: string; // the line the picture prompt gets
}

export interface BlockedShot {
  id: string; // B-1, B-2…; never reused
  pattern: string; // words that mark the shot, comma-separated: "feet, ankle height"
  why: string;
  instead: string;
}

export interface Shot {
  type: string;
  angle: string;
  focus: string;
}

export const SHOT_KEYS = ["wide", "medium", "close_up", "extreme_close_up", "over_shoulder", "birds_eye", "low_angle"] as const;

export const DEFAULT_SHOT_TYPES: ShotType[] = [
  { key: "wide", label: "Wide establishing", framing: "Wide shot: the place fills the frame and the characters are small in it." },
  { key: "medium", label: "Medium", framing: "Medium shot: characters from about the knees or waist up, filling the frame; most of the room is cropped out." },
  { key: "close_up", label: "Close-up", framing: "Close-up: the focus fills most of the frame. A face is cropped at the shoulders or tighter, and little of the room shows." },
  {
    key: "extreme_close_up",
    label: "Extreme close-up",
    framing: "Extreme close-up: only the focus (an eye, a mouth, hands, a small object) fills the frame, cropped tight. Nothing else of the scene or the characters' bodies shows.",
  },
  {
    key: "over_shoulder",
    label: "Over-the-shoulder",
    framing: "Over-the-shoulder: one character's back, shoulder and head are large in the near foreground at one side, cut off by the frame, and we look past them at the other.",
  },
  { key: "birds_eye", label: "Bird's-eye", framing: "Bird's-eye view: looking straight down from high above, so we see the tops of heads and the floor around them." },
  { key: "low_angle", label: "Low angle", framing: "Low angle: the camera is at about waist height looking up, so the subject looms above; the whole head stays in frame." },
];

// What testing taught us about a creature with a huge head and tiny legs.
export const DEFAULT_BLOCKED_SHOTS: BlockedShot[] = [
  {
    id: "B-1",
    pattern: "feet, foot, toes, legs, leg, ankle, ankles, knees",
    why: "Tiny legs under a huge head read as extra feet or a looming body when they fill the frame.",
    instead: "A medium shot from the side with the whole body in the frame, or a close-up on the face or hands.",
  },
  {
    id: "B-2",
    pattern: "ankle height, knee height, ground level, floor level, foot level, from below, worm's-eye, from the ground",
    why: "A camera below waist height distorts a Vambie's body and crops the head.",
    instead: "A low angle from about waist height, with the whole head in frame.",
  },
];

// Flagged pages before a shot pattern is proposed for review.
export const DEFAULT_SHOT_REVIEW_THRESHOLD = 3;

// Older rule versions (and the chapters that snapshot them) have no shot lists.
type RulesLike = Partial<Pick<PageRules, "shotTypes" | "blockedShots" | "shotReviewThreshold">> | undefined | null;
export const shotTypesOf = (rules: RulesLike) => (rules?.shotTypes?.length ? rules.shotTypes : DEFAULT_SHOT_TYPES);
export const blockedShotsOf = (rules: RulesLike) => rules?.blockedShots ?? DEFAULT_BLOCKED_SHOTS;
export const shotThresholdOf = (rules: RulesLike) => rules?.shotReviewThreshold ?? DEFAULT_SHOT_REVIEW_THRESHOLD;

// How a planned type is read. "Extreme close-up" also says "close", so it wins over close-up.
const MATCHERS: [key: string, pattern: RegExp][] = [
  ["extreme_close_up", /extreme[\s-]*close/],
  ["close_up", /close[\s-]*up|\bclose\b/],
  ["wide", /\bwide\b|establishing/],
  ["medium", /\bmedium\b|\bmid[\s-]*shot\b/],
  ["over_shoulder", /over[\s-]*the[\s-]*shoulder|over[\s-]*shoulder/],
  ["birds_eye", /bird|overhead|top[\s-]*down|straight down/],
  ["low_angle", /low[\s-]*angle|\blow\b/],
];

// The shot type keys a planned type names: one for a clean type, none for an
// unknown one, several for a composite like "low close-up".
export function shotTypeKeys(type: string | null | undefined): string[] {
  const t = (type ?? "").toLowerCase();
  const keys = MATCHERS.filter(([, pattern]) => pattern.test(t)).map(([key]) => key);
  return keys.includes("extreme_close_up") ? keys.filter((k) => k !== "close_up") : keys;
}

// Strict: the one type a clean shot names, or null.
export const shotTypeKey = (type: string | null | undefined) => {
  const keys = shotTypeKeys(type);
  return keys.length === 1 ? keys[0] : null;
};

// Lenient: the first type a composite names, for drawing pages planned before
// the shot rules existed ("low close-up" is framed as a close-up).
export const primaryShotKey = (type: string | null | undefined) => shotTypeKeys(type)[0] ?? null;

export const shotTypeLabel = (key: string, rules?: RulesLike) =>
  shotTypesOf(rules).find((t) => t.key === key)?.label ?? DEFAULT_SHOT_TYPES.find((t) => t.key === key)?.label ?? key;

// The framing line a picture prompt gets for a shot.
export function shotFramingFor(shot: Shot | null, rules?: RulesLike) {
  const key = shot && primaryShotKey(shot.type);
  if (!key) return "";
  return shotTypesOf(rules).find((t) => t.key === key)?.framing ?? DEFAULT_SHOT_TYPES.find((t) => t.key === key)?.framing ?? "";
}

export const isCloseUpShot = (shot: Shot | null) => {
  const key = shot && primaryShotKey(shot.type);
  return key === "close_up" || key === "extreme_close_up";
};

// --- Shots that don't work ---

const phrasesOf = (pattern: string) =>
  pattern
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasPhrase = (text: string, phrase: string) => new RegExp(`(^|[^a-z])${escape(phrase)}(?=[^a-z]|$)`).test(text);

export function blockedShotHits(shot: Shot, rules?: RulesLike): { rule: BlockedShot; phrase: string }[] {
  const text = `${shot.type} ${shot.angle} ${shot.focus}`.toLowerCase();
  const hits: { rule: BlockedShot; phrase: string }[] = [];
  for (const rule of blockedShotsOf(rules)) {
    const phrase = phrasesOf(rule.pattern).find((p) => hasPhrase(text, p));
    if (phrase) hits.push({ rule, phrase });
  }
  return hits;
}

export interface ShotCheck {
  ok: boolean;
  key: string | null;
  reasons: string[];
  // A mixed or unknown type, or a blocked pattern, gets one replan before drawing.
  // A focus that names two things is only noted: the planner is asked for one.
  replan: boolean;
}

export function checkShot(shot: Shot | null, rules?: RulesLike): ShotCheck {
  if (!shot) return { ok: true, key: null, reasons: [], replan: false };
  const reasons: string[] = [];
  let replan = false;
  const keys = shotTypeKeys(shot.type);
  if (keys.length === 0) {
    reasons.push(`"${shot.type}" isn't one of the allowed shot types (${shotTypesOf(rules).map((t) => t.label).join(", ")})`);
    replan = true;
  } else if (keys.length > 1) {
    reasons.push(`"${shot.type}" mixes two shot types (${keys.map((k) => shotTypeLabel(k, rules)).join(" and ")}); a shot is exactly one of them`);
    replan = true;
  }
  if (/\band\b/.test(shot.focus.toLowerCase())) reasons.push(`the focus names more than one thing ("${shot.focus}"); a shot has one focus`);
  for (const hit of blockedShotHits(shot, rules)) {
    reasons.push(`${hit.rule.id}, "${hit.phrase}": a shot that doesn't work on a Vambie (${hit.rule.why.replace(/\.$/, "")}). Use instead: ${hit.rule.instead}`);
    replan = true;
  }
  return { ok: reasons.length === 0, key: keys.length === 1 ? keys[0] : null, reasons, replan };
}

// --- How the queue groups planned shots (VSB-108) ---

const ANGLES: [label: string, pattern: RegExp][] = [
  ["from below", /ankle|knee height|ground|floor|from below|worm|foot level/],
  ["from above", /from above|overhead|bird|top[\s-]*down|straight down|looking down/],
  ["from behind", /behind|back of/],
  ["over the shoulder", /shoulder/],
  ["point of view", /point of view|\bpov\b|through .* eyes/],
  ["from the side", /\bside\b|profile/],
  ["eye level", /eye[\s-]*level|straight on|head[\s-]*on/],
];
const SUBJECTS: [label: string, pattern: RegExp][] = [
  ["feet or legs", /\bfeet\b|\bfoot\b|\btoes?\b|\blegs?\b|\bankles?\b|\bknees?\b/],
  ["face or eyes", /\bface\b|\beyes?\b|\bmouth\b|\bbrows?\b|\bcheeks?\b|\bsmile\b|\btears?\b/],
  ["hands", /\bhands?\b|\bfingers?\b|\bpalms?\b|\bfists?\b/],
  ["whole body", /whole body|full body|\bbody\b|\bfigure\b|silhouette/],
  ["two people", /\btogether\b|\bboth\b|\bhug|\bholding\b|\band\b/],
  ["the place", /\broom\b|\bgarden\b|\bbeach\b|\bshore\b|\bkitchen\b|\byard\b|\bpark\b|\bsky\b|\bsea\b|\bocean\b|\bwaves?\b|\bwindow\b|\bdoor\b|\bbed\b|\btable\b|\bhouse\b|\bstreet\b/],
];

// "Low angle · from below · on feet or legs": the same signature for every shot
// that fails the same way, however the planner worded it.
export function shotSignature(shot: Shot | null, rules?: RulesLike): string | null {
  if (!shot?.type) return null;
  const keys = shotTypeKeys(shot.type);
  const type = keys.length === 1 ? shotTypeLabel(keys[0], rules) : keys.length > 1 ? `mixed: ${keys.map((k) => shotTypeLabel(k, rules)).join(" + ")}` : `unknown: ${shot.type}`;
  const angleText = `${shot.type} ${shot.angle}`.toLowerCase();
  const angle = ANGLES.find(([, pattern]) => pattern.test(angleText))?.[0];
  const subject = SUBJECTS.find(([, pattern]) => pattern.test(shot.focus.toLowerCase()))?.[0] ?? "other";
  return [type, angle, `on ${subject}`].filter(Boolean).join(" · ");
}

// The words a blocked-shot pattern could start from, taken from the shots themselves.
const VOCABULARY = [
  "ankle height", "knee height", "ground level", "floor level", "foot level", "from below", "worm's-eye", "from behind", "from above", "overhead", "bird's-eye",
  "profile", "silhouette", "feet", "foot", "toes", "legs", "leg", "ankles", "ankle", "knees", "hands", "fingers", "eye", "eyes", "mouth", "face", "back of the head", "reflection", "shadow",
];
export function draftBlockedPattern(shots: Shot[]): string {
  const text = shots.map((s) => `${s.type} ${s.angle} ${s.focus}`.toLowerCase()).join(" | ");
  // "bird's-eye" shouldn't also draft "eye".
  const found = VOCABULARY.filter((word) => hasPhrase(text, word)).filter((word, _, all) => !all.some((other) => other !== word && other.includes(word)));
  if (found.length) return found.join(", ");
  const focus = shots[0]?.focus.trim();
  return focus ? focus.split(/\s+/).slice(0, 3).join(" ").toLowerCase() : "";
}

// --- What the planner is told ---

export function describeShotRules(rules?: RulesLike) {
  const blocked = blockedShotsOf(rules);
  return [
    `Allowed shot types (write the type exactly as one of these, never two combined): ${shotTypesOf(rules)
      .map((t) => t.label)
      .join("; ")}.`,
    `One focus per shot: "focus" names the single thing the picture centers on.`,
    blocked.length
      ? `Shots that don't work on a Vambie (never plan these):\n${blocked.map((b) => `- ${b.id}: ${b.pattern}. ${b.why} Use instead: ${b.instead}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Instruction bodies saved before the shot rules existed (and chapters that
// snapshot them) get the rules appended, so every planner call sees them.
export const withShotRules = (body: string) => (body.includes("<shot_rules>") ? body : `${body.trimEnd()}\n\nShot rules\n<shot_rules>`);
