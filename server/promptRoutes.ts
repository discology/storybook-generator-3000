import express, { Router } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { prisma } from "./db";

// Prompt cards for the recorder. Reading is open; changes need an admin
// (enforced in server.ts).

const ART_DIR = path.join(process.cwd(), "uploads", "prompts");
fs.mkdirSync(ART_DIR, { recursive: true });
const IMAGE_TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const router: Router = express.Router();

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
      ...(artworkPath === null ? { artworkPath: null } : {}),
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

router.post("/prompts/:id/artwork", upload.single("image"), async (req, res) => {
  const prompt = await prisma.prompt.findUnique({ where: { id: req.params.id } });
  if (!prompt) return res.status(404).json({ error: "Not found" });
  const ext = req.file ? IMAGE_TYPES[req.file.mimetype] : undefined;
  if (!req.file || !ext) return res.status(400).json({ error: "Upload a PNG, JPEG or WebP image." });
  const name = `${prompt.id}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(ART_DIR, name), req.file.buffer);
  const updated = await prisma.prompt.update({ where: { id: prompt.id }, data: { artworkPath: `uploads/prompts/${name}` } });
  res.json(updated);
});

router.put("/prompts/:id/reorder", async (req, res) => {
  const { sortOrder } = req.body ?? {};
  const prompt = await prisma.prompt.update({ where: { id: req.params.id }, data: { sortOrder: Number(sortOrder) || 0 } });
  res.json(prompt);
});

export default router;
