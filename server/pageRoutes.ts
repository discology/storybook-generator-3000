import express, { Request, Response, Router } from "express";
import { prisma } from "./db";
import { getCurrentUser } from "./session";
import {
  PersonAnswer,
  approvePages,
  checkPages,
  editPageText,
  generateIllustration,
  illustrateChapter,
  parseUnresolved,
  resolvePeople,
  revisePage,
  updatePagesStatus,
} from "./storyPages";
import { approvedVariants } from "./familyCharacters";
import { DEFAULT_RULES, EMBELLISHMENT_LEVELS, IMAGE_MODELS, getActiveRules, saveRules, validateRules } from "./pageRules";

const router: Router = express.Router();

// Only members of the chapter's family can review or change its pages.
async function requireChapterAccess(req: Request, res: Response, chapterId: string) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in first" });
    return null;
  }
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { storybook: { include: { child: { include: { household: { include: { contributors: true } } } } } } },
  });
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return null;
  }
  if (!chapter.storybook.child.household.contributors.some((c) => c.userId === user.id)) {
    res.status(403).json({ error: "access_denied" });
    return null;
  }
  return chapter;
}

async function pageForRequest(req: Request, res: Response) {
  const page = await prisma.storyPage.findUnique({ where: { id: req.params.pageId } });
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return null;
  }
  return (await requireChapterAccess(req, res, page.chapterId)) ? page : null;
}

const fail = (res: Response, error: any) => res.status(502).json({ error: error?.message ?? "Something went wrong. Try again." });

export async function chapterWithPages(chapterId: string) {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: {
      findings: true,
      storybook: { include: { child: true } },
      pages: {
        orderBy: { pageNumber: "asc" },
        include: {
          assets: { orderBy: { version: "desc" } },
          appearances: {
            include: {
              familyCharacter: { select: { id: true, name: true } },
              design: { select: { id: true, variant: true, version: true, portraitPath: true, status: true } },
            },
          },
        },
      },
    },
  });
  // Names for the keys and refs pages store: the Character Library cast and the
  // chapter's family characters.
  const snapshot = JSON.parse(chapter.generationSnapshot ?? "null");
  const cast = [
    ...(snapshot?.cast ?? []).map((c: { key: string; name: string }) => ({ key: c.key, name: c.name })),
    ...(snapshot?.family ?? []).map((f: { ref: string; name: string }) => ({ key: f.ref, name: f.name })),
  ];
  // For answering "who is this?": the family's characters and their approved looks.
  const familyCharacters = await prisma.familyCharacter.findMany({
    where: { householdId: chapter.storybook.child.householdId },
    include: { designs: true },
    orderBy: { createdAt: "asc" },
  });
  const { storybook, ...rest } = chapter;
  return {
    ...rest,
    storybookId: storybook.id,
    cast,
    unresolved: parseUnresolved(chapter.unresolvedPeople),
    familyCharacters: familyCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      relationship: c.relationship,
      approvedVariants: [...approvedVariants(c.designs).keys()],
    })),
  };
}

router.get("/chapters/:id/pages", async (req, res) => {
  if (!(await requireChapterAccess(req, res, req.params.id))) return;
  res.json(await chapterWithPages(req.params.id));
});

router.put("/pages/:pageId/text", async (req, res) => {
  const page = await pageForRequest(req, res);
  if (!page) return;
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.status(400).json({ error: "The page text can't be empty." });
  try {
    await editPageText(page.id, text);
    res.json(await chapterWithPages(page.chapterId));
  } catch (error) {
    fail(res, error);
  }
});

// Regenerate or retry this page's illustration; the text is untouched. Pass
// fixCharacterIds when a family character doesn't look like their approved design.
router.post("/pages/:pageId/illustration", async (req, res) => {
  const page = await pageForRequest(req, res);
  if (!page) return;
  const generating = await prisma.pageAsset.count({ where: { pageId: page.id, status: "generating" } });
  if (generating) return res.status(409).json({ error: "This page's illustration is already being drawn." });
  const fixCharacterIds = Array.isArray(req.body?.fixCharacterIds) ? req.body.fixCharacterIds.map(String) : undefined;
  await prisma.chapter.update({ where: { id: page.chapterId }, data: { pagesStatus: "illustrating" } });
  void generateIllustration(page.id, { fixCharacterIds }).then(() => updatePagesStatus(page.chapterId));
  // Give the new "generating" version a moment to exist before responding.
  await new Promise((r) => setTimeout(r, 300));
  res.status(202).json(await chapterWithPages(page.chapterId));
});

router.post("/pages/:pageId/revise", async (req, res) => {
  const page = await pageForRequest(req, res);
  if (!page) return;
  const request = String(req.body?.instructions ?? "").trim();
  if (!request) return res.status(400).json({ error: "Say what should change on this page." });
  try {
    await revisePage(page.id, request);
    res.json(await chapterWithPages(page.chapterId));
  } catch (error) {
    fail(res, error);
  }
});

// The parent's answers to "who is this?" for people the planner couldn't identify.
router.post("/chapters/:id/people", async (req, res) => {
  if (!(await requireChapterAccess(req, res, req.params.id))) return;
  const answers = Array.isArray(req.body?.answers) ? (req.body.answers as PersonAnswer[]) : [];
  if (!answers.length) return res.status(400).json({ error: "Answer at least one question." });
  try {
    await resolvePeople(req.params.id, answers);
    res.json(await chapterWithPages(req.params.id));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/pages/:pageId/approve", async (req, res) => {
  const page = await pageForRequest(req, res);
  if (!page) return;
  try {
    await approvePages(page.chapterId, [page.id]);
    res.json(await chapterWithPages(page.chapterId));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/chapters/:id/pages/approve", async (req, res) => {
  if (!(await requireChapterAccess(req, res, req.params.id))) return;
  try {
    await approvePages(req.params.id);
    res.json(await chapterWithPages(req.params.id));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/chapters/:id/pages/recheck", async (req, res) => {
  if (!(await requireChapterAccess(req, res, req.params.id))) return;
  await checkPages(req.params.id);
  res.json(await chapterWithPages(req.params.id));
});

// Retry every page whose latest illustration failed.
router.post("/chapters/:id/pages/retry-failed", async (req, res) => {
  if (!(await requireChapterAccess(req, res, req.params.id))) return;
  const pages = await prisma.storyPage.findMany({
    where: { chapterId: req.params.id },
    include: { assets: { orderBy: { version: "desc" }, take: 1 } },
  });
  const failed = pages.filter((p) => !p.assets[0] || p.assets[0].status === "failed");
  if (failed.length === pages.length) {
    void illustrateChapter(req.params.id);
  } else {
    await prisma.chapter.update({ where: { id: req.params.id }, data: { pagesStatus: "illustrating" } });
    void Promise.all(failed.map((p) => generateIllustration(p.id))).then(() => updatePagesStatus(req.params.id));
  }
  await new Promise((r) => setTimeout(r, 300));
  res.status(202).json(await chapterWithPages(req.params.id));
});

// --- Admin: page rules ---

router.use("/admin/page-rules", async (req, res, next) => {
  if (!(await getCurrentUser(req))) return res.status(401).json({ error: "Sign in first" });
  next();
});

router.get("/admin/page-rules", async (_req, res) => {
  const active = await getActiveRules();
  const history = await prisma.generationRuleSet.findMany({ orderBy: { version: "desc" }, select: { version: true, createdAt: true } });
  const usage = await prisma.chapter.groupBy({ by: ["ruleSetVersion"], _count: true, where: { ruleSetVersion: { not: null } } });
  res.json({
    ...active,
    defaults: DEFAULT_RULES,
    embellishmentLevels: EMBELLISHMENT_LEVELS,
    imageModels: IMAGE_MODELS,
    history: history.map((h) => ({ ...h, chapters: usage.find((u) => u.ruleSetVersion === h.version)?._count ?? 0 })),
  });
});

router.put("/admin/page-rules", async (req, res) => {
  const error = validateRules(req.body?.rules);
  if (error) return res.status(400).json({ error });
  const saved = await saveRules(req.body.rules);
  res.json(saved);
});

export default router;
