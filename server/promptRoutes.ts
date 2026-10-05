import express, { Router } from "express";
import { prisma } from "./db";

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

router.put("/prompts/:id", async (req, res) => {
  const existing = await prisma.prompt.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { question, supportingText, category, audience, childStage, cardColor, status } = req.body ?? {};
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

router.put("/prompts/:id/reorder", async (req, res) => {
  const { sortOrder } = req.body ?? {};
  const prompt = await prisma.prompt.update({ where: { id: req.params.id }, data: { sortOrder: Number(sortOrder) || 0 } });
  res.json(prompt);
});

export default router;
