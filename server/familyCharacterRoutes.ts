import fs from "fs";
import path from "path";
import express, { Request, Response, Router } from "express";
import multer from "multer";
import { prisma } from "./db";
import { getCurrentUser } from "./session";
import {
  ALLOWED_VARIATIONS,
  ApprovalScope,
  FIXED_IDENTITY,
  approveDesign,
  approvedVariants,
  describePhoto,
  generateProposal,
  generateReferenceSheet,
  mimeTypeOf,
  parseAliases,
  savePhoto,
} from "./familyCharacters";
import { redrawPages } from "./storyPages";
import { getActiveRules } from "./pageRules";

// "Our Characters": a family's people (and pets), their approved looks and the
// history of every version. Only members of that family can see or change them.

const router: Router = express.Router();
const IMAGE_TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function requireHousehold(req: Request, res: Response, householdId: string) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in first" });
    return false;
  }
  const member = await prisma.contributor.findFirst({ where: { householdId, userId: user.id, inviteStatus: { not: "revoked" } } });
  if (!member) {
    res.status(403).json({ error: "access_denied" });
    return false;
  }
  return true;
}

async function characterForRequest(req: Request, res: Response) {
  const character = await prisma.familyCharacter.findUnique({ where: { id: req.params.characterId } });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return null;
  }
  return (await requireHousehold(req, res, character.householdId)) ? character : null;
}

async function designForRequest(req: Request, res: Response) {
  const design = await prisma.characterDesign.findUnique({ where: { id: req.params.designId }, include: { familyCharacter: true } });
  if (!design) {
    res.status(404).json({ error: "Design not found" });
    return null;
  }
  return (await requireHousehold(req, res, design.familyCharacter.householdId)) ? design : null;
}

const draftOnly = (res: Response, design: { status: string }) => {
  if (design.status === "draft") return true;
  res.status(400).json({ error: "Approved designs can't be edited. Start a new version with “Change appearance”." });
  return false;
};

const cleanAliases = (value: unknown) =>
  JSON.stringify(
    (Array.isArray(value) ? value : String(value ?? "").split(","))
      .map((a) => String(a).trim())
      .filter(Boolean)
  );

// Everything the character screen shows: designs by variant (newest first), how
// many pages each version appears on, and whether any are in published chapters.
export async function present(characterId: string) {
  const c = await prisma.familyCharacter.findUniqueOrThrow({
    where: { id: characterId },
    include: { designs: { include: { proposals: { orderBy: { createdAt: "desc" } } }, orderBy: [{ variant: "asc" }, { version: "desc" }] } },
  });
  const usage = await prisma.pageAppearance.findMany({
    where: { familyCharacterId: characterId },
    select: { designId: true, page: { select: { chapter: { select: { status: true } } } } },
  });
  const approved = approvedVariants(c.designs);
  return {
    ...c,
    aliases: parseAliases(c.aliases),
    approvedDesignIds: [...approved.values()].map((d) => d.id),
    designs: c.designs.map(({ photoPath, ...d }) => ({
      ...d,
      hasPhoto: Boolean(photoPath),
      pages: usage.filter((u) => u.designId === d.id).length,
      publishedPages: usage.filter((u) => u.designId === d.id && u.page.chapter.status === "published").length,
    })),
  };
}

// --- The family's characters ---

router.get("/storybooks/:id/characters", async (req, res) => {
  const storybook = await prisma.storybook.findUnique({ where: { id: req.params.id }, include: { child: true } });
  if (!storybook) return res.status(404).json({ error: "Storybook not found" });
  if (!(await requireHousehold(req, res, storybook.child.householdId))) return;
  const characters = await prisma.familyCharacter.findMany({
    where: { householdId: storybook.child.householdId },
    include: { designs: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    childName: storybook.child.displayName,
    fixedIdentity: FIXED_IDENTITY,
    allowedVariations: ALLOWED_VARIATIONS,
    characters: characters.map((c) => {
      const approved = approvedVariants(c.designs);
      const today = approved.get("today") ?? [...approved.values()][0];
      return {
        id: c.id,
        name: c.name,
        relationship: c.relationship,
        aliases: parseAliases(c.aliases),
        portraitPath: today?.portraitPath ?? null,
        variants: [...approved.keys()],
        hasDraft: c.designs.some((d) => d.status === "draft"),
      };
    }),
  });
});

router.post("/storybooks/:id/characters", async (req, res) => {
  const storybook = await prisma.storybook.findUnique({ where: { id: req.params.id }, include: { child: true } });
  if (!storybook) return res.status(404).json({ error: "Storybook not found" });
  if (!(await requireHousehold(req, res, storybook.child.householdId))) return;
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Give them a name, like “Grandma Rose”." });
  const character = await prisma.familyCharacter.create({
    data: {
      householdId: storybook.child.householdId,
      name,
      relationship: String(req.body?.relationship ?? "").trim(),
      aliases: cleanAliases(req.body?.aliases),
      context: String(req.body?.context ?? "").trim(),
      designs: {
        create: {
          variant: "today",
          version: 1,
          identity: String(req.body?.identity ?? "").trim(),
          usualClothing: String(req.body?.usualClothing ?? "").trim(),
        },
      },
    },
  });
  res.status(201).json(await present(character.id));
});

router.get("/family-characters/:characterId", async (req, res) => {
  const character = await characterForRequest(req, res);
  if (!character) return;
  const { rules } = await getActiveRules();
  res.json({
    ...(await present(character.id)),
    fixedIdentity: FIXED_IDENTITY,
    allowedVariations: ALLOWED_VARIATIONS,
    currentStyle: rules.illustrationStyle, // to spot designs approved in an older art style
  });
});

router.put("/family-characters/:characterId", async (req, res) => {
  const character = await characterForRequest(req, res);
  if (!character) return;
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : character.name;
  if (!name) return res.status(400).json({ error: "Give them a name." });
  await prisma.familyCharacter.update({
    where: { id: character.id },
    data: {
      name,
      relationship: req.body?.relationship !== undefined ? String(req.body.relationship).trim() : character.relationship,
      aliases: req.body?.aliases !== undefined ? cleanAliases(req.body.aliases) : character.aliases,
      context: req.body?.context !== undefined ? String(req.body.context).trim() : character.context,
    },
  });
  res.json(await present(character.id));
});

// "Change appearance" or "Add an age variant": a new draft version of one
// variant, starting from its current approved look.
router.post("/family-characters/:characterId/designs", async (req, res) => {
  const character = await characterForRequest(req, res);
  if (!character) return;
  const variant = String(req.body?.variant ?? "today").trim().toLowerCase() || "today";
  const existingDraft = await prisma.characterDesign.findFirst({ where: { familyCharacterId: character.id, variant, status: "draft" } });
  if (existingDraft) return res.json(await present(character.id));

  const designs = await prisma.characterDesign.findMany({ where: { familyCharacterId: character.id } });
  // A new version of a look starts from that look's notes. A new age variant
  // starts empty: today's hair color, glasses or clothes may not fit another age,
  // so the proposal works from today's design picture instead.
  const current = approvedVariants(designs).get(variant);
  const latest = designs.filter((d) => d.variant === variant).reduce((n, d) => Math.max(n, d.version), 0);
  await prisma.characterDesign.create({
    data: {
      familyCharacterId: character.id,
      variant,
      version: latest + 1,
      identity: current?.identity ?? "",
      usualClothing: current?.usualClothing ?? "",
      changeNote: String(req.body?.changeNote ?? "").trim(),
    },
  });
  res.status(201).json(await present(character.id));
});

router.put("/designs/:designId", async (req, res) => {
  const design = await designForRequest(req, res);
  if (!design || !draftOnly(res, design)) return;
  await prisma.characterDesign.update({
    where: { id: design.id },
    data: Object.fromEntries(
      (["identity", "usualClothing", "changeNote"] as const)
        .filter((f) => typeof req.body?.[f] === "string")
        .map((f) => [f, req.body[f].trim()])
    ),
  });
  res.json(await present(design.familyCharacterId));
});

// Discards a draft version (approved versions are kept forever).
router.delete("/designs/:designId", async (req, res) => {
  const design = await designForRequest(req, res);
  if (!design || !draftOnly(res, design)) return;
  if (design.photoPath) fs.rmSync(path.join(process.cwd(), design.photoPath), { force: true });
  await prisma.characterDesign.delete({ where: { id: design.id } });
  res.json(await present(design.familyCharacterId));
});

// --- The optional reference photo (private) ---

router.post("/designs/:designId/photo", upload.single("photo"), async (req, res) => {
  const design = await designForRequest(req, res);
  if (!design || !draftOnly(res, design)) return;
  const extension = req.file ? IMAGE_TYPES[req.file.mimetype] : undefined;
  if (!req.file || !extension) return res.status(400).json({ error: "Upload a PNG, JPEG or WebP photo (up to 10 MB)." });
  if (design.photoPath) fs.rmSync(path.join(process.cwd(), design.photoPath), { force: true });
  const photoPath = savePhoto(design.id, req.file.buffer, extension);
  await prisma.characterDesign.update({ where: { id: design.id }, data: { photoPath } });

  // Draft the fixed-feature notes from the photo when the parent hasn't written any.
  let suggestion: { identity: string; usualClothing: string } | null = null;
  try {
    suggestion = await describePhoto(design.id);
    if (!design.identity && suggestion.identity) {
      await prisma.characterDesign.update({
        where: { id: design.id },
        data: { identity: suggestion.identity, usualClothing: design.usualClothing || suggestion.usualClothing },
      });
    }
  } catch (error: any) {
    console.error("Describing the photo failed:", error?.message);
  }
  res.json({ ...(await present(design.familyCharacterId)), suggestion });
});

router.get("/designs/:designId/photo", async (req, res) => {
  const design = await designForRequest(req, res);
  if (!design) return;
  if (!design.photoPath) return res.status(404).end();
  res.type(mimeTypeOf(design.photoPath)).sendFile(path.join(process.cwd(), design.photoPath));
});

router.delete("/designs/:designId/photo", async (req, res) => {
  const design = await designForRequest(req, res);
  if (!design) return;
  if (design.photoPath) fs.rmSync(path.join(process.cwd(), design.photoPath), { force: true });
  await prisma.characterDesign.update({ where: { id: design.id }, data: { photoPath: null } });
  res.json(await present(design.familyCharacterId));
});

// --- Proposals and approval ---

router.post("/designs/:designId/proposals", async (req, res) => {
  const design = await designForRequest(req, res);
  if (!design || !draftOnly(res, design)) return;
  try {
    await generateProposal(design.id);
    res.status(201).json(await present(design.familyCharacterId));
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? "Couldn't draw a proposal. Try again." });
  }
});

// "This is Grandma." Then the reference sheet is drawn, and if the scope says so,
// pages in unpublished chapters move to the new look and are redrawn.
router.post("/designs/:designId/approve", async (req, res) => {
  const design = await designForRequest(req, res);
  if (!design || !draftOnly(res, design)) return;
  const scope: ApprovalScope = req.body?.scope === "include_drafts" ? "include_drafts" : "new_chapters";
  try {
    const { redrawPageIds } = await approveDesign(design.id, String(req.body?.proposalId ?? ""), scope);
    void generateReferenceSheet(design.id).then(() => (redrawPageIds.length ? redrawPages(redrawPageIds) : undefined));
    res.json({ ...(await present(design.familyCharacterId)), redrawing: redrawPageIds.length });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/designs/:designId/sheet", async (req, res) => {
  const design = await designForRequest(req, res);
  if (!design) return;
  if (design.status !== "approved") return res.status(400).json({ error: "Approve the design first." });
  void generateReferenceSheet(design.id);
  await new Promise((r) => setTimeout(r, 300));
  res.status(202).json(await present(design.familyCharacterId));
});

export default router;
