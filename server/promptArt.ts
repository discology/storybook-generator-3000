import fs from "fs";
import path from "path";
import { toFile } from "openai";
import { prisma } from "./db";
import { getOpenAI } from "./openaiClient";
import { withImageRateLimit } from "./imageQueue";
import { recordImage } from "./aiUsage";
import { fillPrompt, neutralPromptValues } from "./promptVariables";

// Prompt card artwork: the library admins pick from (Baby Vambie's card poses
// and every picture made for a card), and new pictures drawn from a card's
// question in the same 3D style as the poses.

export const PROMPT_ART_DIR = path.join("uploads", "prompts");
const POSES_DIR = path.join("public", "art");
// Baby Vambie's official 3D render: the reference every card pose was drawn from.
const REFERENCE = path.join("server", "assets", "baby-vambie-render.png");
const MODEL = "gpt-image-1.5"; // gpt-image-2 can't draw transparent backgrounds on this account
export const PICTURES_PER_CLICK = 2;

const CHARACTER =
  "Baby Vambie, exactly as in the reference render: the same character design, head shape, proportions, colors and materials (soft matte aqua skin, large white eyes with small black pupils inside thick black eye rings, a small mouth with little white fangs, a simple rounded body with short arms and legs). Keep him on-model; only the pose, expression and props change.";
const STYLE =
  "Polished 3D animated-film character render, soft studio light with a gentle violet rim light from behind, crisp clean silhouette. Transparent background: the character and his props only, with no floor, no ground shadow, no scenery. No text, letters, numbers or words anywhere, including on props.";
const CARD_COLORS: Record<string, string> = { purple: "purple", gold: "golden yellow", pink: "pink", green: "lime green" };

export interface LibraryPicture {
  path: string;
  label: string;
  source: "pose" | "generated" | "upload";
  createdAt?: Date;
}

const words = (file: string) =>
  file
    .replace(/^vambie-/, "")
    .replace(/\.\w+$/, "")
    .replace(/-/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

// The 14 Baby Vambie poses the app uses (public/art/vambie-*.webp).
export function cardPoses(): LibraryPicture[] {
  const dir = path.join(process.cwd(), POSES_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^vambie-[\w-]+\.webp$/.test(f))
    .sort()
    .map((f) => ({ path: `art/${f}`, label: words(f), source: "pose" as const }));
}

// Every picture generated or uploaded for a card, newest first. Pictures a card
// used before the library existed are included under that card's question.
export async function madeForCards(): Promise<LibraryPicture[]> {
  const [rows, prompts] = await Promise.all([
    prisma.promptArtwork.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.prompt.findMany({ where: { artworkPath: { startsWith: "uploads/prompts/" } } }),
  ]);
  const known = new Set(rows.map((r) => r.imagePath));
  return [
    ...rows.map((r) => ({ path: r.imagePath, label: r.question, source: r.source as "generated" | "upload", createdAt: r.createdAt })),
    ...prompts
      .filter((p) => !known.has(p.artworkPath!))
      .map((p) => ({ path: p.artworkPath!, label: p.question, source: "upload" as const, createdAt: p.createdAt })),
  ];
}

// A card's artwork must come from the library (or be empty for Baby Vambie's default art).
export async function isLibraryPicture(imagePath: string) {
  return cardPoses().some((p) => p.path === imagePath) || (await madeForCards()).some((p) => p.path === imagePath);
}

export function savePromptArt(buffer: Buffer, ext: string) {
  const dir = path.join(process.cwd(), PROMPT_ART_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const name = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `${PROMPT_ART_DIR}/${name}`;
}

// Draws two pictures for a card's question in the card poses' 3D style, saves
// both to the library, and returns them. Applying one is up to the admin.
export async function generatePromptArt(input: { question: string; supportingText?: string | null; idea?: string | null; cardColor?: string | null }) {
  const client = getOpenAI();
  if (!client) throw new Error("Drawing pictures needs an OpenAI API key (OPENAI_API_KEY).");
  const question = input.question.trim();
  if (!question) throw new Error("Write the question first.");
  // No family is known here, so variables become neutral words ("the child").
  const asked = fillPrompt(question, neutralPromptValues);
  const supporting = fillPrompt(input.supportingText?.trim() ?? "", neutralPromptValues);
  const idea = input.idea?.trim() || null;
  const color = CARD_COLORS[input.cardColor ?? ""] ?? "purple";

  const prompt = [
    CHARACTER,
    `This picture goes on a memory prompt card in a family storybook app. The card asks: "${asked}"${supporting ? ` (${supporting})` : ""}.`,
    idea
      ? `Picture: ${idea}`
      : "Show Baby Vambie in a pose, with an expression and one or two simple props, that makes the question easy to understand at a glance. Keep it warm and gentle, and clear at a small size.",
    `The card behind him is ${color}, so give the props colors that stand out against ${color}.`,
    STYLE,
  ].join("\n\n");

  const reference = path.join(process.cwd(), REFERENCE);
  const response = await withImageRateLimit(1, async () =>
    client.images.edit({
      model: MODEL,
      prompt,
      image: [await toFile(fs.createReadStream(reference), path.basename(reference), { type: "image/png" })],
      n: PICTURES_PER_CLICK,
      size: "1024x1024",
      quality: "high",
      input_fidelity: "high",
      background: "transparent",
      output_format: "webp",
      output_compression: 90,
    })
  );
  // Only admins edit cards (server.ts), though not under /api/admin.
  await recordImage("prompt_art", MODEL, response, { size: "1024x1024", quality: "high" }, { trigger: "admin" });
  const images = (response.data ?? []).map((d) => d.b64_json).filter((b): b is string => Boolean(b));
  if (!images.length) throw new Error("The image service returned no picture.");
  return Promise.all(
    images.map((b64) =>
      prisma.promptArtwork.create({ data: { imagePath: savePromptArt(Buffer.from(b64, "base64"), ".webp"), source: "generated", question, idea } })
    )
  );
}
