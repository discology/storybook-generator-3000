import express, { Router } from "express";
import multer from "multer";
import { prisma } from "./db";
import { getCurrentUser } from "./session";
import {
  CASTING_MODES,
  CHARACTER_STATUSES,
  characterCard,
  chaptersUsing,
  generateCharacterArt,
  referenceImageOf,
  restyleCharacterArt,
  drawBookExpressions,
  saveCharacterImage,
  validateKey,
} from "./characters";

const router: Router = express.Router();

const IMAGE_TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Fields that change what a character looks or acts like; editing them bumps the
// version so new chapters pick up the change (existing chapters keep theirs).
const CARD_FIELDS = ["name", "storyRole", "personality", "appearance", "neverRules"] as const;
const TEXT_FIELDS = [...CARD_FIELDS, "group", "castingNotes"] as const;

const loadCharacter = (id: string) => prisma.character.findUnique({ where: { id }, include: { art: { orderBy: { createdAt: "desc" } } } });

async function present(id: string) {
  const c = await loadCharacter(id);
  if (!c) return null;
  return { ...c, referenceImage: referenceImageOf(c), card: characterCard(c), chaptersUsing: await chaptersUsing(c.key) };
}

// --- Parents: who can be picked for a chapter ---

router.get("/characters", async (req, res) => {
  if (!(await getCurrentUser(req))) return res.status(401).json({ error: "Sign in first" });
  const active = await prisma.character.findMany({ where: { status: "active" }, include: { art: true }, orderBy: { name: "asc" } });
  res.json(
    active.map((c) => ({ key: c.key, name: c.name, storyRole: c.storyRole, castingMode: c.castingMode, referenceImage: referenceImageOf(c) }))
  );
});

// --- Admin: the Character Library ---

router.use("/admin/characters", async (req, res, next) => {
  if (!(await getCurrentUser(req))) return res.status(401).json({ error: "Sign in first" });
  next();
});

router.get("/admin/characters", async (_req, res) => {
  const all = await prisma.character.findMany({ include: { art: true }, orderBy: [{ status: "asc" }, { name: "asc" }] });
  res.json({
    characters: await Promise.all(
      all.map(async (c) => ({ ...c, art: undefined, artCount: c.art.length, referenceImage: referenceImageOf(c), chaptersUsing: await chaptersUsing(c.key) }))
    ),
    castingModes: CASTING_MODES,
  });
});

router.post("/admin/characters", async (req, res) => {
  const key = String(req.body?.key ?? "").trim();
  const name = String(req.body?.name ?? "").trim();
  const keyError = validateKey(key);
  if (keyError) return res.status(400).json({ error: keyError });
  if (!name) return res.status(400).json({ error: "Give the character a name." });
  if (await prisma.character.findUnique({ where: { key } })) return res.status(400).json({ error: `<${key}> already exists.` });
  const created = await prisma.character.create({ data: { key, name } });
  res.status(201).json(await present(created.id));
});

router.get("/admin/characters/:id", async (req, res) => {
  const character = await present(req.params.id);
  if (!character) return res.status(404).json({ error: "Not found" });
  res.json({ ...character, castingModes: CASTING_MODES });
});

router.put("/admin/characters/:id", async (req, res) => {
  const existing = await loadCharacter(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const next = { ...existing } as Record<string, any>;
  for (const field of TEXT_FIELDS) if (typeof req.body?.[field] === "string") next[field] = req.body[field].trim();
  if (req.body?.castingMode !== undefined) next.castingMode = req.body.castingMode;
  if (req.body?.status !== undefined) next.status = req.body.status;

  if (!next.name) return res.status(400).json({ error: "Give the character a name." });
  if (!(next.castingMode in CASTING_MODES)) return res.status(400).json({ error: "Pick when this character appears." });
  if (!CHARACTER_STATUSES.includes(next.status)) return res.status(400).json({ error: "Pick a status." });
  if (next.status === "active" && !next.appearance) {
    return res.status(400).json({ error: "Describe how the character looks before making them active." });
  }
  if (next.status === "active" && next.castingMode === "when_it_fits" && !next.castingNotes) {
    return res.status(400).json({ error: "Add casting notes so the story knows when to include them." });
  }

  const cardChanged = CARD_FIELDS.some((f) => next[f] !== (existing as any)[f]);
  await prisma.character.update({
    where: { id: existing.id },
    data: {
      ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, next[f] ?? ""])),
      group: next.group || null,
      castingMode: next.castingMode,
      status: next.status,
      ...(cardChanged ? { version: { increment: 1 } } : {}),
    },
  });
  res.json(await present(existing.id));
});

// Upload official artwork. It becomes the reference if the character has none yet.
router.post("/admin/characters/:id/art", upload.single("image"), async (req, res) => {
  const character = await loadCharacter(req.params.id);
  if (!character) return res.status(404).json({ error: "Not found" });
  const extension = req.file ? IMAGE_TYPES[req.file.mimetype] : undefined;
  if (!req.file || !extension) return res.status(400).json({ error: "Upload a PNG, JPEG or WebP image (up to 10 MB)." });
  const imagePath = saveCharacterImage(req.file.buffer, `${character.key}-${Date.now()}${extension}`);
  const art = await prisma.characterArt.create({ data: { characterId: character.id, imagePath, source: "upload" } });
  if (!character.referenceArtId) {
    await prisma.character.update({ where: { id: character.id }, data: { referenceArtId: art.id, version: { increment: 1 } } });
  }
  res.status(201).json(await present(character.id));
});

// Generate artwork from the character's look. It's a candidate until picked.
router.post("/admin/characters/:id/art/generate", async (req, res) => {
  if (!(await loadCharacter(req.params.id))) return res.status(404).json({ error: "Not found" });
  try {
    await generateCharacterArt(req.params.id);
    res.status(201).json(await present(req.params.id));
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? "Couldn't generate artwork. Try again." });
  }
});

// Redraw the reference art in the book's current art style (a candidate until picked).
router.post("/admin/characters/:id/art/restyle", async (req, res) => {
  if (!(await loadCharacter(req.params.id))) return res.status(404).json({ error: "Not found" });
  try {
    await restyleCharacterArt(req.params.id);
    res.status(201).json(await present(req.params.id));
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? "Couldn't redraw the artwork. Try again." });
  }
});

// Draw (or redraw) the book-style expression set from the reference art.
router.post("/admin/characters/:id/art/expressions", async (req, res) => {
  if (!(await loadCharacter(req.params.id))) return res.status(404).json({ error: "Not found" });
  try {
    const { failed } = await drawBookExpressions(req.params.id);
    res.status(201).json({ ...(await present(req.params.id)), failed });
  } catch (error: any) {
    res.status(502).json({ error: error?.message ?? "Couldn't draw the expressions. Try again." });
  }
});

router.put("/admin/characters/:id/reference", async (req, res) => {
  const character = await loadCharacter(req.params.id);
  if (!character) return res.status(404).json({ error: "Not found" });
  const artId = req.body?.artId ?? null;
  if (artId !== null && !character.art.some((a) => a.id === artId)) return res.status(400).json({ error: "That artwork isn't this character's." });
  if (artId !== character.referenceArtId) {
    await prisma.character.update({ where: { id: character.id }, data: { referenceArtId: artId, version: { increment: 1 } } });
  }
  res.json(await present(character.id));
});

export default router;
