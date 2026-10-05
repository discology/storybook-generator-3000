import express, { Router } from "express";
import { prisma } from "./db";
import { guardianReview } from "./aiService";
import { createPagedChapter } from "./storyPages";
import { getCurrentUser } from "./session";

const router: Router = express.Router();

// NOTE: this prototype has no separate admin role — any signed-in user can reach
// /admin. Fine for a single-operator prototype; a real role check belongs here
// before this goes further than that.
async function requireUser(req: express.Request, res: express.Response) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in first" });
    return null;
  }
  return user;
}

router.get("/admin/chapters", async (req, res) => {
  if (!(await requireUser(req, res))) return;
  const chapters = await prisma.chapter.findMany({
    include: { storybook: { include: { child: true } }, findings: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    chapters.map((c) => {
      let tab: "needs_review" | "in_revision" | "approved" = "approved";
      if (c.guardianStatus === "needs_revision") tab = c.revisionRequested ? "in_revision" : "needs_review";
      else if (c.guardianStatus !== "approved") tab = "needs_review";
      return {
        id: c.id,
        title: c.title,
        childName: c.storybook.child.displayName,
        storybookId: c.storybookId,
        status: c.status,
        guardianStatus: c.guardianStatus,
        tab,
        reasons: c.findings.filter((f) => f.status === "needs_revision").map((f) => f.category),
      };
    })
  );
});

router.get("/admin/chapters/:id", async (req, res) => {
  if (!(await requireUser(req, res))) return;
  const chapter = await prisma.chapter.findUnique({
    where: { id: req.params.id },
    include: {
      storybook: { include: { child: true } },
      findings: { orderBy: { createdAt: "desc" } },
      sources: { include: { memory: { include: { interpretation: true } } } },
    },
  });
  if (!chapter) return res.status(404).json({ error: "Not found" });
  res.json(chapter);
});

router.post("/admin/chapters/:id/run-guardian", async (req, res) => {
  if (!(await requireUser(req, res))) return;
  const chapter = await prisma.chapter.findUnique({
    where: { id: req.params.id },
    include: { storybook: { include: { chapters: { where: { status: "published" }, orderBy: { sequence: "asc" } } } } },
  });
  if (!chapter) return res.status(404).json({ error: "Not found" });

  const result = await guardianReview({
    chapterContent: chapter.content,
    readerAgeBand: chapter.storybook.readerAgeBand,
    priorChapterTitles: chapter.storybook.chapters.map((c) => c.title),
  });

  await prisma.guardianFinding.deleteMany({ where: { chapterId: chapter.id } });
  await prisma.guardianFinding.createMany({
    data: result.findings.map((f) => ({ chapterId: chapter.id, category: f.category, status: f.status, note: f.note })),
  });

  const hasIssues = result.findings.some((f) => f.status === "needs_revision");
  const updated = await prisma.chapter.update({
    where: { id: chapter.id },
    data: { status: "guardian_review", guardianStatus: hasIssues ? "needs_revision" : "not_reviewed" },
    include: { findings: true },
  });
  res.json(updated);
});

router.post("/admin/chapters/:id/request-revision", async (req, res) => {
  if (!(await requireUser(req, res))) return;
  const { instructions } = req.body ?? {};

  const chapter = await prisma.chapter.findUnique({
    where: { id: req.params.id },
    include: {
      storybook: { include: { child: true } },
      sources: { include: { memory: { include: { transcripts: true, interpretation: true } } } },
    },
  });
  if (!chapter) return res.status(404).json({ error: "Not found" });

  try {
    const updated = await createPagedChapter({
      storybookId: chapter.storybookId,
      existingChapterId: chapter.id,
      revisionRequest: instructions || undefined,
      memories: chapter.sources.map((s) => ({
        id: s.memory.id,
        transcript: s.memory.transcripts[0]?.text ?? "",
        events: s.memory.interpretation?.events ?? "",
        emotions: s.memory.interpretation?.emotions ?? "",
        themes: s.memory.interpretation?.themes ?? "",
      })),
    });
    res.json(updated);
  } catch (error: any) {
    res.status(502).json({ error: `Couldn't rewrite the chapter: ${error?.message ?? "unknown error"}` });
  }
});

router.put("/admin/chapters/:id/approve", async (req, res) => {
  if (!(await requireUser(req, res))) return;
  const openFindings = await prisma.guardianFinding.count({
    where: { chapterId: req.params.id, status: "needs_revision" },
  });
  if (openFindings > 0) {
    return res.status(400).json({ error: "Resolve open findings before approving." });
  }
  const chapter = await prisma.chapter.update({
    where: { id: req.params.id },
    data: { guardianStatus: "approved", revisionRequested: false },
  });
  res.json(chapter);
});

router.put("/admin/chapters/:id/hold", async (req, res) => {
  if (!(await requireUser(req, res))) return;
  const chapter = await prisma.chapter.update({
    where: { id: req.params.id },
    data: { guardianStatus: "needs_revision" },
  });
  res.json(chapter);
});

export default router;
