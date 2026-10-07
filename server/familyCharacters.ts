import fs from "fs";
import path from "path";
import { toFile } from "openai";
import { prisma } from "./db";
import type { Prisma } from "../src/generated/prisma/client";
import { getActiveRules } from "./pageRules";
import { getOpenAI } from "./openaiClient";
import { runAiStep } from "./aiService";
import { withImageRateLimit } from "./imageQueue";
import { recordImage } from "./aiUsage";
import { referenceImageOf } from "./characters";

// "Our Characters": each family's recurring people (and pets), drawn as Vambies in
// their own skin tones. A character has a permanent ID; their look lives in
// approved, versioned designs, one line per age variant. Every illustration a character appears in gets their approved design
// and reference sheet attached, and each page records the design version it used,
// so approving a new look never silently changes existing pages.

const DESIGNS_DIR = path.join("uploads", "characters", "family");
// Under uploads/private, which server.ts refuses to serve.
const PHOTOS_DIR = path.join("uploads", "private", "photos");

// What must never change about a character, and what a scene may change. Every
// Vambie shares the same head, eyes and fangs, so who they are is the rest.
export const FIXED_IDENTITY =
  "skin tone and distinctive features; hair color and usual hairstyle; height and build; signature glasses or accessories; the approved illustration style";
export const ALLOWED_VARIATIONS =
  "facial expression and pose; windblown or wet hair; camera angle and lighting; clothing that suits the activity; setting, season and time of day";

export type DesignWithProposals = Prisma.CharacterDesignGetPayload<{ include: { proposals: true } }>;
export type FamilyCharacterWithDesigns = Prisma.FamilyCharacterGetPayload<{ include: { designs: { include: { proposals: true } } } }>;

export const parseAliases = (json: string): string[] => {
  try {
    const list = JSON.parse(json);
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
};

// The approved design for each variant (newest approved version wins).
export function approvedVariants<T extends { variant: string; status: string; version: number }>(designs: T[]) {
  const byVariant = new Map<string, T>();
  for (const d of designs) {
    if (d.status !== "approved") continue;
    const current = byVariant.get(d.variant);
    if (!current || d.version > current.version) byVariant.set(d.variant, d);
  }
  return byVariant;
}

// --- The family cast a chapter is planned with ---

// One family character as a chapter's planner saw them. Refs (F1, F2…) are short
// handles for the AI; characterId and designId are what pages store.
export interface FamilyCastEntry {
  ref: string;
  characterId: string;
  name: string;
  relationship: string;
  aliases: string[];
  context: string;
  variants: { variant: string; designId: string; version: number; identity: string; usualClothing: string }[];
}

export async function buildFamilyCast(householdId: string): Promise<FamilyCastEntry[]> {
  const characters = await prisma.familyCharacter.findMany({
    where: { householdId },
    include: { designs: true },
    orderBy: { createdAt: "asc" },
  });
  return characters.map((c, i) => ({
    ref: `F${i + 1}`,
    characterId: c.id,
    name: c.name,
    relationship: c.relationship,
    aliases: parseAliases(c.aliases),
    context: c.context,
    variants: [...approvedVariants(c.designs).values()].map((d) => ({
      variant: d.variant,
      designId: d.id,
      version: d.version,
      identity: d.identity,
      usualClothing: d.usualClothing,
    })),
  }));
}

// What <family_cast> turns into.
export function describeFamilyCast(cast: FamilyCastEntry[]) {
  if (cast.length === 0) return "(No family characters saved yet.)";
  return cast
    .map((c) =>
      [
        `- ${c.ref}: ${c.name}`,
        c.relationship && `  Relationship to the child: ${c.relationship}`,
        c.aliases.length > 0 && `  Also called: ${c.aliases.join(", ")}`,
        c.context && `  Context: ${c.context}`,
        c.variants.length
          ? `  Approved looks: ${c.variants.map((v) => `"${v.variant}" (${v.identity || "no notes"})`).join("; ")}`
          : "  Approved looks: none yet (they can't be drawn until their look is approved)",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
}

// --- Files ---

function saveFile(dir: string, fileName: string, buffer: Buffer) {
  fs.mkdirSync(path.join(process.cwd(), dir), { recursive: true });
  const relative = path.join(dir, fileName);
  fs.writeFileSync(path.join(process.cwd(), relative), buffer);
  return relative;
}

export const savePhoto = (designId: string, buffer: Buffer, extension: string) =>
  saveFile(PHOTOS_DIR, `${designId}-${Date.now()}${extension}`, buffer);

const MIME_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
export const mimeTypeOf = (file: string) => MIME_TYPES[path.extname(file).toLowerCase()] ?? "image/png";
const toUpload = (relative: string) =>
  toFile(fs.createReadStream(path.join(process.cwd(), relative)), path.basename(relative), { type: mimeTypeOf(relative) });
const dataUrl = (relative: string) =>
  `data:${mimeTypeOf(relative)};base64,${fs.readFileSync(path.join(process.cwd(), relative)).toString("base64")}`;

// --- Proposals: candidate looks for a draft design ---

async function loadDesign(designId: string) {
  return prisma.characterDesign.findUniqueOrThrow({ where: { id: designId }, include: { familyCharacter: true, proposals: true } });
}

// The approved design a new version or variant should stay faithful to.
async function baseDesignFor(design: { id: string; familyCharacterId: string; variant: string }) {
  const approved = await prisma.characterDesign.findMany({
    where: { familyCharacterId: design.familyCharacterId, status: "approved", id: { not: design.id } },
    orderBy: { version: "desc" },
  });
  return approved.find((d) => d.variant === design.variant) ?? approved.find((d) => d.variant === "today") ?? approved[0] ?? null;
}

// Baby Vambie's art from the Character Library: the creature design every family
// Vambie shares.
async function vambieReference() {
  const baby = await prisma.character.findUnique({ where: { key: "baby_vambie" }, include: { art: true } });
  const art = baby && referenceImageOf(baby);
  return art && fs.existsSync(path.join(process.cwd(), art)) ? art : null;
}

// The note on a draft started with "Redraw as a Vambie".
export const VAMBIE_REDRAW_NOTE = "Redraw as a Vambie in their own skin tone";

// Draws one candidate look for a draft. Proposals are always Vambies; a design
// drawn as a person before VSB-86 is redrawn as one, keeping what makes them them.
export async function generateProposal(designId: string) {
  const design = await loadDesign(designId);
  if (design.status !== "draft") throw new Error("Only a draft design can get new proposals.");
  const client = getOpenAI();
  if (!client) throw new Error("Designing characters needs an OpenAI API key (OPENAI_API_KEY).");
  const { rules } = await getActiveRules();
  const character = design.familyCharacter;
  const base = await baseDesignFor(design);
  const references: { path: string; label: string }[] = [];
  const creature = await vambieReference();
  if (creature) {
    references.push({
      path: creature,
      label: "Baby Vambie, in this book's art style: the Vambie creature design (head, eyes, fangs, body and proportions) that every character shares. Don't copy Baby Vambie's teal-blue color, and don't draw Baby Vambie.",
    });
  }
  const ownLook =
    "match their skin tone exactly (the same shade, not lighter or yellower) and copy their hair color and style, distinctive features such as freckles or a beard, and any glasses or signature accessories, but not their human face or body proportions";
  let source = "";

  if (design.photoPath) {
    references.push({ path: design.photoPath, label: `A private photo of ${character.name}.` });
    source = `Draw ${character.name} from the photo as a Vambie who is recognizably them: ${ownLook}. Ignore the photo's background, lighting and clothing.`;
  } else if (base?.portraitPath) {
    const asPerson = base.look === "person";
    references.push({
      path: base.portraitPath,
      label: `${character.name}'s approved design${base.variant !== "today" ? ` ("${base.variant}")` : ""}${asPerson ? ", drawn as a person before everyone in the book became a Vambie" : ""}.`,
    });
    const change = design.changeNote && design.changeNote !== VAMBIE_REDRAW_NOTE ? ` Change only this: ${design.changeNote}.` : "";
    if (design.variant !== base.variant) {
      source = `Draw ${character.name} ${design.variant} as a Vambie, clearly recognizable as them. Keep what stays with a person over the years: skin tone and distinctive features${
        base.identity ? ` (${base.variant}: ${base.identity})` : ""
      }. Change what age changes: hair color and style (hair that is silver now would be its natural younger color), height and size (a child is child-sized like Baby Vambie), and clothes suited to that age and time. Keep glasses or accessories only if they would have had them then.${
        asPerson ? " From their design, copy only what fits: not their human face or body." : ""
      }`;
    } else if (asPerson) {
      source = `Redraw ${character.name} as a Vambie who is recognizably them: ${ownLook}. Keep their clothes.${change}`;
    } else {
      source = `Draw ${character.name} exactly as in their approved design.${change} Everything else stays exactly the same.`;
    }
  }

  const prompt = [
    rules.illustrationStyle,
    rules.peopleStyle,
    references.length ? `Attached images, in order:\n${references.map((r, i) => `${i + 1}. ${r.label}`).join("\n")}` : "",
    source,
    `Character design for a children's picture book: ${character.name}${character.relationship ? `, ${character.relationship}` : ""}${design.variant !== "today" ? `, ${design.variant}` : ""}, as a Vambie. Show only ${character.name}, once: no other people or animals. Full body, front view, relaxed neutral pose (if ${character.name} is a pet, standing the way that animal does), gentle expression, centered on a plain warm-cream background. No scenery, no props, no labels.`,
    design.identity && (base && base.variant !== design.variant ? `At this age: ${design.identity}` : `Their features (the Vambie head, eyes and fangs stay the same): ${design.identity}`),
    design.usualClothing && `Clothing: ${design.usualClothing}`,
    "Do not include any text, letters or words in the image.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const common = { model: rules.imageModel, prompt, size: "1024x1024", quality: "high" as const, output_format: "png" as const };
  const response = await withImageRateLimit(references.length, async () =>
    references.length ? client.images.edit({ ...common, image: await Promise.all(references.map((r) => toUpload(r.path))) }) : client.images.generate(common)
  );
  await recordImage("design_proposal", common.model, response, common, { householdId: character.householdId });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("The image service returned no image.");
  const imagePath = saveFile(DESIGNS_DIR, `${design.id}-proposal-${Date.now()}.png`, Buffer.from(b64, "base64"));
  return prisma.designProposal.create({ data: { designId: design.id, imagePath, look: "vambie" } });
}

// Drafts the fixed-identity notes from the private photo, for the parent to edit.
export async function describePhoto(designId: string) {
  const design = await loadDesign(designId);
  if (!design.photoPath) throw new Error("Upload a photo first.");
  const { output } = await runAiStep(
    "describe_person",
    { name: design.familyCharacter.name, relationship: design.familyCharacter.relationship || "family member" },
    undefined,
    [dataUrl(design.photoPath)],
    { householdId: design.familyCharacter.householdId }
  );
  return {
    identity: typeof output?.identity === "string" ? output.identity.trim() : "",
    usualClothing: typeof output?.usualClothing === "string" ? output.usualClothing.trim() : "",
  };
}

// --- Approval and the reference sheet ---

export type ApprovalScope = "new_chapters" | "include_drafts";

// "This is Grandma": approves a draft with one of its proposals. Earlier approved
// designs of the same variant are superseded but stay on the pages that used them,
// unless the scope also moves unpublished draft chapters to the new look.
export async function approveDesign(designId: string, proposalId: string, scope: ApprovalScope) {
  const design = await loadDesign(designId);
  if (design.status !== "draft") throw new Error("This design is already approved.");
  const proposal = design.proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new Error("Pick one of this design's proposals.");
  const { rules } = await getActiveRules();

  const previous = await prisma.characterDesign.findMany({
    where: { familyCharacterId: design.familyCharacterId, variant: design.variant, status: "approved" },
  });
  await prisma.characterDesign.updateMany({ where: { id: { in: previous.map((d) => d.id) } }, data: { status: "superseded" } });
  await prisma.characterDesign.update({
    where: { id: designId },
    data: {
      status: "approved",
      look: proposal.look,
      portraitPath: proposal.imagePath,
      styleSnapshot: rules.illustrationStyle,
      approvedAt: new Date(),
      sheetStatus: "generating",
    },
  });

  let redrawPageIds: string[] = [];
  if (scope === "include_drafts" && previous.length) {
    const moved = await prisma.pageAppearance.findMany({
      where: { designId: { in: previous.map((d) => d.id) }, page: { chapter: { status: { not: "published" } } } },
    });
    await prisma.pageAppearance.updateMany({ where: { id: { in: moved.map((a) => a.id) } }, data: { designId } });
    redrawPageIds = [...new Set(moved.map((a) => a.pageId))];
  }
  return { redrawPageIds };
}

export async function generateReferenceSheet(designId: string) {
  const design = await loadDesign(designId);
  const client = getOpenAI();
  if (!client || !design.portraitPath) {
    await prisma.characterDesign.update({ where: { id: designId }, data: { sheetStatus: "failed" } });
    return;
  }
  await prisma.characterDesign.update({ where: { id: designId }, data: { sheetStatus: "generating" } });
  const { rules } = await getActiveRules();
  const name = design.familyCharacter.name;
  try {
    const portrait = design.portraitPath;
    const response = await withImageRateLimit(1, async () => client.images.edit({
      model: rules.imageModel,
      image: [await toUpload(portrait)],
      prompt: [
        `The attached image is ${name}'s approved character design for a children's picture book.`,
        `Create a character reference sheet of this exact character, in exactly the same illustration style, colors and outfit: a front view, a side view and a three-quarter view (full body), plus four head-and-shoulders expressions (happy, surprised, sad, thoughtful). Plain warm-cream background.`,
        design.identity && `Keep these fixed features identical in every view: ${design.identity}`,
        "Do not include any text, letters, numbers or labels.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      size: "1536x1024",
      quality: "high",
      output_format: "png",
    }));
    await recordImage("reference_sheet", rules.imageModel, response, { size: "1536x1024", quality: "high" }, { householdId: design.familyCharacter.householdId });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("The image service returned no image.");
    const sheetPath = saveFile(DESIGNS_DIR, `${design.id}-sheet-${Date.now()}.png`, Buffer.from(b64, "base64"));
    await prisma.characterDesign.update({ where: { id: designId }, data: { sheetPath, sheetStatus: "ready" } });
  } catch (error: any) {
    console.error(`Reference sheet failed for design ${designId}:`, error?.message);
    await prisma.characterDesign.update({ where: { id: designId }, data: { sheetStatus: "failed" } });
  }
}

// --- What illustrations receive ---

export type AppearanceWithDesign = Prisma.PageAppearanceGetPayload<{ include: { design: true; familyCharacter: true } }>;

// The approved images attached to every illustration a character appears in.
export function appearanceReferences(a: AppearanceWithDesign) {
  const name = a.familyCharacter.name;
  const refs: { path: string; label: string }[] = [];
  if (a.design.portraitPath) {
    refs.push({
      path: a.design.portraitPath,
      label: `${name}'s approved design${a.design.variant !== "today" ? ` (${a.design.variant})` : ""}. Draw ${name} with exactly this face, skin tone, eyes, hair, build and signature accessories, in this book's art style. Their clothes in this scene are described below.`,
    });
  }
  if (a.design.sheetPath) {
    refs.push({ path: a.design.sheetPath, label: `${name}'s reference sheet (views and expressions): keep ${name} identical from any angle.` });
  }
  return refs;
}

// One line per family character for an image prompt or an illustration check. A
// look approved as a person stays a person until the family redraws it.
export const describeAppearance = (a: AppearanceWithDesign) =>
  `${a.familyCharacter.name}${a.design.variant !== "today" ? ` (${a.design.variant})` : ""}: fixed features: ${a.design.identity || "as in their approved design"}.${
    a.design.look === "person" ? " Their approved design shows them as a person: draw them that way, not as a Vambie." : ""
  }${a.outfit ? ` Wearing in this scene: ${a.outfit}.` : ""}${a.details ? ` ${a.details}.` : ""} May vary: ${ALLOWED_VARIATIONS}.`;

export const appearanceDataUrls = (appearances: AppearanceWithDesign[]) =>
  appearances.filter((a) => a.design.portraitPath).map((a) => dataUrl(a.design.portraitPath!));
