import express, { Router } from "express";
import multer from "multer";
import { prisma } from "./db";
import { PICTURES_PER_CLICK, cardPoses, generatePromptArt, isLibraryPicture, madeForCards, savePromptArt } from "./promptArt";
import { unknownPromptVariables } from "./promptVariables";

// Prompt cards for the recorder. Reading is open; changes need an admin
// (enforced in server.ts). A card's artwork comes from the artwork library
// (server/promptArt.ts) and, like its other fields, reaches families when saved.

const IMAGE_TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const router: Router = express.Router();

// Questions and supporting text may only use the card variables (server/promptVariables.ts).
const variableError = (...texts: unknown[]) => {
  const unknown = texts.flatMap((t) => (typeof t === "string" ? unknownPromptVariables(t) : []));
  return unknown.length ? `Cards can't use ${unknown.map((n) => `<${n}>`).join(", ")}. Pick a variable from the list.` : null;
};

router.get("/prompts", async (req, res) => {
  const { status } = req.query as { status?: string };
  const prompts = await prisma.prompt.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json(prompts);
});

router.get("/prompts/:id", async (req, res) => {
  const prompt = await prisma.prompt.findUnique({ where: { id: req.params.id } });
  if (!prompt) return res.status(404).json({ error: "Not found" });
  res.json(prompt);
});

router.post("/prompts", async (req, res) => {
  const { question, supportingText, category, audience, childStage, cardColor, status } = req.body ?? {};
  if (!question || !String(question).trim()) return res.status(400).json({ error: "question is required" });
  const badVariables = variableError(question, supportingText);
  if (badVariables) return res.status(400).json({ error: badVariables });

  const count = await prisma.prompt.count();
  const prompt = await prisma.prompt.create({
    data: {
      question: String(question).trim(),
      supportingText: supportingText || null,
      category: category || "General",
      audience: audience || "Everyone",
      childStage: childStage || "All stages",
      cardColor: cardColor || "purple",
      status: status || "draft",
      sortOrder: count,
    },
  });
  res.status(201).json(prompt);
});

// The deck order families see: ids in order.
router.put("/prompts/order", async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  await prisma.$transaction(ids.map((id, i) => prisma.prompt.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

router.put("/prompts/:id", async (req, res) => {
  const existing = await prisma.prompt.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { question, supportingText, category, audience, childStage, cardColor, status, artworkPath } = req.body ?? {};
  const badVariables = variableError(question, supportingText);
  if (badVariables) return res.status(400).json({ error: badVariables });
  if (typeof artworkPath === "string" && !(await isLibraryPicture(artworkPath))) {
    return res.status(400).json({ error: "Pick artwork from the library." });
  }
  const prompt = await prisma.prompt.update({
    where: { id: req.params.id },
    data: {
      ...(question !== undefined ? { question } : {}),
      ...(supportingText !== undefined ? { supportingText } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(audience !== undefined ? { audience } : {}),
      ...(childStage !== undefined ? { childStage } : {}),
      ...(cardColor !== undefined ? { cardColor } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(artworkPath === null || typeof artworkPath === "string" ? { artworkPath } : {}),
    },
  });
  res.json(prompt);
});

router.delete("/prompts/:id", async (req, res) => {
  const existing = await prisma.prompt.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  await prisma.prompt.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// The artwork library: Baby Vambie's card poses and every picture made for a card.
router.get("/admin/prompt-art", async (_req, res) => {
  res.json({ poses: cardPoses(), made: await madeForCards(), perClick: PICTURES_PER_CLICK });
});

// An uploaded picture joins the library; the card uses it once it's saved.
router.post("/prompts/:id/artwork", upload.single("image"), async (req, res) => {
  const prompt = await prisma.prompt.findUnique({ where: { id: req.params.id } });
  if (!prompt) return res.status(404).json({ error: "Not found" });
  const ext = req.file ? IMAGE_TYPES[req.file.mimetype] : undefined;
  if (!req.file || !ext) return res.status(400).json({ error: "Upload a PNG, JPEG or WebP image." });
  const question = String(req.body?.question ?? "").trim() || prompt.question;
  const artwork = await prisma.promptArtwork.create({ data: { imagePath: savePromptArt(req.file.buffer, ext), source: "upload", question } });
  res.json(artwork);
});

// Draws two pictures from the question as it's currently written (the card
// may have unsaved edits). Both join the library; neither is applied.
router.post("/prompts/:id/artwork/generate", async (req, res) => {
  const prompt = await prisma.prompt.findUnique({ where: { id: req.params.id } });
  if (!prompt) return res.status(404).json({ error: "Not found" });
  const body = req.body ?? {};
  try {
    const artworks = await generatePromptArt({
      question: typeof body.question === "string" ? body.question : prompt.question,
      supportingText: typeof body.supportingText === "string" ? body.supportingText : prompt.supportingText,
      idea: typeof body.idea === "string" ? body.idea.slice(0, 400) : null,
      cardColor: typeof body.cardColor === "string" ? body.cardColor : prompt.cardColor,
    });
    res.json({ artworks });
  } catch (error: any) {
    console.error(`Prompt art for ${prompt.id} failed:`, error?.message);
    res.status(502).json({ error: error?.message || "The pictures couldn't be drawn. Try again." });
  }
});

router.put("/prompts/:id/reorder", async (req, res) => {
  const { sortOrder } = req.body ?? {};
  const prompt = await prisma.prompt.update({ where: { id: req.params.id }, data: { sortOrder: Number(sortOrder) || 0 } });
  res.json(prompt);
});

export default router;
