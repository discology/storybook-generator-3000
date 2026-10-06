import fs from "fs";
import path from "path";
import { prisma } from "./db";
import type { Prisma } from "../src/generated/prisma/client";
import { AI_STEPS } from "./aiInstructions";
import { MESSAGE_TYPES } from "./messageTemplates";
import { getActiveRules } from "./pageRules";
import { getOpenAI } from "./openaiClient";

// The Character Library: recurring characters (the Vambies) with locked looks,
// personalities and reference art. AI instructions reference a character as
// <key>; each chapter snapshots the cast it was made with, so later edits to a
// character never change existing books.

const CHARACTERS_DIR = path.join(process.cwd(), "uploads", "characters");

export const CASTING_MODES = {
  always: { label: "In every chapter", description: "Always part of the cast, like Baby Vambie standing in for the child." },
  when_it_fits: { label: "When the memory fits", description: "The story may include them when the memory matches their casting notes." },
  only_when_picked: { label: "Only when picked", description: "Appears only when a parent picks them for a chapter." },
} as const;
export type CastingMode = keyof typeof CASTING_MODES;

export const CHARACTER_STATUSES = ["draft", "active", "retired"] as const;

export type CharacterWithArt = Prisma.CharacterGetPayload<{ include: { art: true } }>;

// A character as a chapter used it.
export interface CastMember {
  key: string;
  name: string;
  storyRole: string;
  personality: string;
  appearance: string;
  neverRules: string;
  castingNotes: string;
  referenceImage: string | null;
  // Labeled official renders (view × expression, per look set) for matching
  // each page's mood and camera angle. Absent on older chapter snapshots.
  renders?: CharacterRender[];
  version: number;
  required: boolean; // always cast or picked by the parent; otherwise optional
}

export interface CharacterRender {
  view: string; // front | angle | side
  expression: string; // happy | sad | excited | angry | surprised | in_love | amused
  set: string; // "" for the usual look, or e.g. "with guitar"
  path: string;
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

// Variable names the app already uses can't be character keys.
const reservedKeys = () =>
  new Set([
    "cast",
    ...AI_STEPS.flatMap((s) => s.variables.map((v) => v.name)),
    ...MESSAGE_TYPES.flatMap((t) => t.variables.map((v) => v.name)),
  ]);

export function validateKey(key: string): string | null {
  if (!KEY_PATTERN.test(key)) return "Use 2-40 lowercase letters, numbers or underscores, starting with a letter (for example wolf_vambie).";
  if (reservedKeys().has(key)) return `<${key}> is already used by the app. Pick another name.`;
  return null;
}

export const referenceImageOf = (c: CharacterWithArt) => c.art.find((a) => a.id === c.referenceArtId)?.imagePath ?? null;

type CardFields = Pick<CastMember, "name" | "appearance" | "neverRules" | "personality" | "storyRole">;

// What <key> turns into. One line, so it reads naturally mid-sentence.
export function characterCard(c: CardFields) {
  const parts = [
    c.appearance && `look: ${c.appearance}`,
    c.neverRules && `never: ${c.neverRules}`,
    c.personality && `personality: ${c.personality}`,
    c.storyRole && `role: ${c.storyRole}`,
  ].filter(Boolean);
  return parts.length ? `${c.name} (${parts.join("; ")})` : c.name;
}

// What <cast> turns into: the chapter's recurring characters, one block each.
export function describeCast(cast: CastMember[]) {
  if (cast.length === 0) return "(No recurring characters for this chapter.)";
  return cast
    .map((c) =>
      [
        `- ${c.key}: ${c.name}. ${c.required ? "Required in this chapter." : `Optional: include only if the memory clearly fits: ${c.castingNotes || "(no casting notes)"}`}`,
        c.storyRole && `  Role: ${c.storyRole}`,
        c.appearance && `  Look: ${c.appearance}`,
        c.neverRules && `  Never: ${c.neverRules}`,
        c.personality && `  Personality: ${c.personality}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
}

const toCastMember = (c: CharacterWithArt, required: boolean): CastMember => ({
  key: c.key,
  name: c.name,
  storyRole: c.storyRole,
  personality: c.personality,
  appearance: c.appearance,
  neverRules: c.neverRules,
  castingNotes: c.castingNotes,
  referenceImage: referenceImageOf(c),
  renders: c.art
    .filter((a) => a.view && a.expression)
    .map((a) => ({ view: a.view!, expression: a.expression!, set: a.artSet, path: a.imagePath })),
  version: c.version,
  required,
});

// --- Picking renders for a page ---

// The first of these feelings named in a page's emotional tone (or, failing
// that, its action) picks the expression render.
const MOODS: [string, RegExp][] = [
  ["happy", /\b(happy|happi|joy|glad|cheer|content|proud|pride|warm|calm|peace|cozy|grateful|gentle|hopeful|relie|bright|smil)/],
  ["sad", /\b(sad|lonely|disappoint|sorrow|tear|cry|cries|gloom|hurt|grief|upset|worr|anxious|nervous|scared|afraid|fear|guilt)/],
  ["excited", /\b(excit|eager|thrill|buzz|energ|anticipat|bounc|wiggl)/],
  ["angry", /\b(angry|anger|frustrat|mad\b|cross\b|annoy|grump|furious)/],
  ["surprised", /\b(surpris|amaz|astonish|wonder|shock|gasp|startl|awe\b|curious|curiosity)/],
  ["in_love", /\b(love|loving|tender|affection|ador|cuddl|hug|fond)/],
  ["amused", /\b(amus|playful|silly|giggl|laugh|funny|mischiev|goofy)/],
];

export function moodExpression(tone: string, action = ""): string | null {
  for (const text of [tone.toLowerCase(), action.toLowerCase()]) {
    let best: { expression: string; index: number } | null = null;
    for (const [expression, pattern] of MOODS) {
      const index = text.search(pattern);
      if (index >= 0 && (!best || index < best.index)) best = { expression, index };
    }
    if (best) return best.expression;
  }
  return null;
}

// Close-ups and front-facing shots use front renders, side and profile shots
// side renders, everything else the three-quarter angle.
export function viewForShot(shot: { type?: string; angle?: string } | null): "front" | "angle" | "side" {
  const text = `${shot?.type ?? ""} ${shot?.angle ?? ""}`.toLowerCase();
  if (/\b(profile|side view|from the side|side-on)\b/.test(text)) return "side";
  if (/behind|over-the-shoulder|over the shoulder|bird/.test(text)) return "angle";
  if (/close-up|close up|front|facing/.test(text)) return "front";
  return "angle";
}

const VIEW_LABELS: Record<string, string> = { front: "front", angle: "three-quarter angle", side: "side" };

// The renders to attach for a cast member on a page: the expression for the
// page's mood and their shape from the page's camera angle, from the look set
// the scene calls for (e.g. "with guitar" when a guitar is in the scene).
export function renderReferences(member: CastMember, page: { emotionalTone: string; visibleAction: string; setting: string }, shot: { type?: string; angle?: string } | null) {
  const renders = member.renders ?? [];
  if (!renders.length) return [];
  const scene = `${page.visibleAction} ${page.setting}`.toLowerCase();
  const sets = [...new Set(renders.map((r) => r.set))];
  const set = sets.find((s) => s && scene.includes(s.replace(/^with\s+/, "").toLowerCase())) ?? "";
  const inSet = renders.filter((r) => r.set === set);
  const find = (expression: string, view: string) => inSet.find((r) => r.expression === expression && r.view === view);
  const mood = moodExpression(page.emotionalTone, page.visibleAction);
  const view = viewForShot(shot);
  const picks: { path: string; label: string }[] = [];
  const style = `Draw ${member.name} in the book's illustration style, not as a 3D render.`;
  if (set) {
    const look = find("happy", "front");
    if (look) picks.push({ path: look.path, label: `${member.name} ${set} (official 3D render): use this look in this scene. ${style}` });
  }
  if (mood) {
    const r = find(mood, view) ?? find(mood, "front");
    if (r) {
      picks.push({
        path: r.path,
        label: `${member.name} looking ${mood.replace("_", " ")}, seen from the ${VIEW_LABELS[r.view]} (official 3D render): use it for ${member.name}'s face and expression on this page. ${style}`,
      });
    }
  }
  if (view !== "front") {
    const r = find(mood ?? "happy", view) ?? find("happy", view);
    if (r) picks.push({ path: r.path, label: `${member.name} seen from the ${VIEW_LABELS[view]} (official 3D render): keep ${member.name}'s shape and features from this angle. ${style}` });
  }
  return picks.filter((p, i) => p.path !== member.referenceImage && picks.findIndex((q) => q.path === p.path) === i);
}

// A chapter's cast: "always" characters and the parent's picks are required;
// active "when it fits" characters are optional. Throws on an unknown pick.
export async function buildCast(pickedKeys: string[]): Promise<CastMember[]> {
  const active = await prisma.character.findMany({ where: { status: "active" }, include: { art: true }, orderBy: { name: "asc" } });
  const unknown = pickedKeys.filter((k) => !active.some((c) => c.key === k));
  if (unknown.length) throw new Error(`Not an active character: ${unknown.join(", ")}`);
  const cast = active.flatMap((c) => {
    if (c.castingMode === "always" || pickedKeys.includes(c.key)) return [toCastMember(c, true)];
    return c.castingMode === "when_it_fits" ? [toCastMember(c, false)] : [];
  });
  return cast.sort((a, b) => Number(b.required) - Number(a.required));
}

// <key> values for every character in the library, whatever their status, so
// instructions can mention a character even when it isn't cast.
export async function characterCardValues(): Promise<Record<string, string>> {
  const all = await prisma.character.findMany();
  return Object.fromEntries(all.map((c) => [c.key, characterCard(c)]));
}

// For the AI instruction editor's variable list.
export async function characterVariables() {
  const all = await prisma.character.findMany({ orderBy: { name: "asc" } });
  return all.map((c) => ({ name: c.key, description: `${c.name} (${c.status})`, sample: characterCard(c) }));
}

export function saveCharacterImage(buffer: Buffer, fileName: string) {
  fs.mkdirSync(CHARACTERS_DIR, { recursive: true });
  const imagePath = path.join("uploads", "characters", fileName);
  fs.writeFileSync(path.join(process.cwd(), imagePath), buffer);
  return imagePath;
}

// Draws a plain, full-body reference picture from the character's look. It
// becomes the reference art once an admin picks it.
export async function generateCharacterArt(characterId: string) {
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  const client = getOpenAI();
  if (!client) throw new Error("Generating artwork needs an OpenAI API key (OPENAI_API_KEY).");
  if (!character.appearance.trim()) throw new Error("Describe how the character looks first.");
  const { rules } = await getActiveRules();
  const prompt = [
    rules.illustrationStyle,
    `Official character reference art for a picture book: ${character.name}, shown once, full body, front view, standing in a relaxed neutral pose, centered on a plain warm-cream background. No scenery, no props, no other characters, no labels.`,
    `Look: ${character.appearance}`,
    character.neverRules ? `Never: ${character.neverRules}` : "",
    "Do not include any text, letters or words in the image.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const response = await client.images.generate({ model: rules.imageModel, prompt, size: "1024x1024", quality: "high", output_format: "png" });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("The image service returned no image.");
  const imagePath = saveCharacterImage(Buffer.from(b64, "base64"), `${character.key}-${Date.now()}.png`);
  return prisma.characterArt.create({ data: { characterId, imagePath, source: "generated", prompt } });
}

// How many chapters were made with this character in their cast.
export const chaptersUsing = (key: string) =>
  prisma.chapter.count({ where: { generationSnapshot: { contains: `"key":"${key}"` } } });
