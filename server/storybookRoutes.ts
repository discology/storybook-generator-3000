import express, { Router } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { prisma } from "./db";
import { transcribeAudio, interpretMemory } from "./aiService";
import { createPagedChapter, recordedBy } from "./storyPages";
import { getCurrentUser } from "./session";
import { normalizePhone } from "./sms";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "memories");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

const router: Router = express.Router();

// --- Onboarding: create Household + Child + Contributor + Storybook in one go ---
router.post("/storybooks", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const { childName, stage, birthDate, dueDate, readerAgeBand, parentName, parentPhone, relationship, title } =
    req.body ?? {};

  if (!childName || !parentName || !relationship) {
    return res.status(400).json({ error: "Child's name, your name and your relationship are required." });
  }
  // Required: reminder links are texted to this number.
  const phone = normalizePhone(String(parentPhone ?? ""));
  if (!phone) return res.status(400).json({ error: "Enter a full mobile number, like +1 555 123 4567. We text your reminder links there." });

  const household = await prisma.household.create({ data: { ownerUserId: user.id } });
  const child = await prisma.child.create({
    data: {
      householdId: household.id,
      displayName: childName,
      stage: stage || "born",
      birthDate: birthDate ? new Date(birthDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });
  const contributor = await prisma.contributor.create({
    data: {
      householdId: household.id,
      userId: user.id,
      name: parentName,
      phone,
      relationship,
      role: "owner",
      inviteStatus: "joined",
    },
  });
  const storybook = await prisma.storybook.create({
    data: {
      childId: child.id,
      title: title || `${childName}'s Story`,
      readerAgeBand: readerAgeBand || "0-3",
    },
  });

  res.status(201).json({ storybook, child, contributor, household });
});

router.get("/storybooks", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const storybooks = await prisma.storybook.findMany({
    where: { child: { household: { contributors: { some: { userId: user.id } } } } },
    include: { child: true, _count: { select: { memories: true, chapters: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(storybooks);
});

router.get("/storybooks/:id", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const storybook = await prisma.storybook.findUnique({
    where: { id: req.params.id },
    include: {
      child: { include: { household: { include: { contributors: true } } } },
      memories: { include: { transcripts: true, interpretation: true, contributor: true }, orderBy: { recordedAt: "desc" } },
      chapters: {
        include: {
          sources: true,
          pages: {
            orderBy: { pageNumber: "asc" },
            include: { assets: { where: { status: "ready" }, orderBy: { version: "desc" }, take: 1 } },
          },
        },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!storybook) return res.status(404).json({ error: "Storybook not found" });

  const myContributor = storybook.child.household.contributors.find((c) => c.userId === user.id);
  if (!myContributor) return res.status(403).json({ error: "access_denied" });

  res.json({ ...storybook, defaultContributorId: myContributor.id, myRole: myContributor.role });
});

// --- Memory capture ---
router.post("/storybooks/:id/memories", async (req, res) => {
  const storybook = await prisma.storybook.findUnique({ where: { id: req.params.id } });
  if (!storybook) return res.status(404).json({ error: "Storybook not found" });

  const { contributorId, title, eventDate, visibility, storyUseConsent } = req.body ?? {};
  if (!contributorId) return res.status(400).json({ error: "contributorId is required" });

  const memory = await prisma.memory.create({
    data: {
      storybookId: storybook.id,
      contributorId,
      title: title || null,
      eventDate: eventDate ? new Date(eventDate) : null,
      visibility: visibility || storybook.defaultVisibility,
      storyUseConsent: storyUseConsent !== undefined ? Boolean(storyUseConsent) : storybook.defaultStoryUse,
    },
  });
  res.status(201).json(memory);
});

router.post("/memories/:id/audio", upload.single("audio"), async (req, res) => {
  const memory = await prisma.memory.findUnique({ where: { id: req.params.id } });
  if (!memory) return res.status(404).json({ error: "Memory not found" });
  if (!req.file) return res.status(400).json({ error: "No audio uploaded" });

  const audioUrl = `/uploads/memories/${req.file.filename}`;
  const updated = await prisma.memory.update({
    where: { id: memory.id },
    data: { audioUrl, status: "recorded" },
  });
  res.json(updated);
});

// --- Transcription: attempt AI transcription, or accept a manual transcript ---
router.post("/memories/:id/transcribe", async (req, res) => {
  const memory = await prisma.memory.findUnique({ where: { id: req.params.id } });
  if (!memory) return res.status(404).json({ error: "Memory not found" });
  if (!memory.audioUrl) return res.status(400).json({ error: "Memory has no audio yet" });

  const filePath = path.join(process.cwd(), memory.audioUrl.replace(/^\//, ""));
  const mimeType = req.body?.mimeType || "audio/webm";
  const result = await transcribeAudio(filePath, mimeType);

  if (result.text) {
    await prisma.transcriptVersion.create({
      data: { memoryId: memory.id, source: "machine", text: result.text },
    });
    await prisma.memory.update({ where: { id: memory.id }, data: { status: "transcribed" } });
  }

  res.json({ text: result.text, isMock: result.isMock, reason: result.reason });
});

// Manually set/correct the transcript (used when no AI key is configured, or to fix mistakes)
router.put("/memories/:id/transcript", async (req, res) => {
  const memory = await prisma.memory.findUnique({ where: { id: req.params.id } });
  if (!memory) return res.status(404).json({ error: "Memory not found" });
  const { text } = req.body ?? {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: "text is required" });

  await prisma.transcriptVersion.create({
    data: { memoryId: memory.id, source: "corrected", text: String(text).trim() },
  });
  const updated = await prisma.memory.update({ where: { id: memory.id }, data: { status: "transcribed" } });
  res.json(updated);
});

// --- Interpretation ---
router.post("/memories/:id/interpret", async (req, res) => {
  const memory = await prisma.memory.findUnique({
    where: { id: req.params.id },
    include: { transcripts: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!memory) return res.status(404).json({ error: "Memory not found" });
  const latestTranscript = memory.transcripts[0];
  if (!latestTranscript) return res.status(400).json({ error: "Memory has no transcript yet" });

  const result = await interpretMemory(latestTranscript.text);
  const interpretation = await prisma.memoryInterpretation.upsert({
    where: { memoryId: memory.id },
    update: { events: result.events, emotions: result.emotions, themes: result.themes, isMock: result.isMock },
    create: {
      memoryId: memory.id,
      events: result.events,
      emotions: result.emotions,
      themes: result.themes,
      isMock: result.isMock,
    },
  });
  await prisma.memory.update({ where: { id: memory.id }, data: { status: "interpreted" } });
  res.json(interpretation);
});

// Toggle whether a memory may be used to inform the shared story (separate from recording privacy)
router.put("/memories/:id/story-use", async (req, res) => {
  const { storyUseConsent } = req.body ?? {};
  const updated = await prisma.memory.update({
    where: { id: req.params.id },
    data: { storyUseConsent: Boolean(storyUseConsent) },
  });
  res.json(updated);
});

// --- Chapter generation ---
router.post("/storybooks/:id/chapters", async (req, res) => {
  const storybook = await prisma.storybook.findUnique({
    where: { id: req.params.id },
    include: { child: true, chapters: true },
  });
  if (!storybook) return res.status(404).json({ error: "Storybook not found" });

  const { memoryIds, castKeys } = req.body ?? {};
  if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
    return res.status(400).json({ error: "memoryIds (non-empty array) is required" });
  }

  const memories = await prisma.memory.findMany({
    where: { id: { in: memoryIds }, storybookId: storybook.id },
    include: { transcripts: { orderBy: { createdAt: "desc" }, take: 1 }, interpretation: true, contributor: true },
  });

  const missingUseConsent = memories.filter((m) => !m.storyUseConsent);
  if (missingUseConsent.length > 0) {
    return res.status(400).json({ error: "All selected memories must have storyUseConsent granted first." });
  }

  let chapter;
  try {
    chapter = await createPagedChapter({
      storybookId: storybook.id,
      castKeys: Array.isArray(castKeys) ? castKeys.map(String) : [],
      memories: memories.map((m) => ({
        id: m.id,
        transcript: m.transcripts[0]?.text ?? "",
        events: m.interpretation?.events ?? "",
        emotions: m.interpretation?.emotions ?? "",
        themes: m.interpretation?.themes ?? "",
        recordedBy: recordedBy(m.contributor),
      })),
    });
  } catch (error: any) {
    return res.status(502).json({ error: `Couldn't write the chapter: ${error?.message ?? "unknown error"}` });
  }
  await prisma.memory.updateMany({ where: { id: { in: memoryIds } }, data: { status: "ready" } });
  res.status(201).json(chapter);
});

router.put("/chapters/:id/publish", async (req, res) => {
  const chapter = await prisma.chapter.findUnique({ where: { id: req.params.id } });
  if (!chapter) return res.status(404).json({ error: "Not found" });
  if (chapter.guardianStatus !== "approved") {
    return res.status(400).json({ error: "This chapter needs Guardian approval before it can be published." });
  }
  const unapproved = await prisma.storyPage.count({ where: { chapterId: chapter.id, approvedAt: null } });
  if (unapproved > 0) {
    return res.status(400).json({ error: `Approve every page first (${unapproved} still need approval).` });
  }
  const updated = await prisma.chapter.update({ where: { id: req.params.id }, data: { status: "published" } });
  res.json(updated);
});

// --- Chapter sharing ---
router.get("/chapters/:id/access", async (req, res) => {
  const chapter = await prisma.chapter.findUnique({
    where: { id: req.params.id },
    include: {
      storybook: { include: { child: { include: { household: { include: { contributors: true } } } } } },
      access: true,
    },
  });
  if (!chapter) return res.status(404).json({ error: "Not found" });
  res.json({
    contributors: chapter.storybook.child.household.contributors,
    allowedContributorIds: chapter.access.map((a) => a.contributorId),
    restricted: chapter.access.length > 0,
  });
});

router.put("/chapters/:id/access", async (req, res) => {
  const { contributorIds } = req.body ?? {};
  await prisma.chapterAccess.deleteMany({ where: { chapterId: req.params.id } });
  if (Array.isArray(contributorIds) && contributorIds.length > 0) {
    await prisma.chapterAccess.createMany({
      data: contributorIds.map((contributorId: string) => ({ chapterId: req.params.id, contributorId })),
    });
  }
  res.json({ ok: true });
});

// --- Settings ---
const SETTINGS_FIELDS = [
  "title",
  "readerAgeBand",
  "growWithChild",
  "language",
  "reminderFrequency",
  "reminderDay",
  "reminderTime",
  "reminderTimezone",
  "reminderChannel",
  "remindersPaused",
  "defaultVisibility",
  "defaultStoryUse",
] as const;

router.put("/storybooks/:id/settings", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const data: Record<string, unknown> = {};
  for (const field of SETTINGS_FIELDS) {
    if (field in (req.body ?? {})) data[field] = req.body[field];
  }
  const { childName, birthDate } = req.body ?? {};

  const storybook = await prisma.storybook.update({ where: { id: req.params.id }, data });

  if (childName || birthDate) {
    await prisma.child.update({
      where: { id: storybook.childId },
      data: {
        ...(childName ? { displayName: childName } : {}),
        ...(birthDate ? { birthDate: new Date(birthDate) } : {}),
      },
    });
  }

  res.json(storybook);
});

export default router;
