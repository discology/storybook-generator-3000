import express, { Router } from "express";
import { prisma } from "./db";
import { guardianReview } from "./aiService";
import { createPagedChapter, recordedBy } from "./storyPages";
import { effectiveStage, stageInfo } from "./readingStages";

// The Vambie team's side: Story Review, family feedback, an overview and the
// list of families. Every /api/admin route requires an admin (see server.ts).

const router: Router = express.Router();

type Tab = "needs_review" | "in_revision" | "approved";

const coverOf = (pages: { assets: { imagePath: string | null }[] }[]) => pages.find((p) => p.assets[0]?.imagePath)?.assets[0]?.imagePath ?? null;
const readyAsset = { where: { status: "ready" }, orderBy: { version: "desc" as const }, take: 1, select: { imagePath: true } };

function tabFor(c: { guardianStatus: string; revisionRequested: boolean }, openFeedback: number): Tab {
  if (openFeedback > 0) return "needs_review";
  if (c.guardianStatus === "approved") return "approved";
  if (c.guardianStatus === "needs_revision" && c.revisionRequested) return "in_revision";
  return "needs_review";
}

router.get("/admin/chapters", async (_req, res) => {
  const chapters = await prisma.chapter.findMany({
    include: {
      storybook: { include: { child: true } },
      findings: { where: { status: "needs_revision" } },
      feedback: { where: { status: "open" } },
      pages: { orderBy: { pageNumber: "asc" }, select: { assets: readyAsset } },
    },
    orderBy: { createdAt: "desc" },
  });
  const rows = chapters.map((c) => ({
    id: c.id,
    title: c.title,
    sequence: c.sequence,
    childName: c.storybook.child.displayName,
    storybookTitle: c.storybook.title,
    storybookId: c.storybookId,
    status: c.status,
    guardianStatus: c.guardianStatus,
    version: c.version,
    cover: coverOf(c.pages),
    tab: tabFor(c, c.feedback.length),
    reasons: [...new Set([...c.findings.map((f) => f.category), ...(c.feedback.length ? ["family_feedback"] : [])])],
    openFeedback: c.feedback.length,
    createdAt: c.createdAt,
  }));
  res.json({
    chapters: rows,
    // A held chapter should never be readable by a family.
    heldShared: chapters.filter((c) => c.status === "published" && c.guardianStatus === "needs_revision").length,
  });
});

router.get("/admin/chapters/:id", async (req, res) => {
  const chapter = await prisma.chapter.findUnique({
    where: { id: req.params.id },
    include: {
      storybook: { include: { child: true } },
      findings: { orderBy: { createdAt: "asc" } },
      feedback: { include: { contributor: true }, orderBy: { createdAt: "desc" } },
      pages: { orderBy: { pageNumber: "asc" }, include: { assets: readyAsset } },
      sources: { include: { memory: { include: { interpretation: true, contributor: true } } } },
    },
  });
  if (!chapter) return res.status(404).json({ error: "Not found" });
  const stage = stageInfo(effectiveStage(chapter.storybook));
  res.json({
    id: chapter.id,
    title: chapter.title,
    sequence: chapter.sequence,
    version: chapter.version,
    content: chapter.content,
    status: chapter.status,
    guardianStatus: chapter.guardianStatus,
    revisionRequested: chapter.revisionRequested,
    pagesStatus: chapter.pagesStatus,
    shareMode: chapter.shareMode,
    isMock: chapter.isMock,
    createdAt: chapter.createdAt,
    storybook: {
      id: chapter.storybookId,
      title: chapter.storybook.title,
      childName: chapter.storybook.child.displayName,
      stage: `${chapter.storybook.growWithChild ? `Grow with ${chapter.storybook.child.displayName}` : "Fixed level"} · ${stage.label}`,
    },
    pages: chapter.pages.map((p) => ({ id: p.id, pageNumber: p.pageNumber, text: p.text, pictureSize: p.pictureSize, image: p.assets[0]?.imagePath ?? null })),
    findings: chapter.findings.map((f) => ({ id: f.id, category: f.category, status: f.status, note: f.note, quote: f.quote })),
    feedback: chapter.feedback.map((f) => ({ id: f.id, reason: f.reason, note: f.note, status: f.status, createdAt: f.createdAt, from: `${f.contributor.name}${f.contributor.relationship ? ` (${f.contributor.relationship})` : ""}` })),
    sources: chapter.sources.map((s) => ({
      id: s.memory.id,
      title: s.memory.title,
      recordedBy: recordedBy(s.memory.contributor),
      events: s.memory.interpretation?.events ?? null,
      emotions: s.memory.interpretation?.emotions ?? null,
      themes: s.memory.interpretation?.themes ?? null,
    })),
  });
});

router.post("/admin/chapters/:id/run-guardian", async (req, res) => {
  const chapter = await prisma.chapter.findUnique({
    where: { id: req.params.id },
    include: { storybook: { include: { chapters: { where: { status: "published" }, orderBy: { sequence: "asc" } } } } },
  });
  if (!chapter) return res.status(404).json({ error: "Not found" });

  const result = await guardianReview({
    chapterContent: chapter.content,
    readerAgeBand: chapter.storybook.readerAgeBand,
    priorChapterTitles: chapter.storybook.chapters.filter((c) => c.id !== chapter.id).map((c) => c.title),
  });
  await prisma.guardianFinding.deleteMany({ where: { chapterId: chapter.id } });
  await prisma.guardianFinding.createMany({
    data: result.findings.map((f) => ({ chapterId: chapter.id, category: f.category, status: f.status, note: f.note, quote: f.status === "needs_revision" && f.quote ? String(f.quote) : null })),
  });
  const hasIssues = result.findings.some((f) => f.status === "needs_revision");
  // A published chapter with no issues stays published.
  await prisma.chapter.update({
    where: { id: chapter.id },
    data: hasIssues ? { status: "guardian_review", guardianStatus: "needs_revision" } : { guardianStatus: "approved" },
  });
  res.json({ ok: true });
});

router.post("/admin/chapters/:id/request-revision", async (req, res) => {
  const instructions = String(req.body?.instructions ?? "").trim().slice(0, 500);
  const chapter = await prisma.chapter.findUnique({
    where: { id: req.params.id },
    include: { sources: { include: { memory: { include: { transcripts: { orderBy: { createdAt: "desc" } }, interpretation: true, contributor: true } } } } },
  });
  if (!chapter) return res.status(404).json({ error: "Not found" });

  try {
    // A rewrite takes the chapter out of the family's book until it's approved again.
    await prisma.chapter.update({ where: { id: chapter.id }, data: { status: "guardian_review" } });
    await createPagedChapter({
      storybookId: chapter.storybookId,
      existingChapterId: chapter.id,
      revisionRequest: instructions || undefined,
      memories: chapter.sources.map((s) => ({
        id: s.memory.id,
        transcript: s.memory.transcripts[0]?.text ?? "",
        events: s.memory.interpretation?.events ?? "",
        emotions: s.memory.interpretation?.emotions ?? "",
        themes: s.memory.interpretation?.themes ?? "",
        recordedBy: recordedBy(s.memory.contributor),
      })),
    });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(502).json({ error: `Couldn't rewrite the chapter: ${error?.message ?? "unknown error"}` });
  }
});

router.put("/admin/chapters/:id/approve", async (req, res) => {
  const open = await prisma.guardianFinding.count({ where: { chapterId: req.params.id, status: "needs_revision" } });
  if (open > 0) return res.status(400).json({ error: "Resolve the open findings first." });
  await prisma.chapter.update({ where: { id: req.params.id }, data: { guardianStatus: "approved", revisionRequested: false } });
  res.json({ ok: true });
});

router.put("/admin/chapters/:id/hold", async (req, res) => {
  await prisma.chapter.update({ where: { id: req.params.id }, data: { guardianStatus: "needs_revision", status: "guardian_review" } });
  res.json({ ok: true });
});

// A reviewer decides a finding isn't a problem after all (or was fixed by hand).
router.put("/admin/findings/:id", async (req, res) => {
  const status = req.body?.status === "needs_revision" ? "needs_revision" : "ok";
  const finding = await prisma.guardianFinding.update({ where: { id: req.params.id }, data: { status } });
  res.json(finding);
});

router.put("/admin/feedback/:id", async (req, res) => {
  const status = req.body?.status === "open" ? "open" : "resolved";
  const feedback = await prisma.storyFeedback.update({ where: { id: req.params.id }, data: { status } });
  res.json(feedback);
});

// --- Overview and families ---

router.get("/admin/overview", async (_req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const [families, memoriesThisWeek, chaptersThisWeek, held, openFeedback, needsAttention, failedMemories, pendingInvites, recentFeedback] = await Promise.all([
    prisma.storybook.count(),
    prisma.memory.count({ where: { recordedAt: { gte: weekAgo } } }),
    prisma.chapter.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.chapter.count({ where: { guardianStatus: "needs_revision" } }),
    prisma.storyFeedback.count({ where: { status: "open" } }),
    prisma.chapter.findMany({ where: { pagesStatus: "needs_attention" }, include: { storybook: { include: { child: true } } }, take: 10 }),
    prisma.memory.count({ where: { status: "failed" } }),
    prisma.contributor.count({ where: { inviteStatus: "pending" } }),
    prisma.storyFeedback.findMany({ where: { status: "open" }, include: { chapter: true, contributor: true }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  res.json({
    counts: { families, memoriesThisWeek, chaptersThisWeek, held, openFeedback, failedMemories, pendingInvites },
    needsAttention: needsAttention.map((c) => ({ id: c.id, title: c.title, childName: c.storybook.child.displayName })),
    recentFeedback: recentFeedback.map((f) => ({ id: f.id, chapterId: f.chapterId, chapterTitle: f.chapter.title, reason: f.reason, note: f.note, from: f.contributor.name, createdAt: f.createdAt })),
  });
});

router.get("/admin/families", async (_req, res) => {
  const storybooks = await prisma.storybook.findMany({
    include: {
      child: { include: { household: { include: { contributors: true } } } },
      _count: { select: { memories: true, chapters: true } },
      memories: { orderBy: { recordedAt: "desc" }, take: 1, select: { recordedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    storybooks.map((s) => {
      const people = s.child.household.contributors.filter((c) => c.inviteStatus !== "revoked");
      return {
        id: s.id,
        title: s.title,
        childName: s.child.displayName,
        owner: people.find((c) => c.role === "owner")?.name ?? null,
        members: people.filter((c) => c.inviteStatus === "joined").length,
        invited: people.filter((c) => c.inviteStatus === "pending").length,
        memories: s._count.memories,
        chapters: s._count.chapters,
        stage: stageInfo(effectiveStage(s)).label,
        lastMemoryAt: s.memories[0]?.recordedAt ?? null,
        createdAt: s.createdAt,
      };
    })
  );
});

export default router;
