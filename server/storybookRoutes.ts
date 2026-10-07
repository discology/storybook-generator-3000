import express, { Router } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { prisma } from "./db";
import { createPagedChapter, recordedBy } from "./storyPages";
import { getCurrentUser } from "./session";
import { normalizePhone } from "./sms";
import { appUrl, renderMessage } from "./messageTemplates";
import { sendText } from "./texts";
import { flagFromFeedback } from "./feedbackRoutes";
import { audioSrc, canSeeChapter, canSeeMemory, isOwner, memberForChapter, memberForMemory, parseIds, requireMember } from "./access";
import { interpret, processMemory } from "./memoryPipeline";
import { canStartStorybook } from "./admin";
import { STAGE_KEYS, ageInYears, effectiveStage, stageForAge, vambieName } from "./readingStages";
import { eligibleMemories, isGenerating, lastBatchError, makeWeeklyChapter, nextScheduledBatch, TIMEZONES } from "./weeklyChapters";
import { usageFromRequest } from "./aiUsage";

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


const countJson = (json: string | null) => {
  try {
    const value = JSON.parse(json ?? "[]");
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
};
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// --- Onboarding: household, child, the parent as owner, and the storybook ---
router.post("/storybooks", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });
  if (!canStartStorybook(user)) {
    return res.status(403).json({ error: "Vambie is invite-only for now. If someone invited you, open the link they sent." });
  }

  const b = req.body ?? {};
  const childName = String(b.childName ?? "").trim();
  const parentName = String(b.parentName ?? "").trim();
  if (!childName || !parentName || !b.relationship) {
    return res.status(400).json({ error: "Add the child's name, your name and your relationship to them." });
  }
  // Reminder links are texted to this number; it defaults to the one they signed in with.
  const phone = normalizePhone(String(b.parentPhone || user.phone || ""));
  if (!phone) return res.status(400).json({ error: "Enter a full mobile number, like +1 555 123 4567. We text your reminder links there." });

  const household = await prisma.household.create({ data: { ownerUserId: user.id } });
  const child = await prisma.child.create({
    data: {
      householdId: household.id,
      displayName: childName,
      stage: b.stage === "expecting" ? "expecting" : "born",
      birthDate: b.birthDate ? new Date(b.birthDate) : null,
      dueDate: b.dueDate ? new Date(b.dueDate) : null,
    },
  });
  const contributor = await prisma.contributor.create({
    data: { householdId: household.id, userId: user.id, name: parentName, phone, relationship: b.relationship, role: "owner", inviteStatus: "joined" },
  });
  if (!user.name) await prisma.user.update({ where: { id: user.id }, data: { name: parentName } });

  const remindersOff = b.reminderFrequency === "off";
  const storybook = await prisma.storybook.create({
    data: {
      childId: child.id,
      title: String(b.title ?? "").trim() || `${childName}'s growing story`,
      // Growing with the child: the stored stage is where they start; new chapters follow their age.
      readerAgeBand:
        b.growWithChild === false && STAGE_KEYS.includes(b.readerAgeBand)
          ? b.readerAgeBand
          : stageForAge(b.stage === "expecting" ? null : ageInYears(b.birthDate)),
      growWithChild: b.growWithChild !== false,
      keepRecordings: b.keepRecordings !== false,
      defaultStoryUse: b.defaultStoryUse !== false,
      reminderFrequency: b.reminderFrequency === "daily" ? "daily" : "weekly",
      reminderDay: DAYS.includes(b.reminderDay) ? b.reminderDay : "Sunday",
      reminderTime: /^\d{2}:\d{2}$/.test(b.reminderTime ?? "") ? b.reminderTime : "19:00",
      reminderTimezone: b.reminderTimezone in TIMEZONES ? b.reminderTimezone : "Pacific Time",
      reminderChannel: "SMS",
      remindersPaused: remindersOff || b.smsConsent === false,
      lastBatchAt: new Date(),
    },
  });

  const welcome = await renderMessage("welcome", {
    parent_name: parentName,
    child_name: childName,
    storybook_title: storybook.title,
    storybook_url: appUrl(`/storybooks/${storybook.id}`),
    record_url: appUrl(`/storybooks/${storybook.id}/record`),
  });
  if (welcome) void sendText({ event: "welcome", to: { userId: user.id, phone: user.phone }, body: welcome, householdId: household.id });
  res.status(201).json({ storybook, child, contributor, household, welcomeMessage: welcome });
});

router.get("/storybooks", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });

  const storybooks = await prisma.storybook.findMany({
    where: { child: { household: { contributors: { some: { userId: user.id, inviteStatus: { not: "revoked" } } } } } },
    include: {
      child: { include: { household: { include: { contributors: { where: { userId: user.id } } } } } },
      chapters: { where: { status: "published" }, include: { access: true }, orderBy: { publishedAt: "desc" } },
      _count: { select: { memories: true, chapters: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  // Each storybook once, with the person's own place in it: their relationship,
  // their role, and the newest chapter they can read.
  res.json(
    storybooks.map(({ chapters, child: { household, ...child }, ...s }) => {
      const me = household.contributors[0];
      const latest = me ? chapters.find((c) => canSeeChapter(c, me)) : undefined;
      return {
        ...s,
        child,
        me: me ? { role: me.role, relationship: me.relationship, name: me.name } : null,
        latestChapter: latest ? { id: latest.id, title: latest.title, publishedAt: latest.publishedAt } : null,
      };
    })
  );
});

// The storybook as the signed-in family member may see it.
router.get("/storybooks/:id", async (req, res) => {
  const member = await requireMember(req, res, req.params.id);
  if (!member) return;
  const { me } = member;

  const storybook = await prisma.storybook.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      child: true,
      memories: { include: { contributor: true, chapterSources: true, transcripts: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { recordedAt: "desc" } },
      chapters: {
        include: {
          access: true,
          marks: { where: { contributorId: me.id } },
          pages: {
            orderBy: { pageNumber: "asc" },
            select: { approvedAt: true, assets: { where: { status: "ready" }, orderBy: { version: "desc" }, take: 1, select: { imagePath: true } } },
          },
        },
        orderBy: { sequence: "asc" },
      },
    },
  });

  const memories = storybook.memories
    .filter((m) => canSeeMemory(m, me))
    .map(({ transcripts, chapterSources, contributor, audioUrl, favoritedBy, ...m }) => ({
      ...m,
      typed: transcripts[0]?.source === "typed", // written, not recorded (VSB-85)
      audioSrc: audioSrc({ id: m.id, audioUrl }),
      contributor: { id: contributor.id, name: contributor.name, relationship: contributor.relationship },
      mine: m.contributorId === me.id,
      favorite: parseIds(favoritedBy).includes(me.id),
      excerpt: transcripts[0]?.text.slice(0, 220) ?? null,
      words: transcripts[0]?.text ?? "",
      chapterIds: chapterSources.map((s) => s.chapterId),
    }));

  const chapters = storybook.chapters
    .filter((c) => canSeeChapter(c, me))
    .map(({ pages, marks, access, generationSnapshot, characterSheet, content, ...c }) => ({
      ...c,
      pageCount: pages.length,
      approvedPages: pages.filter((p) => p.approvedAt).length,
      cover: pages.find((p) => p.assets[0])?.assets[0]?.imagePath ?? null,
      favorite: marks[0]?.favorite ?? false,
      readAt: marks[0]?.readAt ?? null,
      unresolvedCount: countJson(c.unresolvedPeople),
      accessCount: access.length,
      excerpt: content.slice(0, 240),
    }));

  const { memories: _m, chapters: _c, pendingCastKeys, ...settings } = storybook;
  res.json({
    ...settings,
    memories,
    chapters,
    pendingCastKeys: parseIds(pendingCastKeys),
    currentStage: effectiveStage(storybook),
    vambieName: vambieName(storybook),
    me: { contributorId: me.id, role: me.role, name: me.name, relationship: me.relationship },
    family: member.storybook.child.household.contributors
      .filter((c) => c.inviteStatus !== "revoked")
      .map((c) => ({ id: c.id, name: c.name, relationship: c.relationship, role: c.role, inviteStatus: c.inviteStatus })),
    nextChapterAt: nextScheduledBatch(storybook),
    generating: isGenerating(storybook.id),
    batchError: lastBatchError(storybook.id),
    // Older screens:
    defaultContributorId: me.id,
    myRole: me.role,
  });
});

// --- This week's chapter ---
router.get("/storybooks/:id/this-week", async (req, res) => {
  const member = await requireMember(req, res, req.params.id);
  if (!member) return;
  const storybook = member.storybook;
  const since = storybook.lastBatchAt ?? storybook.createdAt;
  const recent = await prisma.memory.findMany({
    where: { storybookId: storybook.id, chapterSources: { none: {} }, OR: [{ recordedAt: { gte: since } }, { status: { in: ["recorded", "transcribing", "transcribed", "interpreted", "failed"] } }] },
    include: { contributor: true },
    orderBy: { recordedAt: "desc" },
  });
  const eligible = await eligibleMemories(storybook.id);
  const inProgress = await prisma.chapter.findFirst({
    where: { storybookId: storybook.id, status: { not: "published" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, pagesStatus: true, sequence: true, createdAt: true },
  });
  res.json({
    nextChapterAt: nextScheduledBatch(storybook),
    generating: isGenerating(storybook.id),
    error: lastBatchError(storybook.id),
    readyCount: eligible.length,
    memories: recent
      .filter((m) => canSeeMemory(m, member.me))
      .map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        processingError: m.processingError,
        storyUseConsent: m.storyUseConsent,
        recordedAt: m.recordedAt,
        durationSec: m.durationSec,
        contributor: { name: m.contributor.name },
        mine: m.contributorId === member.me.id,
      })),
    otherCount: recent.filter((m) => !canSeeMemory(m, member.me) && m.storyUseConsent).length,
    chapterInProgress: isOwner(member.me) ? inProgress : null,
  });
});

router.post("/storybooks/:id/chapters/weekly", async (req, res) => {
  const member = await requireMember(req, res, req.params.id, { owner: true });
  if (!member) return;
  if (isGenerating(member.storybook.id)) return res.status(202).json({ started: false, generating: true });
  const ready = await eligibleMemories(member.storybook.id);
  if (ready.length === 0) return res.status(400).json({ error: "No memories are ready for a chapter yet." });
  void makeWeeklyChapter(member.storybook.id).catch(() => undefined);
  res.status(202).json({ started: true });
});

router.put("/storybooks/:id/next-cast", async (req, res) => {
  const member = await requireMember(req, res, req.params.id, { owner: true });
  if (!member) return;
  const keys = Array.isArray(req.body?.castKeys) ? req.body.castKeys.map(String) : [];
  await prisma.storybook.update({ where: { id: member.storybook.id }, data: { pendingCastKeys: JSON.stringify(keys) } });
  res.json({ castKeys: keys });
});

// Makes a chapter from hand-picked memories (kept for testing and the admin).
router.post("/storybooks/:id/chapters", async (req, res) => {
  const member = await requireMember(req, res, req.params.id, { owner: true });
  if (!member) return;
  const { memoryIds, castKeys } = req.body ?? {};
  if (!Array.isArray(memoryIds) || memoryIds.length === 0) return res.status(400).json({ error: "memoryIds (non-empty array) is required" });

  const memories = await prisma.memory.findMany({
    where: { id: { in: memoryIds }, storybookId: member.storybook.id },
    include: { transcripts: { orderBy: { createdAt: "desc" }, take: 1 }, interpretation: true, contributor: true },
  });
  if (memories.some((m) => !m.storyUseConsent)) return res.status(400).json({ error: "All selected memories must be allowed in stories first." });

  try {
    const chapter = await createPagedChapter({
      storybookId: member.storybook.id,
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
    await prisma.memory.updateMany({ where: { id: { in: memoryIds } }, data: { status: "ready" } });
    res.status(201).json(chapter);
  } catch (error: any) {
    res.status(502).json({ error: `Couldn't write the chapter: ${error?.message ?? "unknown error"}` });
  }
});

// --- Memories ---
router.post("/storybooks/:id/memories", async (req, res) => {
  const member = await requireMember(req, res, req.params.id);
  if (!member) return;
  const { storybook, me } = member;
  const b = req.body ?? {};
  // A typed memory (VSB-85) arrives with its words, and skips transcription.
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 4000) : null;
  if (text !== null && text.length < 10) return res.status(400).json({ error: "Write a little more: a sentence or two is plenty." });
  const memory = await prisma.memory.create({
    data: {
      storybookId: storybook.id,
      contributorId: me.id,
      ...(text ? { status: "transcribed", durationSec: null, transcripts: { create: { source: "typed", text } } } : {}),
      title: b.title ? String(b.title).slice(0, 80) : null,
      eventDate: b.eventDate ? new Date(b.eventDate) : null,
      visibility: b.visibility === "household" ? "household" : b.visibility === "contributor_only" ? "contributor_only" : storybook.defaultVisibility,
      storyUseConsent: b.storyUseConsent !== undefined ? Boolean(b.storyUseConsent) : storybook.defaultStoryUse,
      durationSec: Number.isFinite(Number(b.durationSec)) ? Math.round(Number(b.durationSec)) : null,
      promptId: b.promptId ? String(b.promptId) : null,
      promptText: b.promptText ? String(b.promptText) : null,
    },
  });
  if (text) void interpret(memory.id, text, true).catch((e) => console.error(`Interpreting typed memory ${memory.id} failed:`, e?.message));
  res.status(201).json(memory);
});

router.post("/memories/:id/audio", upload.single("audio"), usageFromRequest("family"), async (req, res) => {
  const member = await memberForMemory(req, res, req.params.id);
  if (!member) return;
  if (member.memory.contributorId !== member.me.id) return res.status(403).json({ error: "access_denied" });
  if (!req.file) return res.status(400).json({ error: "No audio uploaded" });

  const updated = await prisma.memory.update({
    where: { id: member.memory.id },
    data: { audioUrl: `/uploads/memories/${req.file.filename}`, status: "recorded", processingError: null },
  });
  void processMemory(updated.id);
  res.json({ ...updated, audioSrc: audioSrc(updated) });
});

router.get("/memories/:id/audio", async (req, res) => {
  const member = await memberForMemory(req, res, req.params.id);
  if (!member) return;
  if (!member.memory.audioUrl) return res.status(404).json({ error: "This recording wasn't kept." });
  res.sendFile(path.join(process.cwd(), member.memory.audioUrl.replace(/^\//, "")));
});

router.get("/memories/:id", async (req, res) => {
  const member = await memberForMemory(req, res, req.params.id);
  if (!member) return;
  const memory = await prisma.memory.findUniqueOrThrow({
    where: { id: member.memory.id },
    include: {
      contributor: true,
      transcripts: { orderBy: { createdAt: "desc" }, take: 1 },
      interpretation: true,
      chapterSources: { include: { chapter: { include: { access: true, pages: { orderBy: { pageNumber: "asc" }, take: 1, include: { assets: { where: { status: "ready" }, orderBy: { version: "desc" }, take: 1 } } } } } } },
    },
  });
  const { audioUrl, favoritedBy, chapterSources, contributor, transcripts, ...rest } = memory;
  res.json({
    ...rest,
    typed: transcripts[0]?.source === "typed",
    audioSrc: audioSrc(memory),
    recordingKept: member.storybook.keepRecordings,
    favorite: parseIds(favoritedBy).includes(member.me.id),
    mine: memory.contributorId === member.me.id,
    contributor: { id: contributor.id, name: contributor.name, relationship: contributor.relationship },
    transcript: transcripts[0] ?? null,
    chapters: chapterSources
      .map((s) => s.chapter)
      .filter((c) => canSeeChapter(c, member.me))
      .map((c) => ({ id: c.id, title: c.title, sequence: c.sequence, status: c.status, cover: c.pages[0]?.assets[0]?.imagePath ?? null })),
    storybook: { id: member.storybook.id, title: member.storybook.title, childName: member.storybook.child.displayName },
    nextChapterAt: nextScheduledBatch(member.storybook),
    canDelete: memory.contributorId === member.me.id || isOwner(member.me),
  });
});

router.put("/memories/:id", async (req, res) => {
  const member = await memberForMemory(req, res, req.params.id);
  if (!member) return;
  if (member.memory.contributorId !== member.me.id) return res.status(403).json({ error: "Only the person who recorded this memory can change it." });
  const b = req.body ?? {};
  const updated = await prisma.memory.update({
    where: { id: member.memory.id },
    data: {
      ...(typeof b.title === "string" && b.title.trim() ? { title: b.title.trim().slice(0, 80) } : {}),
      ...(b.visibility === "household" || b.visibility === "contributor_only" ? { visibility: b.visibility } : {}),
      ...(typeof b.storyUseConsent === "boolean" ? { storyUseConsent: b.storyUseConsent } : {}),
      ...(b.eventDate !== undefined ? { eventDate: b.eventDate ? new Date(b.eventDate) : null } : {}),
    },
  });
  res.json(updated);
});

router.put("/memories/:id/favorite", async (req, res) => {
  const member = await memberForMemory(req, res, req.params.id);
  if (!member) return;
  const ids = new Set(parseIds(member.memory.favoritedBy));
  if (req.body?.favorite) ids.add(member.me.id);
  else ids.delete(member.me.id);
  await prisma.memory.update({ where: { id: member.memory.id }, data: { favoritedBy: JSON.stringify([...ids]) } });
  res.json({ favorite: ids.has(member.me.id) });
});

// Retries transcription and interpretation after a failure.
router.post("/memories/:id/process", async (req, res) => {
  const member = await memberForMemory(req, res, req.params.id);
  if (!member) return;
  void processMemory(member.memory.id);
  res.status(202).json({ started: true });
});

// The recorder corrects what was heard; the memory is interpreted again.
router.put("/memories/:id/transcript", async (req, res) => {
  const member = await memberForMemory(req, res, req.params.id);
  if (!member) return;
  if (member.memory.contributorId !== member.me.id) return res.status(403).json({ error: "Only the person who recorded this memory can edit its words." });
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.status(400).json({ error: "The transcript can't be empty." });

  // Edits to a typed memory stay "typed", so it's still shown as written (VSB-85).
  const latest = await prisma.transcriptVersion.findFirst({ where: { memoryId: member.memory.id }, orderBy: { createdAt: "desc" } });
  await prisma.transcriptVersion.create({ data: { memoryId: member.memory.id, source: latest?.source === "typed" ? "typed" : "corrected", text } });
  await prisma.memory.update({ where: { id: member.memory.id }, data: { status: "transcribed", processingError: null } });
  void interpret(member.memory.id, text, !member.memory.title).catch(() => undefined);
  res.json({ ok: true });
});

// --- Chapters ---
router.get("/chapters/:id/read", async (req, res) => {
  const member = await memberForChapter(req, res, req.params.id);
  if (!member) return;
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: member.chapter.id },
    include: {
      pages: { orderBy: { pageNumber: "asc" }, include: { assets: { where: { status: "ready" }, orderBy: { version: "desc" }, take: 1 } } },
      marks: { where: { contributorId: member.me.id } },
      storybook: { include: { chapters: { where: { status: "published" }, select: { id: true, sequence: true, shareMode: true, status: true, access: true } } } },
    },
  });
  const readable = chapter.storybook.chapters.filter((c) => canSeeChapter(c, member.me)).sort((a, b) => a.sequence - b.sequence);
  const index = readable.findIndex((c) => c.id === chapter.id);
  res.json({
    id: chapter.id,
    title: chapter.title,
    sequence: chapter.sequence,
    status: chapter.status,
    content: chapter.content,
    publishedAt: chapter.publishedAt,
    pages: chapter.pages.map((p) => ({ id: p.id, pageNumber: p.pageNumber, text: p.text, pictureSize: p.pictureSize, visibleAction: p.visibleAction, image: p.assets[0]?.imagePath ?? null })),
    mark: chapter.marks[0] ?? null,
    storybook: { id: chapter.storybookId, title: chapter.storybook.title, childName: member.storybook.child.displayName },
    nextChapterId: index >= 0 ? readable[index + 1]?.id ?? null : null,
    previousChapterId: index > 0 ? readable[index - 1].id : null,
    canShare: isOwner(member.me),
  });
});

router.put("/chapters/:id/mark", async (req, res) => {
  const member = await memberForChapter(req, res, req.params.id);
  if (!member) return;
  const b = req.body ?? {};
  const where = { chapterId_contributorId: { chapterId: member.chapter.id, contributorId: member.me.id } };
  const existing = await prisma.chapterMark.findUnique({ where });
  const data = {
    ...(typeof b.favorite === "boolean" ? { favorite: b.favorite } : {}),
    ...(Number.isInteger(b.lastPage) ? { lastPage: b.lastPage } : {}),
    ...(b.opened && !existing?.readAt ? { readAt: new Date() } : {}),
    ...(b.finished ? { finishedAt: new Date() } : {}),
  };
  const mark = existing
    ? await prisma.chapterMark.update({ where, data })
    : await prisma.chapterMark.create({ data: { chapterId: member.chapter.id, contributorId: member.me.id, ...data } });
  res.json(mark);
});

const FEEDBACK_REASONS = ["missed_meaning", "too_private", "reading_level", "wrong_detail"];

router.post("/chapters/:id/feedback", async (req, res) => {
  const member = await memberForChapter(req, res, req.params.id);
  if (!member) return;
  const reason = String(req.body?.reason ?? "");
  if (!FEEDBACK_REASONS.includes(reason)) return res.status(400).json({ error: "Pick what needs attention." });
  const feedback = await prisma.storyFeedback.create({
    data: { chapterId: member.chapter.id, contributorId: member.me.id, reason, note: String(req.body?.note ?? "").slice(0, 1000) },
  });
  // It also joins the team's feedback queue (VSB-95).
  await flagFromFeedback(feedback.id).catch((e) => console.error("Feedback flag:", e?.message));
  res.status(201).json(feedback);
});

router.put("/chapters/:id/publish", async (req, res) => {
  const member = await memberForChapter(req, res, req.params.id, { owner: true });
  if (!member) return;
  const chapter = member.chapter;
  if (chapter.guardianStatus !== "approved") return res.status(400).json({ error: "This chapter is still being reviewed by the Vambie team." });
  const unapproved = await prisma.storyPage.count({ where: { chapterId: chapter.id, approvedAt: null } });
  if (unapproved > 0) return res.status(400).json({ error: `Approve every page first (${unapproved} still need approval).` });
  const updated = await prisma.chapter.update({ where: { id: chapter.id }, data: { status: "published", publishedAt: new Date() } });
  void textNewChapter(updated.id, member.me.id).catch((e) => console.error("New chapter texts:", e?.message));
  res.json(updated);
});

// "A new chapter is ready" to everyone else in the family who can read it.
export async function textNewChapter(chapterId: string, publisherId: string) {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { access: true, storybook: { include: { child: { include: { household: { include: { contributors: { include: { user: true } } } } } } } } },
  });
  const sb = chapter.storybook;
  const body = await renderMessage("chapter_ready", {
    child_name: sb.child.displayName,
    storybook_title: sb.title,
    chapter_title: chapter.title,
    chapter_url: appUrl(`/storybooks/${sb.id}/read/${chapter.id}`),
  });
  if (!body) return;
  for (const c of sb.child.household.contributors) {
    if (c.id === publisherId || c.inviteStatus !== "joined" || !c.user?.phone || !canSeeChapter(chapter, c)) continue;
    await sendText({ event: "chapter_ready", to: { userId: c.user.id, phone: c.user.phone }, body, householdId: sb.child.householdId });
  }
}

// --- Chapter sharing ---
router.get("/chapters/:id/access", async (req, res) => {
  const member = await memberForChapter(req, res, req.params.id, { owner: true });
  if (!member) return;
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: member.chapter.id },
    include: { pages: { orderBy: { pageNumber: "asc" }, take: 1, include: { assets: { where: { status: "ready" }, orderBy: { version: "desc" }, take: 1 } } } },
  });
  res.json({
    chapter: { id: chapter.id, title: chapter.title, sequence: chapter.sequence, status: chapter.status, publishedAt: chapter.publishedAt, cover: chapter.pages[0]?.assets[0]?.imagePath ?? null },
    shareMode: chapter.shareMode,
    allowedContributorIds: member.chapter.access.map((a) => a.contributorId),
    myContributorId: member.me.id,
    family: member.storybook.child.household.contributors
      .filter((c) => c.id !== member.me.id && c.inviteStatus !== "revoked")
      .map((c) => ({ id: c.id, name: c.name, relationship: c.relationship, inviteStatus: c.inviteStatus })),
  });
});

router.put("/chapters/:id/access", async (req, res) => {
  const member = await memberForChapter(req, res, req.params.id, { owner: true });
  if (!member) return;
  const shareMode = ["family", "selected", "private"].includes(req.body?.shareMode) ? req.body.shareMode : "selected";
  const familyIds = new Set(member.storybook.child.household.contributors.map((c) => c.id));
  const ids: string[] = Array.isArray(req.body?.contributorIds) ? req.body.contributorIds.map(String).filter((id: string) => familyIds.has(id)) : [];
  await prisma.chapterAccess.deleteMany({ where: { chapterId: member.chapter.id } });
  if (shareMode === "selected" && ids.length) {
    await prisma.chapterAccess.createMany({ data: ids.map((contributorId) => ({ chapterId: member.chapter.id, contributorId })) });
  }
  await prisma.chapter.update({ where: { id: member.chapter.id }, data: { shareMode } });
  res.json({ ok: true, shareMode });
});

// Texting chapter links needs a Twilio sending number, which isn't set up yet:
// the share is recorded (recipients see it in their book) and the message is
// returned for the sender to pass on themselves.
router.post("/chapters/:id/share", async (req, res) => {
  const member = await memberForChapter(req, res, req.params.id, { owner: true });
  if (!member) return;
  const chapter = member.chapter;
  if (chapter.status !== "published") return res.status(400).json({ error: "Publish the chapter before sharing it." });
  const familyIds = new Set(member.storybook.child.household.contributors.map((c) => c.id));
  const recipientIds: string[] = (Array.isArray(req.body?.recipientIds) ? req.body.recipientIds.map(String) : []).filter((id: string) => familyIds.has(id));
  if (recipientIds.length === 0) return res.status(400).json({ error: "Choose who to send it to." });

  // Sending to someone gives them access when the chapter is shared with selected people.
  if (chapter.shareMode !== "family") {
    const existing = new Set(member.chapter.access.map((a) => a.contributorId));
    const add = recipientIds.filter((id) => !existing.has(id));
    if (add.length) await prisma.chapterAccess.createMany({ data: add.map((contributorId) => ({ chapterId: chapter.id, contributorId })) });
    if (chapter.shareMode === "private") await prisma.chapter.update({ where: { id: chapter.id }, data: { shareMode: "selected" } });
  }
  const message = String(req.body?.message ?? "").slice(0, 200);
  await prisma.chapterShare.create({ data: { chapterId: chapter.id, sentBy: member.me.id, recipientIds: JSON.stringify(recipientIds), message } });
  const link = appUrl(`/storybooks/${chapter.storybookId}/read/${chapter.id}`);
  const text = await renderMessage("chapter_ready", {
    child_name: member.storybook.child.displayName,
    storybook_title: member.storybook.title,
    chapter_title: chapter.title,
    chapter_url: link,
  });
  res.json({ ok: true, link, text: message ? `${message}\n\n${text ?? link}` : text ?? link });
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
  "keepRecordings",
  "vambieNameAge",
] as const;

router.put("/storybooks/:id/settings", async (req, res) => {
  const member = await requireMember(req, res, req.params.id, { owner: true });
  if (!member) return;
  const data: Record<string, unknown> = {};
  for (const field of SETTINGS_FIELDS) {
    if (field in (req.body ?? {})) data[field] = req.body[field];
  }
  if ("remindersPausedUntil" in (req.body ?? {})) data.remindersPausedUntil = req.body.remindersPausedUntil ? new Date(req.body.remindersPausedUntil) : null;
  if (typeof data.title === "string" && !data.title.trim()) delete data.title;
  // 13 means "keep calling him Baby Vambie": the stages end at 12.
  if ("vambieNameAge" in data) data.vambieNameAge = Math.min(13, Math.max(1, Math.round(Number(data.vambieNameAge)) || 4));
  if ("readerAgeBand" in data && !STAGE_KEYS.includes(String(data.readerAgeBand))) delete data.readerAgeBand;
  const storybook = await prisma.storybook.update({ where: { id: member.storybook.id }, data });

  const { childName, birthDate } = req.body ?? {};
  if (childName || birthDate) {
    await prisma.child.update({
      where: { id: storybook.childId },
      data: { ...(childName ? { displayName: String(childName).trim() } : {}), ...(birthDate ? { birthDate: new Date(birthDate) } : {}) },
    });
  }
  res.json(storybook);
});

export default router;
