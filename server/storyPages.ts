import fs from "fs";
import path from "path";
import OpenAI, { toFile } from "openai";
import { prisma } from "./db";
import { runAiStep, isAiConfigured, guardianReview } from "./aiService";
import { getAiInstruction } from "./aiInstructions";
import {
  EMBELLISHMENT_LEVELS,
  PageRules,
  ReadingProfile,
  checkPageLimits,
  describeProfile,
  getActiveRules,
  profileFor,
} from "./pageRules";

// Turns approved memories into a chapter of planned, checked and illustrated
// pages. Each chapter stores a snapshot of the rules it was generated with, and
// every later check or illustration of that chapter uses the snapshot, so rule
// changes in the admin panel never alter existing books.

const PAGES_DIR = path.join(process.cwd(), "uploads", "pages");
const ILLUSTRATION_CONCURRENCY = 3;

export interface SourceMemory {
  id: string;
  transcript: string;
  events: string;
  emotions: string;
  themes: string;
}

interface CharacterSheetEntry {
  name: string;
  appearance: string;
}

interface GenerationSnapshot {
  ruleSetVersion: number;
  rules: PageRules;
  readerAgeBand: string;
  readingProfile: ReadingProfile;
  instructions: Record<string, string>;
}

interface Shot {
  type: string;
  angle: string;
  focus: string;
}

interface PlannedPage {
  storyMoment: string;
  characters: string[];
  setting: string;
  visibleAction: string;
  emotionalTone: string;
  continuity: string;
  shot: Shot | null;
  text: string;
  sourceMemory?: number;
  sourceQuote?: string;
  interpretationNote: string;
}

// --- Formatting helpers for AI variables ---

export const formatMemories = (memories: SourceMemory[]) =>
  memories
    .map(
      (m, i) =>
        `Memory ${i + 1}:\nWhat happened: ${m.events}\nEmotions present: ${m.emotions}\nPossible themes: ${m.themes}\nOriginal account: "${m.transcript}"`
    )
    .join("\n\n");

const formatCharacters = (sheet: CharacterSheetEntry[]) => sheet.map((c) => `${c.name}: ${c.appearance}`).join("\n");

type PageRow = Awaited<ReturnType<typeof prisma.storyPage.findMany>>[number];

const parseShot = (json: string | null): Shot | null => {
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
};

const describeShot = (shot: Shot | null) =>
  shot ? `${shot.type}${shot.angle ? `, ${shot.angle}` : ""}${shot.focus ? `. Focus: ${shot.focus}` : ""}` : "";

const formatPage = (p: PageRow) =>
  `Page ${p.pageNumber}\nStory moment: ${p.storyMoment}\nCharacters: ${JSON.parse(p.characters).join(", ")}\nSetting: ${p.setting}\nVisible action: ${p.visibleAction}\nEmotional tone: ${p.emotionalTone}\nContinuity: ${p.continuity}\nShot: ${describeShot(parseShot(p.shot)) || "(none)"}\nText: "${p.text}"\nInterpretation: ${p.interpretationNote}`;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function normalizePage(raw: any): PlannedPage {
  return {
    storyMoment: str(raw?.storyMoment),
    characters: Array.isArray(raw?.characters) ? raw.characters.map(str).filter(Boolean) : [],
    setting: str(raw?.setting),
    visibleAction: str(raw?.visibleAction),
    emotionalTone: str(raw?.emotionalTone),
    continuity: str(raw?.continuity),
    shot: raw?.shot && str(raw.shot.type) ? { type: str(raw.shot.type), angle: str(raw.shot.angle), focus: str(raw.shot.focus) } : null,
    text: str(raw?.text),
    sourceMemory: Number.isInteger(raw?.sourceMemory) ? raw.sourceMemory : undefined,
    sourceQuote: str(raw?.sourceQuote),
    interpretationNote: str(raw?.interpretationNote),
  };
}

const pageData = (page: PlannedPage, memories: SourceMemory[]) => ({
  storyMoment: page.storyMoment,
  characters: JSON.stringify(page.characters),
  setting: page.setting,
  visibleAction: page.visibleAction,
  emotionalTone: page.emotionalTone,
  continuity: page.continuity,
  shot: page.shot ? JSON.stringify(page.shot) : null,
  text: page.text,
  interpretationNote: page.interpretationNote,
  sourceMemoryId: memories[(page.sourceMemory ?? 1) - 1]?.id ?? memories[0]?.id ?? null,
  sourceQuote: page.sourceQuote || null,
});

// --- Loading a chapter with everything generation needs ---

async function loadChapter(chapterId: string) {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: {
      storybook: { include: { child: true } },
      sources: { include: { memory: { include: { transcripts: { orderBy: { createdAt: "desc" }, take: 1 }, interpretation: true } } } },
      pages: { orderBy: { pageNumber: "asc" } },
    },
  });
  const snapshot = JSON.parse(chapter.generationSnapshot ?? "null") as GenerationSnapshot | null;
  const characterSheet = JSON.parse(chapter.characterSheet ?? "[]") as CharacterSheetEntry[];
  const memories: SourceMemory[] = chapter.sources.map((s) => ({
    id: s.memory.id,
    transcript: s.memory.transcripts[0]?.text ?? "",
    events: s.memory.interpretation?.events ?? "",
    emotions: s.memory.interpretation?.emotions ?? "",
    themes: s.memory.interpretation?.themes ?? "",
  }));
  return { chapter, snapshot, characterSheet, memories };
}

const embellishmentRule = (rules: PageRules) => EMBELLISHMENT_LEVELS[rules.embellishment].rule;

// --- Planning ---

function mockPlan(childName: string, memories: SourceMemory[], profile: ReadingProfile) {
  const event = memories[0]?.events || "something happened today";
  const pages: PlannedPage[] = Array.from({ length: profile.pagesMin }, (_, i) => ({
    storyMoment: i === 0 ? `Opening: ${event}` : `Placeholder moment ${i + 1}`,
    characters: ["Baby Vambie"],
    setting: "Placeholder setting",
    visibleAction: "Baby Vambie sits quietly, curious about how it felt.",
    emotionalTone: "Calm",
    continuity: "",
    shot: null,
    text: i === 0 ? `(Placeholder) ${childName} had a day. Baby Vambie sat close.` : `(Placeholder page ${i + 1}.)`,
    sourceMemory: 1,
    sourceQuote: "",
    interpretationNote: "Placeholder text: no AI provider is configured.",
  }));
  return {
    title: "Untitled (no AI provider configured)",
    characters: [{ name: "Baby Vambie", appearance: "small round teal-blue creature" }],
    pages,
  };
}

export interface CreateChapterInput {
  storybookId: string;
  memories: SourceMemory[];
  existingChapterId?: string; // replace this chapter's pages (full rewrite)
  revisionRequest?: string;
}

// Plans the pages, saves them with a rule snapshot, runs page checks and the
// Guardian, then starts illustrating in the background.
export async function createPagedChapter(input: CreateChapterInput) {
  const storybook = await prisma.storybook.findUniqueOrThrow({
    where: { id: input.storybookId },
    include: { child: true, chapters: { orderBy: { sequence: "asc" } } },
  });
  const existing = input.existingChapterId ? storybook.chapters.find((c) => c.id === input.existingChapterId) : null;
  const priorChapters = storybook.chapters.filter((c) => c.status === "published" && c.id !== existing?.id);

  // A full rewrite keeps the chapter's original rule snapshot.
  const previousSnapshot = existing?.generationSnapshot ? (JSON.parse(existing.generationSnapshot) as GenerationSnapshot) : null;
  let snapshot: GenerationSnapshot;
  if (previousSnapshot) {
    snapshot = previousSnapshot;
  } else {
    const active = await getActiveRules();
    const instructions: Record<string, string> = {};
    for (const key of ["page_plan", "page_check", "page_revise", "illustration_check"]) {
      instructions[key] = (await getAiInstruction(key)).body;
    }
    snapshot = {
      ruleSetVersion: active.version,
      rules: active.rules,
      readerAgeBand: storybook.readerAgeBand,
      readingProfile: profileFor(active.rules, storybook.readerAgeBand),
      instructions,
    };
  }
  const profile = snapshot.readingProfile;

  let plan: { title: string; characters: CharacterSheetEntry[]; pages: PlannedPage[] };
  let isMock = false;
  if (!isAiConfigured()) {
    plan = mockPlan(storybook.child.displayName, input.memories, profile);
    isMock = true;
  } else {
    const { output } = await runAiStep(
      "page_plan",
      {
        child_name: storybook.child.displayName,
        reading_level: describeProfile(profile),
        embellishment_rules: embellishmentRule(snapshot.rules),
        memories: formatMemories(input.memories),
        previous_chapters: priorChapters.map((c) => c.title).join(", ") || "(none yet — this is the first chapter)",
        revision_request: input.revisionRequest ? `A reviewer asked for this revision: "${input.revisionRequest}"` : "",
      },
      { body: snapshot.instructions.page_plan }
    );
    const pages = Array.isArray(output?.pages) ? output.pages.map(normalizePage).filter((p: PlannedPage) => p.text) : [];
    if (pages.length === 0) throw new Error("The AI returned no pages. Try again.");
    plan = {
      title: str(output.title) || `Chapter ${existing?.sequence ?? storybook.chapters.length + 1}`,
      characters: Array.isArray(output.characters)
        ? output.characters.map((c: any) => ({ name: str(c?.name), appearance: str(c?.appearance) })).filter((c: CharacterSheetEntry) => c.name)
        : [],
      pages,
    };
  }

  const content = plan.pages.map((p) => p.text).join("\n\n");
  const chapterData = {
    title: plan.title,
    content,
    isMock,
    ruleSetVersion: snapshot.ruleSetVersion,
    generationSnapshot: JSON.stringify(snapshot),
    characterSheet: JSON.stringify(plan.characters),
    characterSheetImage: null,
    pagesStatus: "illustrating",
  };

  let chapterId: string;
  if (existing) {
    await prisma.storyPage.deleteMany({ where: { chapterId: existing.id } });
    await prisma.guardianFinding.deleteMany({ where: { chapterId: existing.id } });
    await prisma.chapter.update({ where: { id: existing.id }, data: { ...chapterData, revisionRequested: true } });
    chapterId = existing.id;
  } else {
    const created = await prisma.chapter.create({
      data: {
        ...chapterData,
        storybookId: storybook.id,
        sequence: storybook.chapters.length + 1,
        status: "guardian_review",
        sources: { create: input.memories.map((m) => ({ memoryId: m.id })) },
      },
    });
    chapterId = created.id;
  }

  await prisma.storyPage.createMany({
    data: plan.pages.map((p, i) => ({ chapterId, pageNumber: i + 1, ...pageData(p, input.memories) })),
  });

  await checkPages(chapterId);
  await runGuardian(chapterId);
  void illustrateChapter(chapterId);
  return prisma.chapter.findUniqueOrThrow({ where: { id: chapterId }, include: { sources: true, findings: true } });
}

async function runGuardian(chapterId: string) {
  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId }, include: { storybook: { include: { chapters: true } } } });
  const review = await guardianReview({
    chapterContent: chapter.content,
    readerAgeBand: chapter.storybook.readerAgeBand,
    priorChapterTitles: chapter.storybook.chapters.filter((c) => c.status === "published" && c.id !== chapterId).map((c) => c.title),
  });
  await prisma.guardianFinding.deleteMany({ where: { chapterId } });
  await prisma.guardianFinding.createMany({
    data: review.findings.map((f) => ({ chapterId, category: f.category, status: f.status, note: f.note })),
  });
  const hasIssues = review.findings.some((f) => f.status === "needs_revision");
  await prisma.chapter.update({ where: { id: chapterId }, data: { guardianStatus: hasIssues ? "needs_revision" : "approved" } });
}

// --- Checks ---

// Reading-limit checks run in code on every requested page; the AI then checks
// source fidelity, continuity and scene/text alignment. Pass page numbers to
// check only those (e.g. an edited page and its neighbors).
export async function checkPages(chapterId: string, pageNumbers?: number[]) {
  const { chapter, snapshot, characterSheet, memories } = await loadChapter(chapterId);
  if (!snapshot) return;
  const profile = snapshot.readingProfile;
  const targets = chapter.pages.filter((p) => !pageNumbers || pageNumbers.includes(p.pageNumber));
  if (targets.length === 0) return;

  const notes = new Map<number, string[]>(targets.map((p) => [p.pageNumber, checkPageLimits(p.text, profile)]));
  // Back-to-back pages with the same shot type read as the same picture twice.
  for (const page of targets) {
    const shot = parseShot(page.shot);
    const before = parseShot(chapter.pages.find((p) => p.pageNumber === page.pageNumber - 1)?.shot ?? null);
    if (shot && before && shot.type.toLowerCase() === before.type.toLowerCase()) {
      notes.get(page.pageNumber)?.push(`Same shot type (${shot.type}) as page ${page.pageNumber - 1}; vary the framing.`);
    }
  }

  const count = chapter.pages.length;
  if (count < profile.pagesMin || count > profile.pagesMax) {
    notes.get(1)?.push(`The chapter has ${count} pages; this reading level calls for ${profile.pagesMin}-${profile.pagesMax}.`);
  }

  if (isAiConfigured() && !chapter.isMock) {
    try {
      const { output } = await runAiStep(
        "page_check",
        {
          child_name: chapter.storybook.child.displayName,
          reading_level: describeProfile(profile),
          embellishment_rules: embellishmentRule(snapshot.rules),
          memories: formatMemories(memories),
          characters: formatCharacters(characterSheet),
          pages: chapter.pages.map(formatPage).join("\n\n"),
          pages_to_check: targets.map((p) => p.pageNumber).join(", "),
        },
        { body: snapshot.instructions.page_check }
      );
      for (const result of Array.isArray(output?.pages) ? output.pages : []) {
        if (result?.status === "flagged" && str(result.note)) notes.get(Number(result.pageNumber))?.push(str(result.note));
      }
    } catch (error: any) {
      for (const list of notes.values()) list.push(`The automatic check couldn't run (${error?.message ?? "unknown error"}). Read this page carefully.`);
    }
  }

  for (const page of targets) {
    const list = notes.get(page.pageNumber) ?? [];
    await prisma.storyPage.update({
      where: { id: page.id },
      data: { checkStatus: list.length ? "flagged" : "ok", checkNotes: JSON.stringify(list) },
    });
  }
}

// --- Page edits ---

async function syncChapterContent(chapterId: string) {
  const pages = await prisma.storyPage.findMany({ where: { chapterId }, orderBy: { pageNumber: "asc" } });
  await prisma.chapter.update({
    where: { id: chapterId },
    data: { content: pages.map((p) => p.text).join("\n\n"), guardianStatus: "not_reviewed", status: "guardian_review" },
  });
}

// Keeps the illustration; rechecks the page and re-runs the Guardian.
export async function editPageText(pageId: string, text: string) {
  const page = await prisma.storyPage.update({ where: { id: pageId }, data: { text, approvedAt: null } });
  await syncChapterContent(page.chapterId);
  await checkPages(page.chapterId, [page.pageNumber]);
  await runGuardian(page.chapterId);
}

// Rewrites one page's story moment, rechecks its neighbors for continuity and
// redraws its illustration.
export async function revisePage(pageId: string, request: string) {
  const target = await prisma.storyPage.findUniqueOrThrow({ where: { id: pageId } });
  const { chapter, snapshot, characterSheet, memories } = await loadChapter(target.chapterId);
  if (!snapshot) throw new Error("This chapter wasn't generated with page rules.");
  if (!isAiConfigured()) throw new Error("No AI provider configured.");
  const neighbor = (n: number) => {
    const p = chapter.pages.find((x) => x.pageNumber === n);
    return p ? `Page ${n}: ${p.storyMoment} Text: "${p.text}"` : "(none)";
  };

  const { output } = await runAiStep(
    "page_revise",
    {
      reading_level: describeProfile(snapshot.readingProfile),
      embellishment_rules: embellishmentRule(snapshot.rules),
      memories: formatMemories(memories),
      characters: formatCharacters(characterSheet),
      page_number: String(target.pageNumber),
      current_page: formatPage(target),
      previous_page: neighbor(target.pageNumber - 1),
      next_page: neighbor(target.pageNumber + 1),
      revision_request: request,
    },
    { body: snapshot.instructions.page_revise }
  );
  const revised = normalizePage(output);
  if (!revised.text) throw new Error("The AI returned an empty page. Try again.");

  await prisma.storyPage.update({ where: { id: pageId }, data: { ...pageData(revised, memories), approvedAt: null } });
  // Neighbors may need adjusting after this change, so they lose approval too.
  await prisma.storyPage.updateMany({
    where: { chapterId: chapter.id, pageNumber: { in: [target.pageNumber - 1, target.pageNumber + 1] } },
    data: { approvedAt: null },
  });
  await syncChapterContent(chapter.id);
  await checkPages(chapter.id, [target.pageNumber - 1, target.pageNumber, target.pageNumber + 1]);
  await runGuardian(chapter.id);
  void generateIllustration(pageId).then(() => updatePagesStatus(chapter.id));
}

export async function approvePages(chapterId: string, pageIds?: string[]) {
  const pages = await prisma.storyPage.findMany({
    where: { chapterId, ...(pageIds ? { id: { in: pageIds } } : {}) },
    include: { assets: { where: { status: "ready" }, take: 1 } },
  });
  const missing = pages.filter((p) => p.assets.length === 0).map((p) => p.pageNumber);
  if (missing.length) throw new Error(`Page ${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no illustration yet.`);
  await prisma.storyPage.updateMany({ where: { id: { in: pages.map((p) => p.id) } }, data: { approvedAt: new Date() } });
}

// --- Illustrations ---

let openaiClient: OpenAI | null = null;
const getOpenAI = () => {
  if (!process.env.OPENAI_API_KEY) return null;
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
};

type ReferenceKind = "character_sheet" | "page" | null;

const REFERENCE_INSTRUCTIONS: Record<Exclude<ReferenceKind, null>, string> = {
  character_sheet:
    "The attached image is this book's character reference sheet. Use it ONLY for how the characters look (body shape, colors, outfits) and for the art style. Do not copy its layout, poses or plain background: paint a completely new, fully detailed scene framed as described.",
  page: "The attached image is an earlier page of this same book: draw the characters, outfits and art style as they appear there, in a new scene.",
};

const describeCharacters = (names: string[], sheet: CharacterSheetEntry[]) =>
  names.map((name) => {
    const entry = sheet.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return entry ? `${entry.name}: ${entry.appearance}` : name;
  });

function buildImagePrompt(page: PageRow, sheet: CharacterSheetEntry[], rules: PageRules, reference: ReferenceKind) {
  const shot = parseShot(page.shot);
  return [
    shot ? `Camera: ${describeShot(shot)}.` : "",
    rules.illustrationStyle,
    rules.babyVambieAppearance,
    rules.peopleStyle,
    reference ? REFERENCE_INSTRUCTIONS[reference] : "",
    `Characters in this scene (draw no one else):\n${describeCharacters(JSON.parse(page.characters), sheet).join("\n") || "Baby Vambie"}`,
    `Setting: ${page.setting}`,
    `Show: ${page.visibleAction}`,
    `Mood: ${page.emotionalTone}`,
    page.continuity ? `Keep consistent: ${page.continuity}` : "",
    "Do not include any text, letters or words in the image.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildCharacterSheetPrompt(sheet: CharacterSheetEntry[], rules: PageRules) {
  return [
    rules.illustrationStyle,
    rules.babyVambieAppearance,
    rules.peopleStyle,
    "A character reference sheet for a picture book: show each character below exactly once, full body, standing side by side in a relaxed neutral pose and facing the viewer, on a plain warm-cream background. No scenery, no props, no labels.",
    `Characters:\n${sheet.map((c) => `${c.name}: ${c.appearance}`).join("\n") || "Baby Vambie"}`,
    "Do not include any text, letters or words in the image.",
  ].join("\n\n");
}

const saveImage = (b64: string, fileName: string) => {
  fs.mkdirSync(PAGES_DIR, { recursive: true });
  const imagePath = path.join("uploads", "pages", fileName);
  fs.writeFileSync(path.join(process.cwd(), imagePath), Buffer.from(b64, "base64"));
  return imagePath;
};

// One plain reference picture of the chapter's characters. Pages use it for how
// characters look without inheriting a scene's camera, layout or background.
export async function generateCharacterSheet(chapterId: string): Promise<string | null> {
  const { snapshot, characterSheet } = await loadChapter(chapterId);
  const client = getOpenAI();
  if (!snapshot || !client) return null;
  try {
    const response = await client.images.generate({
      model: snapshot.rules.imageModel,
      prompt: buildCharacterSheetPrompt(characterSheet, snapshot.rules),
      size: "1536x1024",
      quality: snapshot.rules.imageQuality,
      output_format: "jpeg",
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("The image service returned no image.");
    const imagePath = saveImage(b64, `${chapterId}-characters-${Date.now()}.jpg`);
    await prisma.chapter.update({ where: { id: chapterId }, data: { characterSheetImage: imagePath } });
    return imagePath;
  } catch (error: any) {
    console.error(`Character sheet failed for chapter ${chapterId}:`, error?.message);
    return null;
  }
}

async function latestReadyAsset(pageId: string) {
  return prisma.pageAsset.findFirst({ where: { pageId, status: "ready" }, orderBy: { version: "desc" } });
}

// Generates a new illustration version for one page. Never touches the text.
export async function generateIllustration(pageId: string, referencePageId?: string) {
  const page = await prisma.storyPage.findUniqueOrThrow({ where: { id: pageId } });
  const { chapter, snapshot, characterSheet } = await loadChapter(page.chapterId);
  const rules = snapshot?.rules;
  // Reference: the chapter's character sheet. Chapters made before character
  // sheets existed keep using page 1's illustration, so their pages still match.
  let referencePath: string | null = null;
  let referenceKind: ReferenceKind = null;
  if (chapter.characterSheetImage && !referencePageId) {
    referencePath = chapter.characterSheetImage;
    referenceKind = "character_sheet";
  } else {
    const firstPage = chapter.pages.find((p) => p.pageNumber === 1);
    const pageRef = await latestReadyAsset(referencePageId ?? (page.pageNumber === 1 ? "" : firstPage?.id ?? ""));
    if (pageRef?.imagePath) {
      referencePath = pageRef.imagePath;
      referenceKind = "page";
    }
  }
  const prompt = rules ? buildImagePrompt(page, characterSheet, rules, referenceKind) : "";

  const last = await prisma.pageAsset.findFirst({ where: { pageId }, orderBy: { version: "desc" } });
  const asset = await prisma.pageAsset.create({
    data: { pageId, version: (last?.version ?? 0) + 1, status: "generating", prompt, model: rules?.imageModel },
  });

  const fail = (error: string) => prisma.pageAsset.update({ where: { id: asset.id }, data: { status: "failed", error } });
  const client = getOpenAI();
  if (!rules) return fail("This chapter wasn't generated with page rules.");
  if (!client) return fail("Illustrations need an OpenAI API key (OPENAI_API_KEY).");

  try {
    const common = { model: rules.imageModel, prompt, size: "1536x1024", quality: rules.imageQuality, output_format: "jpeg" as const };
    const response = referencePath
      ? await client.images.edit({
          ...common,
          image: await toFile(fs.createReadStream(path.join(process.cwd(), referencePath)), "reference.jpg", { type: "image/jpeg" }),
        })
      : await client.images.generate(common);
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("The image service returned no image.");
    const imagePath = saveImage(b64, `${pageId}-v${asset.version}.jpg`);
    await prisma.pageAsset.update({ where: { id: asset.id }, data: { status: "ready", imagePath } });
    await prisma.storyPage.update({ where: { id: pageId }, data: { approvedAt: null } });
    await checkIllustration(asset.id);
  } catch (error: any) {
    console.error(`Illustration failed for page ${pageId}:`, error?.message);
    await fail(error?.message ?? "Illustration failed.");
  }
}

async function checkIllustration(assetId: string) {
  const asset = await prisma.pageAsset.findUniqueOrThrow({ where: { id: assetId }, include: { page: true } });
  if (!asset.imagePath) return;
  const { snapshot, characterSheet } = await loadChapter(asset.page.chapterId);
  const onPage = JSON.parse(asset.page.characters) as string[];
  try {
    const image = fs.readFileSync(path.join(process.cwd(), asset.imagePath)).toString("base64");
    const { output } = await runAiStep(
      "illustration_check",
      {
        page_text: asset.page.text,
        visible_action: asset.page.visibleAction,
        characters: formatCharacters(characterSheet.filter((c) => onPage.some((n) => n.toLowerCase() === c.name.toLowerCase()))),
      },
      snapshot ? { body: snapshot.instructions.illustration_check } : undefined,
      `data:image/jpeg;base64,${image}`
    );
    const flagged = output?.status === "flagged";
    await prisma.pageAsset.update({
      where: { id: assetId },
      data: { checkStatus: flagged ? "flagged" : "ok", checkNote: flagged ? str(output.note) || "Doesn't match the page." : null },
    });
  } catch (error: any) {
    await prisma.pageAsset.update({
      where: { id: assetId },
      data: { checkStatus: "flagged", checkNote: `The automatic check couldn't run (${error?.message ?? "unknown error"}). Look at this picture carefully.` },
    });
  }
}

export async function updatePagesStatus(chapterId: string) {
  const pages = await prisma.storyPage.findMany({
    where: { chapterId },
    include: { assets: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (pages.length === 0) return;
  // Call this once nothing more is queued: a page with no illustration then needs a retry.
  const latest = pages.map((p) => p.assets[0]?.status);
  const status = latest.some((s) => s === "generating")
    ? "illustrating"
    : latest.some((s) => s !== "ready")
      ? "needs_attention"
      : "ready";
  await prisma.chapter.update({ where: { id: chapterId }, data: { pagesStatus: status } });
}

// Character sheet first, then every page in parallel against it. If the sheet
// fails, page 1 is drawn first and used as the reference instead.
export async function illustrateChapter(chapterId: string) {
  const pages = await prisma.storyPage.findMany({ where: { chapterId }, orderBy: { pageNumber: "asc" } });
  if (pages.length === 0) return;
  const chapter = await prisma.chapter.update({ where: { id: chapterId }, data: { pagesStatus: "illustrating" } });
  const sheet = chapter.characterSheetImage ?? (await generateCharacterSheet(chapterId));
  const queue = [...pages];
  if (!sheet) await generateIllustration(queue.shift()!.id);
  const worker = async () => {
    for (let page = queue.shift(); page; page = queue.shift()) await generateIllustration(page.id);
  };
  await Promise.all(Array.from({ length: ILLUSTRATION_CONCURRENCY }, worker));
  await updatePagesStatus(chapterId);
}

// After a restart, illustrations that were mid-generation will never finish.
export async function failInterruptedIllustrations() {
  const stuck = await prisma.pageAsset.findMany({ where: { status: "generating" }, include: { page: true } });
  await prisma.pageAsset.updateMany({
    where: { id: { in: stuck.map((a) => a.id) } },
    data: { status: "failed", error: "Interrupted by a server restart. Retry this page." },
  });
  const unfinished = await prisma.chapter.findMany({ where: { pagesStatus: "illustrating" }, select: { id: true } });
  for (const chapterId of new Set([...stuck.map((a) => a.page.chapterId), ...unfinished.map((c) => c.id)])) {
    await updatePagesStatus(chapterId);
  }
}
