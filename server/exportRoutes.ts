import { ZipArchive } from "archiver";
import express, { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { canSeeChapter, memberForMemory, requireMember } from "./access";

const EXPORT_DIR = path.join(process.cwd(), "uploads", "exports");
fs.mkdirSync(EXPORT_DIR, { recursive: true });
const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const router: Router = express.Router();

interface ExportOptions {
  includeRecordings: boolean;
  includeTranscripts: boolean;
  includeChapters: boolean;
  range: "all" | "30" | "90" | "365";
}

const parseOptions = (json: string): ExportOptions => {
  const o = (() => {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  })();
  return {
    includeRecordings: o.includeRecordings !== false,
    includeTranscripts: o.includeTranscripts !== false,
    includeChapters: o.includeChapters !== false,
    range: ["30", "90", "365"].includes(o.range) ? o.range : "all",
  };
};

const exportStatus = (e: { status: string; expiresAt: Date | null }) =>
  e.status === "ready" && e.expiresAt && e.expiresAt.getTime() < Date.now() ? "expired" : e.status;

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "untitled";
const fromUploads = (p: string) => path.join(process.cwd(), p.replace(/^\//, ""));

// Builds the zip in the background. An export only ever holds what its
// requester may see: their own recordings and transcripts, and the chapters
// they can read. Other family members' recordings are never included.
export async function buildExport(exportId: string) {
  const request = await prisma.exportRequest.findUniqueOrThrow({ where: { id: exportId } });
  const options = parseOptions(request.options);
  try {
    const me = await prisma.contributor.findUniqueOrThrow({ where: { id: request.contributorId! } });
    const storybook = await prisma.storybook.findUniqueOrThrow({
      where: { id: request.storybookId },
      include: {
        child: true,
        memories: { where: { contributorId: me.id }, include: { transcripts: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { recordedAt: "asc" } },
        chapters: {
          where: { status: "published" },
          include: { access: true, pages: { orderBy: { pageNumber: "asc" }, include: { assets: { where: { status: "ready" }, orderBy: { version: "desc" }, take: 1 } } } },
          orderBy: { sequence: "asc" },
        },
      },
    });
    const since = options.range === "all" ? 0 : Date.now() - Number(options.range) * 86400000;
    const memories = storybook.memories.filter((m) => (m.eventDate ?? m.recordedAt).getTime() >= since);
    const chapters = storybook.chapters.filter((c) => canSeeChapter(c, me) && (c.publishedAt ?? c.createdAt).getTime() >= since);

    const fileName = `${storybook.id}-${request.id}.zip`;
    const filePath = path.join(EXPORT_DIR, fileName);
    const output = fs.createWriteStream(filePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    await new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      const top = slug(storybook.title);
      if (options.includeRecordings) {
        for (const m of memories) {
          if (!m.audioUrl || !fs.existsSync(fromUploads(m.audioUrl))) continue;
          const date = (m.eventDate ?? m.recordedAt).toISOString().slice(0, 10);
          archive.file(fromUploads(m.audioUrl), { name: `${top}/recordings/${date}-${slug(m.title ?? "memory")}${path.extname(m.audioUrl)}` });
        }
      }
      if (options.includeTranscripts) {
        const text = memories
          .map((m) => `## ${m.title || "Untitled memory"} (${(m.eventDate ?? m.recordedAt).toISOString().slice(0, 10)})\n\n${m.transcripts[0]?.text ?? "(no transcript)"}\n`)
          .join("\n");
        archive.append(text || "No transcripts in this range.\n", { name: `${top}/my-transcripts.md` });
      }
      if (options.includeChapters) {
        for (const c of chapters) {
          const folder = `${top}/chapters/${String(c.sequence).padStart(2, "0")}-${slug(c.title)}`;
          const text = c.pages.length ? c.pages.map((p) => `Page ${p.pageNumber}\n${p.text || "(a page without words)"}`).join("\n\n") : c.content;
          archive.append(`# ${c.title}\n\n${text}\n`, { name: `${folder}/story.md` });
          for (const p of c.pages) {
            const image = p.assets[0]?.imagePath;
            if (image && fs.existsSync(fromUploads(image))) archive.file(fromUploads(image), { name: `${folder}/page-${String(p.pageNumber).padStart(2, "0")}${path.extname(image)}` });
          }
        }
      }
      archive.append(
        `${storybook.title}\nExported ${new Date().toISOString().slice(0, 10)} for ${me.name}.\n\nThis download holds your own recordings and transcripts and the chapters you can read. Other family members' private recordings are not included.\n`,
        { name: `${top}/README.txt` }
      );
      void archive.finalize();
    });
    await prisma.exportRequest.update({
      where: { id: request.id },
      data: { status: "ready", filePath: `/uploads/exports/${fileName}`, expiresAt: new Date(Date.now() + EXPORT_TTL_MS), error: null },
    });
  } catch (error: any) {
    console.error(`Export ${exportId} failed:`, error?.message ?? error);
    await prisma.exportRequest.update({ where: { id: exportId }, data: { status: "failed", error: String(error?.message ?? "unknown error").slice(0, 300) } });
  }
}

async function startExport(storybookId: string, contributorId: string, options: ExportOptions) {
  const request = await prisma.exportRequest.create({ data: { storybookId, contributorId, status: "preparing", options: JSON.stringify(options) } });
  void buildExport(request.id);
  return request;
}

// Exports being built when the server stopped will never finish.
export async function failInterruptedExports() {
  await prisma.exportRequest.updateMany({ where: { status: "preparing" }, data: { status: "failed", error: "Interrupted by a server restart." } });
}

// The requester's own export, or null after sending 401/403/404.
async function myExport(req: express.Request, res: express.Response) {
  const request = await prisma.exportRequest.findUnique({ where: { id: req.params.exportId }, include: { storybook: { include: { child: true } } } });
  if (!request) {
    res.status(404).json({ error: "Export not found" });
    return null;
  }
  const member = await requireMember(req, res, request.storybookId);
  if (!member) return null;
  if (request.contributorId !== member.me.id) {
    res.status(403).json({ error: "access_denied" });
    return null;
  }
  return { request, member };
}

const exportView = (e: { id: string; status: string; expiresAt: Date | null; createdAt: Date; options: string; storybookId: string }) => ({
  id: e.id,
  storybookId: e.storybookId,
  status: exportStatus(e),
  createdAt: e.createdAt,
  expiresAt: e.expiresAt,
  options: parseOptions(e.options),
});

router.get("/storybooks/:id/exports", async (req, res) => {
  const member = await requireMember(req, res, req.params.id);
  if (!member) return;
  const exports = await prisma.exportRequest.findMany({ where: { storybookId: member.storybook.id, contributorId: member.me.id }, orderBy: { createdAt: "desc" } });
  res.json(exports.map(exportView));
});

router.post("/storybooks/:id/export", async (req, res) => {
  const member = await requireMember(req, res, req.params.id);
  if (!member) return;
  const options = parseOptions(JSON.stringify(req.body ?? {}));
  if (!options.includeRecordings && !options.includeTranscripts && !options.includeChapters) {
    return res.status(400).json({ error: "Choose at least one thing to include." });
  }
  const request = await startExport(member.storybook.id, member.me.id, options);
  res.status(202).json(exportView(request));
});

router.get("/exports/:exportId", async (req, res) => {
  const found = await myExport(req, res);
  if (!found) return;
  res.json({ ...exportView(found.request), storybookTitle: found.request.storybook.title, childName: found.request.storybook.child.displayName });
});

router.post("/exports/:exportId/retry", async (req, res) => {
  const found = await myExport(req, res);
  if (!found) return;
  const request = await startExport(found.request.storybookId, found.member.me.id, parseOptions(found.request.options));
  res.status(202).json(exportView(request));
});

router.get("/exports/:exportId/download", async (req, res) => {
  const found = await myExport(req, res);
  if (!found) return;
  const { request } = found;
  if (exportStatus(request) !== "ready" || !request.filePath) return res.status(410).json({ error: "This download isn't available. Prepare a new export." });
  res.download(fromUploads(request.filePath), `${slug(request.storybook.title)}-export.zip`);
});

// --- Memory deletion ---
// The recorder can delete their memory, and the storybook's owner can delete any.
async function deletableMemory(req: express.Request, res: express.Response) {
  const member = await memberForMemory(req, res, req.params.id);
  if (!member) return null;
  if (member.memory.contributorId !== member.me.id && member.me.role !== "owner") {
    res.status(403).json({ error: "Only the person who recorded this memory can delete it." });
    return null;
  }
  return member;
}

router.get("/memories/:id/deletion-preview", async (req, res) => {
  const member = await deletableMemory(req, res);
  if (!member) return;
  const memory = await prisma.memory.findUniqueOrThrow({
    where: { id: member.memory.id },
    include: {
      transcripts: { take: 1 },
      chapterSources: {
        include: { chapter: { include: { pages: { orderBy: { pageNumber: "asc" }, take: 1, include: { assets: { where: { status: "ready" }, orderBy: { version: "desc" }, take: 1 } } } } } },
      },
    },
  });
  res.json({
    memory: { id: memory.id, title: memory.title, recordedAt: memory.recordedAt, hasAudio: Boolean(memory.audioUrl), hasTranscript: memory.transcripts.length > 0, mine: memory.contributorId === member.me.id },
    connectedChapters: memory.chapterSources.map(({ chapter: c }) => ({
      id: c.id,
      title: c.title,
      sequence: c.sequence,
      status: c.status,
      cover: c.pages[0]?.assets[0]?.imagePath ?? null,
    })),
  });
});

router.delete("/memories/:id", async (req, res) => {
  const member = await deletableMemory(req, res);
  if (!member) return;
  const memory = await prisma.memory.findUniqueOrThrow({ where: { id: member.memory.id }, include: { chapterSources: true } });
  const affectedChapterIds = memory.chapterSources.map((cs) => cs.chapterId);

  // Chapters built on this memory are held until the Vambie team reviews them.
  for (const chapterId of affectedChapterIds) {
    await prisma.guardianFinding.create({
      data: {
        chapterId,
        category: "source_removed",
        status: "needs_revision",
        note: "A memory this chapter was made from was deleted. Remove its influence and review the chapter before it can be published again.",
      },
    });
    await prisma.chapter.update({ where: { id: chapterId }, data: { guardianStatus: "needs_revision", status: "guardian_review" } });
  }

  if (memory.audioUrl) {
    const absPath = path.join(process.cwd(), memory.audioUrl.replace(/^\//, ""));
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  }
  await prisma.memory.delete({ where: { id: memory.id } });
  res.json({ ok: true, affectedChapterIds });
});

// One memory's recording and words, for keeping a copy before deleting it.
router.get("/memories/:id/export", async (req, res) => {
  const member = await memberForMemory(req, res, req.params.id);
  if (!member) return;
  const memory = await prisma.memory.findUniqueOrThrow({
    where: { id: member.memory.id },
    include: { transcripts: { orderBy: { createdAt: "desc" }, take: 1 }, contributor: true },
  });
  const slug = (memory.title || "memory").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "memory";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${slug}.zip"`);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.pipe(res);
  if (memory.audioUrl) {
    const absPath = path.join(process.cwd(), memory.audioUrl.replace(/^\//, ""));
    if (fs.existsSync(absPath)) archive.file(absPath, { name: `${slug}${path.extname(absPath)}` });
  }
  const date = (memory.eventDate ?? memory.recordedAt).toISOString().slice(0, 10);
  archive.append(`${memory.title || "Untitled memory"}\nRecorded by ${memory.contributor.name} · ${date}\n\n${memory.transcripts[0]?.text ?? "(no transcript)"}\n`, { name: `${slug}.txt` });
  await archive.finalize();
});

export default router;
