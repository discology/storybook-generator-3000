import path from "path";
import { Router, type Response } from "express";
import { prisma } from "./db";
import { isAdmin } from "./admin";
import { appUrl } from "./messageTemplates";
import { isAiConfigured, runAiStep } from "./aiService";
import { CARD_LINE_KEY } from "./aiInstructions";
import { chapterLesson } from "./teachers";

// The landing page's "Stories from other families" (VSB-141): chapters from the
// team's sample family, each with a card and a public link anyone can read.
// Only a family owned by someone on the Vambie team can be the sample family
// (VSB-150: its other members needn't be, so the team's own family books work),
// only chapters the team features are public, and every public read checks the
// chapter still belongs to it.

export const STORY_COLORS = ["yellow", "green", "blue", "purple"] as const;

const router = Router();

const withPictures = { pages: { orderBy: { pageNumber: "asc" as const }, include: { assets: { where: { status: "ready" }, orderBy: { version: "desc" as const }, take: 1 } } } };

// The first page with a picture is the card's cover.
const coverPage = (pages: { pageNumber: number; assets: { imagePath: string | null }[] }[]) => pages.find((p) => p.assets[0]?.imagePath)?.pageNumber ?? null;
const pictureUrl = (slug: string, pageNumber: number) => `api/public/stories/${slug}/pictures/${pageNumber}`;

// A family can be the sample family when its owner is on the Vambie team (VSB-150).
async function sampleCandidates() {
  const households = await prisma.household.findMany({
    where: { guestToken: null },
    include: { contributors: { where: { inviteStatus: "joined" }, include: { user: true } }, children: { include: { storybooks: { select: { title: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return households.filter((h) => h.contributors.some((c) => c.role === "owner" && c.user && isAdmin(c.user)));
}

const familyLabel = (h: { name: string | null; children: { displayName: string; storybooks: { title: string }[] }[] }) =>
  h.name || h.children[0]?.storybooks[0]?.title || h.children[0]?.displayName || "Unnamed family";

function slugFor(title: string, taken: string[]) {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "story";
  let slug = base;
  for (let n = 2; taken.includes(slug); n++) slug = `${base}-${n}`;
  return slug;
}

function readCard(body: any, partial = false): { title?: string; blurb?: string; color?: string; enabled?: boolean } | string {
  const card: { title?: string; blurb?: string; color?: string; enabled?: boolean } = {};
  if (body?.title !== undefined || !partial) {
    card.title = String(body?.title ?? "").trim().slice(0, 60);
    if (!card.title) return "Give the card a title.";
  }
  if (body?.blurb !== undefined) card.blurb = String(body.blurb).trim().slice(0, 200);
  if (body?.color !== undefined) {
    if (!STORY_COLORS.includes(body.color)) return "Pick one of the card colors.";
    card.color = body.color;
  }
  if (body?.enabled !== undefined) card.enabled = Boolean(body.enabled);
  return card;
}

// The card's one line, "Baby Vambie learns…", written from the story (VSB-151).
// Null without AI or when it fails: the admin writes it instead.
async function writeCardLine(chapterId: string): Promise<string | null> {
  if (!isAiConfigured()) return null;
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, include: { pages: { orderBy: { pageNumber: "asc" } } } });
  if (!chapter) return null;
  try {
    const { output } = await runAiStep(
      CARD_LINE_KEY,
      {
        story: [`Title: ${chapter.title}`, ...chapter.pages.filter((p) => p.text).map((p) => `Page ${p.pageNumber}: ${p.text}`)].join("\n"),
        lesson: chapterLesson(chapter.generationSnapshot)?.forGrownUps ?? "",
      },
      undefined,
      [],
      { chapterId }
    );
    const line = typeof output?.line === "string" ? output.line.trim().replace(/^["“]|["”]$/g, "").slice(0, 200) : "";
    return line || null;
  } catch (error: any) {
    console.error(`Card line failed for chapter ${chapterId}:`, error?.message ?? error);
    return null;
  }
}

// --- Admin, Featured stories ---

router.get("/admin/featured", async (_req, res) => {
  const candidates = await sampleCandidates();
  const sample = await prisma.household.findFirst({ where: { isSample: true }, include: { children: { include: { storybooks: { select: { title: true } } } } } });
  const chapters = sample
    ? await prisma.chapter.findMany({
        where: { status: "published", storybook: { child: { householdId: sample.id } } },
        include: { ...withPictures, featured: true, storybook: { select: { title: true } } },
        orderBy: [{ storybookId: "asc" }, { sequence: "asc" }],
      })
    : [];
  const featured = await prisma.featuredStory.findMany({ orderBy: { sortOrder: "asc" }, include: { chapter: { include: withPictures } } });
  res.json({
    sampleFamily: sample ? { id: sample.id, label: familyLabel(sample) } : null,
    candidates: candidates.map((h) => ({ id: h.id, label: familyLabel(h) })),
    chapters: chapters.map((c) => {
      const cover = coverPage(c.pages);
      return { id: c.id, title: c.title, sequence: c.sequence, storybookTitle: c.storybook.title, featured: Boolean(c.featured), cover: cover ? c.pages.find((p) => p.pageNumber === cover)!.assets[0].imagePath : null };
    }),
    featured: featured.map((f) => {
      const cover = coverPage(f.chapter.pages);
      return {
        id: f.id,
        slug: f.slug,
        title: f.title,
        blurb: f.blurb,
        color: f.color,
        enabled: f.enabled,
        chapterTitle: f.chapter.title,
        cover: cover ? f.chapter.pages.find((p) => p.pageNumber === cover)!.assets[0].imagePath : null,
        url: appUrl(`/stories/${f.slug}`),
      };
    }),
    colors: STORY_COLORS,
    publicList: appUrl("/api/public/stories"),
  });
});

// Choosing another sample family removes the old one's featured stories.
router.put("/admin/featured/sample-family", async (req, res) => {
  const id = req.body?.householdId ? String(req.body.householdId) : null;
  if (id && !(await sampleCandidates()).some((h) => h.id === id)) {
    return res.status(400).json({ error: "Only a family owned by someone on the Vambie team can be the sample family." });
  }
  await prisma.$transaction([
    prisma.household.updateMany({ where: { isSample: true, ...(id ? { id: { not: id } } : {}) }, data: { isSample: false } }),
    ...(id ? [prisma.household.update({ where: { id }, data: { isSample: true } })] : []),
    prisma.featuredStory.deleteMany({ where: id ? { chapter: { storybook: { child: { householdId: { not: id } } } } } : {} }),
  ]);
  res.json({ ok: true });
});

router.post("/admin/featured", async (req, res) => {
  const chapter = await prisma.chapter.findUnique({ where: { id: String(req.body?.chapterId ?? "") }, include: { featured: true, storybook: { include: { child: { include: { household: true } } } } } });
  if (!chapter || chapter.status !== "published" || !chapter.storybook.child.household.isSample) {
    return res.status(400).json({ error: "Only the sample family's chapters can be featured." });
  }
  if (chapter.featured) return res.status(409).json({ error: "This chapter is already featured." });
  const card = readCard({ title: chapter.title, ...req.body });
  if (typeof card === "string") return res.status(400).json({ error: card });
  const all = await prisma.featuredStory.findMany({ select: { slug: true, sortOrder: true } });
  const created = await prisma.featuredStory.create({
    data: {
      chapterId: chapter.id,
      slug: slugFor(card.title!, all.map((f) => f.slug)),
      title: card.title!,
      blurb: card.blurb ?? (await writeCardLine(chapter.id)) ?? "",
      color: card.color ?? STORY_COLORS[all.length % STORY_COLORS.length],
      sortOrder: Math.max(0, ...all.map((f) => f.sortOrder + 1)),
    },
  });
  res.status(201).json(created);
});

// The link follows the card's title (the landing page picks up the new one).
router.put("/admin/featured/:id", async (req, res) => {
  const card = readCard(req.body, true);
  if (typeof card === "string") return res.status(400).json({ error: card });
  const story = await prisma.featuredStory.findUnique({ where: { id: req.params.id } });
  if (!story) return res.status(404).json({ error: "That featured story is gone." });
  const others = await prisma.featuredStory.findMany({ where: { id: { not: story.id } }, select: { slug: true } });
  const slug = card.title && card.title !== story.title ? slugFor(card.title, others.map((f) => f.slug)) : story.slug;
  res.json(await prisma.featuredStory.update({ where: { id: story.id }, data: { ...card, slug } }));
});

// "Write another": a fresh card line from the story (VSB-151).
router.post("/admin/featured/:id/card-line", async (req, res) => {
  const story = await prisma.featuredStory.findUnique({ where: { id: req.params.id } });
  if (!story) return res.status(404).json({ error: "That featured story is gone." });
  const line = await writeCardLine(story.chapterId);
  if (!line) return res.status(502).json({ error: "Couldn't write a line just now. Try again, or write one." });
  res.json(await prisma.featuredStory.update({ where: { id: story.id }, data: { blurb: line } }));
});

router.put("/admin/featured-order", async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  await prisma.$transaction(ids.map((id, i) => prisma.featuredStory.updateMany({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

router.delete("/admin/featured/:id", async (req, res) => {
  await prisma.featuredStory.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// --- Public: the landing page's list, and the story itself ---

// Anyone may read these, from any site: they hold nothing private.
const open = (res: Response) => res.set("Access-Control-Allow-Origin", "*");

const showable = { enabled: true, chapter: { status: "published", storybook: { child: { household: { isSample: true } } } } };

router.get("/public/stories", async (_req, res) => {
  const stories = await prisma.featuredStory.findMany({ where: showable, orderBy: { sortOrder: "asc" }, include: { chapter: { include: withPictures } } });
  open(res).set("Cache-Control", "public, max-age=300");
  res.json({
    stories: stories.map((f) => {
      const cover = coverPage(f.chapter.pages);
      return { slug: f.slug, title: f.title, blurb: f.blurb, color: f.color, cover: cover ? appUrl(`/${pictureUrl(f.slug, cover)}`) : null, url: appUrl(`/stories/${f.slug}`) };
    }),
  });
});

const findStory = (slug: string) => prisma.featuredStory.findFirst({ where: { slug, ...showable }, include: { chapter: { include: withPictures } } });

// What the reader shows: the pages and their pictures. No family details.
router.get("/public/stories/:slug", async (req, res) => {
  const story = await findStory(req.params.slug);
  open(res);
  if (!story) return res.status(404).json({ error: "This story isn't available." });
  res.json({
    slug: story.slug,
    title: story.title, // the card's title, as on the landing page
    pages: story.chapter.pages.map((p) => ({
      id: p.id,
      pageNumber: p.pageNumber,
      text: p.text,
      pictureSize: p.pictureSize,
      visibleAction: p.visibleAction,
      image: p.assets[0]?.imagePath ? pictureUrl(story.slug, p.pageNumber) : null,
    })),
  });
});

// Page pictures stay private under /uploads; a featured story's are served here.
router.get("/public/stories/:slug/pictures/:pageNumber", async (req, res) => {
  const story = await findStory(req.params.slug);
  const image = story?.chapter.pages.find((p) => p.pageNumber === Number(req.params.pageNumber))?.assets[0]?.imagePath;
  if (!image) return res.status(404).end();
  open(res).set("Cache-Control", "public, max-age=3600");
  res.sendFile(path.join(process.cwd(), image));
});

export default router;
