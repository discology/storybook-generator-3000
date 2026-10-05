import { ZipArchive } from "archiver";
import express, { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { getCurrentUser } from "./session";

const EXPORT_DIR = path.join(process.cwd(), "uploads", "exports");
fs.mkdirSync(EXPORT_DIR, { recursive: true });
const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const router: Router = express.Router();

router.get("/storybooks/:id/exports", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const exports = await prisma.exportRequest.findMany({
    where: { storybookId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();
  res.json(
    exports.map((e) => ({
      ...e,
      status: e.status === "ready" && e.expiresAt && e.expiresAt.getTime() < now ? "expired" : e.status,
    }))
  );
});

router.post("/storybooks/:id/export", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const { includeRecordings = true, includeTranscripts = true, includeChapters = true } = req.body ?? {};

  const storybook = await prisma.storybook.findUnique({
    where: { id: req.params.id },
    include: {
      child: true,
      memories: { include: { transcripts: true, contributor: true } },
      chapters: { where: { status: "published" } },
    },
  });
  if (!storybook) return res.status(404).json({ error: "Storybook not found" });

  const exportRequest = await prisma.exportRequest.create({
    data: { storybookId: storybook.id, status: "preparing" },
  });

  try {
    const fileName = `${storybook.id}-${exportRequest.id}.zip`;
    const filePath = path.join(EXPORT_DIR, fileName);
    const output = fs.createWriteStream(filePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);

      if (includeRecordings) {
        for (const m of storybook.memories) {
          if (!m.audioUrl) continue;
          const absPath = path.join(process.cwd(), m.audioUrl.replace(/^\//, ""));
          if (fs.existsSync(absPath)) {
            archive.file(absPath, { name: `recordings/${path.basename(absPath)}` });
          }
        }
      }
      if (includeTranscripts) {
        const transcriptText = storybook.memories
          .map((m) => `## ${m.title || "Untitled"} (${m.recordedAt.toISOString().slice(0, 10)})\n${m.transcripts[0]?.text ?? "(no transcript)"}\n`)
          .join("\n");
        archive.append(transcriptText || "No transcripts yet.", { name: "transcripts.md" });
      }
      if (includeChapters) {
        const chapterText = storybook.chapters
          .map((c) => `## Chapter ${c.sequence}: ${c.title}\n\n${c.content}\n`)
          .join("\n\n");
        archive.append(chapterText || "No published chapters yet.", { name: "chapters.md" });
      }

      archive.finalize();
    });

    const expiresAt = new Date(Date.now() + EXPORT_TTL_MS);
    const updated = await prisma.exportRequest.update({
      where: { id: exportRequest.id },
      data: { status: "ready", filePath: `/uploads/exports/${fileName}`, expiresAt },
    });
    res.status(201).json(updated);
  } catch (error) {
    const updated = await prisma.exportRequest.update({ where: { id: exportRequest.id }, data: { status: "failed" } });
    res.status(500).json(updated);
  }
});

// --- Memory deletion ---
router.get("/memories/:id/deletion-preview", async (req, res) => {
  const memory = await prisma.memory.findUnique({
    where: { id: req.params.id },
    include: { chapterSources: { include: { chapter: true } } },
  });
  if (!memory) return res.status(404).json({ error: "Not found" });
  res.json({
    memory,
    connectedChapters: memory.chapterSources.map((cs) => cs.chapter),
  });
});

router.delete("/memories/:id", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const memory = await prisma.memory.findUnique({
    where: { id: req.params.id },
    include: { chapterSources: true },
  });
  if (!memory) return res.status(404).json({ error: "Not found" });

  const affectedChapterIds = memory.chapterSources.map((cs) => cs.chapterId);

  for (const chapterId of affectedChapterIds) {
    await prisma.guardianFinding.create({
      data: {
        chapterId,
        category: "source_removed",
        status: "needs_revision",
        note: "A source memory for this chapter was deleted. Review before it can be published again.",
      },
    });
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { guardianStatus: "needs_revision", status: "guardian_review" },
    });
  }

  if (memory.audioUrl) {
    const absPath = path.join(process.cwd(), memory.audioUrl.replace(/^\//, ""));
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  }

  await prisma.memory.delete({ where: { id: memory.id } });
  res.json({ ok: true, affectedChapterIds });
});

export default router;
