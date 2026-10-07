import fs from "fs";
import path from "path";
import { toFile } from "openai";
import { prisma } from "./db";
import { runAiStep, isAiConfigured, guardianReview } from "./aiService";
import { getAiInstruction } from "./aiInstructions";
import { CastMember, buildCast, characterCardValues, describeCast, renderReferences } from "./characters";
import {
  AppearanceWithDesign,
  FamilyCastEntry,
  appearanceDataUrls,
  appearanceReferences,
  approvedVariants,
  buildFamilyCast,
  describeAppearance,
  describeFamilyCast,
  parseAliases,
} from "./familyCharacters";
import { getOpenAI } from "./openaiClient";
import { MAX_REFERENCE_IMAGES, withImageRateLimit } from "./imageQueue";
import { linkUsage, recordImage } from "./aiUsage";
import { effectiveStage, vambieName } from "./readingStages";
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
  recordedBy?: string; // e.g. "Jordan (Parent)": tells "Mom" or "Grandma" apart
}

// Extras: people in this chapter who aren't saved family characters.
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
  // The Character Library cast and every <key> card at generation time. Absent
  // on chapters made before the library existed.
  cast?: CastMember[];
  characterCards?: Record<string, string>;
  // The family's saved characters when the chapter was planned (refs F1, F2…).
  // Characters chosen later while answering the chapter's questions are appended.
  family?: FamilyCastEntry[];
  // "Vambie" once the child reached the family's chosen age; absent means "Baby Vambie".
  vambieName?: string;
}

// Once the child is old enough, Baby Vambie is called just "Vambie" in the
// chapter: every instruction and value sent to the AI for it says so.
const named = (snapshot: GenerationSnapshot, text: string) => (snapshot.vambieName === "Vambie" ? text.replace(/Baby Vambie/g, "Vambie") : text);
const namedValues = (snapshot: GenerationSnapshot, values: Record<string, string>) =>
  snapshot.vambieName === "Vambie" ? Object.fromEntries(Object.entries(values).map(([k, v]) => [k, named(snapshot, v)])) : values;

// Text-only pages (later reading stages) have no illustration.
const hasPicture = (page: { pictureSize: string }) => page.pictureSize !== "none";

interface Shot {
  type: string;
  angle: string;
  focus: string;
}

interface PlannedAppearance {
  ref: string;
  variant: string;
  outfit: string;
}

interface PlannedPage {
  storyMoment: string;
  characters: string[];
  appearances: PlannedAppearance[];
  setting: string;
  visibleAction: string;
  emotionalTone: string;
  continuity: string;
  shot: Shot | null;
  pictureSize: string; // vignette | framed | full | wordless
  text: string;
  sourceMemory?: number;
  sourceQuote?: string;
  interpretationNote: string;
}

// Someone the planner couldn't match to a saved family character, or a look
// that isn't approved yet. The chapter waits for the parent's answer instead of
// inventing an appearance.
export interface UnresolvedPerson {
  ref: string; // U1, U2…
  mention: string;
  kind: "unclear" | "new" | "missing_variant";
  candidates: string[]; // family character IDs it might be
  variant: string;
  question: string;
  suggestedName: string;
  suggestedRelationship: string;
  appearances: { pageNumber: number; variant: string; outfit: string }[]; // applied once answered
}

// --- Formatting helpers for AI variables ---

export const formatMemories = (memories: SourceMemory[]) =>
  memories
    .map(
      (m, i) =>
        `Memory ${i + 1}:${m.recordedBy ? `\nRecorded by: ${m.recordedBy}` : ""}\nWhat happened: ${m.events}\nEmotions present: ${m.emotions}\nPossible themes: ${m.themes}\nOriginal account: "${m.transcript}"`
    )
    .join("\n\n");

const formatCharacters = (sheet: CharacterSheetEntry[]) => sheet.map((c) => `${c.name}: ${c.appearance}`).join("\n") || "(none)";

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

const findCastMember = (cast: CastMember[], nameOrKey: string) => {
  const n = nameOrKey.trim().toLowerCase();
  return cast.find((c) => c.key === n || c.name.toLowerCase() === n || c.key === n.replace(/[\s-]+/g, "_"));
};

// Family characters are matched by ref or full name only, never by alias:
// two people can both be "Grandma".
const findFamily = (family: FamilyCastEntry[], token: string) => {
  const t = token.trim().toLowerCase();
  return family.find((f) => f.ref.toLowerCase() === t || f.name.toLowerCase() === t);
};

// Pages store cast members by key and family characters by ref, so later
// lookups never depend on how the AI spelled a name.
const toPageTokens = (names: string[], cast: CastMember[], family: FamilyCastEntry[]) => [
  ...new Set(names.map((n) => findCastMember(cast, n)?.key ?? findFamily(family, n)?.ref ?? n)),
];

// <cast>, <family_cast> and every <key> card for a chapter's AI steps, from its snapshot.
const snapshotCharacterValues = (snapshot: GenerationSnapshot) => ({
  ...(snapshot.characterCards ?? {}),
  cast: describeCast(snapshot.cast ?? []),
  family_cast: describeFamilyCast(snapshot.family ?? []),
});

const pageCharacterNames = (p: PageRow, snapshot: GenerationSnapshot | null, unresolved: UnresolvedPerson[] = []) =>
  (JSON.parse(p.characters) as string[]).map((n) => {
    const member = findCastMember(snapshot?.cast ?? [], n);
    if (member) return `${member.name} (${member.key})`;
    const relative = (snapshot?.family ?? []).find((f) => f.ref === n);
    if (relative) return `${relative.name} (${relative.ref})`;
    const pending = unresolved.find((u) => u.ref === n);
    return pending ? `"${pending.mention}" (${pending.ref}, not yet identified)` : n;
  });

const formatPage = (p: PageRow, snapshot: GenerationSnapshot | null, unresolved: UnresolvedPerson[] = []) =>
  `Page ${p.pageNumber}${p.pictureSize ? ` (picture size: ${p.pictureSize})` : ""}\nStory moment: ${p.storyMoment}\nCharacters: ${pageCharacterNames(p, snapshot, unresolved).join(", ")}\nSetting: ${p.setting}\nVisible action: ${p.visibleAction}\nEmotional tone: ${p.emotionalTone}\nContinuity: ${p.continuity}\nShot: ${describeShot(parseShot(p.shot)) || "(none)"}\nText: "${p.text}"\nInterpretation: ${p.interpretationNote}`;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function normalizePage(raw: any): PlannedPage {
  return {
    storyMoment: str(raw?.storyMoment),
    characters: Array.isArray(raw?.characters) ? raw.characters.map(str).filter(Boolean) : [],
    appearances: Array.isArray(raw?.appearances)
      ? raw.appearances.map((a: any) => ({ ref: str(a?.ref), variant: str(a?.variant), outfit: str(a?.outfit) })).filter((a: PlannedAppearance) => a.ref)
      : [],
    setting: str(raw?.setting),
    visibleAction: str(raw?.visibleAction),
    emotionalTone: str(raw?.emotionalTone),
    continuity: str(raw?.continuity),
    shot: raw?.shot && str(raw.shot.type) ? { type: str(raw.shot.type), angle: str(raw.shot.angle), focus: str(raw.shot.focus) } : null,
    pictureSize: PICTURE_SIZE_NAMES.includes(str(raw?.pictureSize).toLowerCase()) ? str(raw.pictureSize).toLowerCase() : "framed",
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
  pictureSize: page.pictureSize,
  // A wordless page's picture says it all.
  text: page.pictureSize === "wordless" ? "" : page.text,
  interpretationNote: page.interpretationNote,
  sourceMemoryId: memories[(page.sourceMemory ?? 1) - 1]?.id ?? memories[0]?.id ?? null,
  sourceQuote: page.sourceQuote || null,
});

export const parseUnresolved = (json: string | null): UnresolvedPerson[] => {
  try {
    const list = JSON.parse(json ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

// --- Loading a chapter with everything generation needs ---

async function loadChapter(chapterId: string) {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: {
      storybook: { include: { child: true } },
      sources: {
        include: {
          memory: { include: { transcripts: { orderBy: { createdAt: "desc" }, take: 1 }, interpretation: true, contributor: true } },
        },
      },
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
    recordedBy: recordedBy(s.memory.contributor),
  }));
  return { chapter, snapshot, characterSheet, memories, unresolved: parseUnresolved(chapter.unresolvedPeople) };
}

export const recordedBy = (c: { name: string; relationship: string | null } | null | undefined) =>
  c ? `${c.name}${c.relationship ? ` (${c.relationship})` : ""}` : undefined;

const embellishmentRule = (rules: PageRules) => EMBELLISHMENT_LEVELS[rules.embellishment].rule;

const pageAppearances = (pageId: string) =>
  prisma.pageAppearance.findMany({ where: { pageId }, include: { design: true, familyCharacter: true } });

// --- Planning ---

function mockPlan(childName: string, memories: SourceMemory[], profile: ReadingProfile) {
  const event = memories[0]?.events || "something happened today";
  const pages: PlannedPage[] = Array.from({ length: profile.pagesMin }, (_, i) => ({
    storyMoment: i === 0 ? `Opening: ${event}` : `Placeholder moment ${i + 1}`,
    characters: ["Baby Vambie"],
    appearances: [],
    setting: "Placeholder setting",
    visibleAction: "Baby Vambie sits quietly, curious about how it felt.",
    emotionalTone: "Calm",
    continuity: "",
    shot: null,
    pictureSize: "framed",
    text: i === 0 ? `(Placeholder) ${childName} had a day. Baby Vambie sat close.` : `(Placeholder page ${i + 1}.)`,
    sourceMemory: 1,
    sourceQuote: "",
    interpretationNote: "Placeholder text: no AI provider is configured.",
  }));
  return {
    title: "Untitled (no AI provider configured)",
    characters: [{ name: "Baby Vambie", appearance: "small round teal-blue creature" }],
    pages,
    unresolved: [] as any[],
  };
}

// Matches the planner's people to page tokens, family appearances and
// questions. A family character whose look for this memory isn't approved
// becomes a question too, rather than an invented appearance.
function placePeople(pages: PlannedPage[], family: FamilyCastEntry[], rawUnresolved: any[]) {
  const unresolved: UnresolvedPerson[] = rawUnresolved.map((raw, i) => {
    const mention = str(raw?.mention) || "Someone";
    return {
      ref: /^u\d+$/i.test(str(raw?.ref)) ? str(raw.ref).toUpperCase() : `U${i + 1}`,
      mention,
      kind: ["unclear", "new", "missing_variant"].includes(raw?.kind) ? raw.kind : "unclear",
      candidates: (Array.isArray(raw?.candidates) ? raw.candidates : [])
        .map((c: unknown) => findFamily(family, String(c))?.characterId)
        .filter(Boolean) as string[],
      variant: str(raw?.variant) || "today",
      question: str(raw?.question) || `Who is "${mention}" in this memory?`,
      suggestedName: str(raw?.suggestedName),
      suggestedRelationship: str(raw?.suggestedRelationship),
      appearances: [],
    };
  });
  const findPending = (token: string) => unresolved.find((u) => u.ref.toLowerCase() === token.toLowerCase());
  const appearances: { pageNumber: number; characterId: string; designId: string; outfit: string }[] = [];

  pages.forEach((page, index) => {
    const pageNumber = index + 1;
    const tokens: string[] = [];
    for (const token of page.characters) {
      const relative = findFamily(family, token);
      const planned = page.appearances.find((a) => a.ref.toLowerCase() === token.toLowerCase() || (relative && findFamily(family, a.ref) === relative));
      if (relative) {
        const wanted = planned?.variant || "today";
        const variant =
          relative.variants.find((v) => v.variant.toLowerCase() === wanted.toLowerCase()) ??
          (!planned?.variant && relative.variants.length === 1 ? relative.variants[0] : undefined);
        if (variant) {
          appearances.push({ pageNumber, characterId: relative.characterId, designId: variant.designId, outfit: planned?.outfit ?? "" });
          tokens.push(relative.ref);
          continue;
        }
        // No approved look for what this page needs: ask the parent.
        let pending = unresolved.find((u) => u.kind === "missing_variant" && u.candidates[0] === relative.characterId && u.variant === wanted);
        if (!pending) {
          pending = {
            ref: `U${unresolved.length + 1}`,
            mention: relative.name,
            kind: "missing_variant",
            candidates: [relative.characterId],
            variant: wanted,
            question: relative.variants.length
              ? `This memory needs ${relative.name} ${wanted === "today" ? "as they look today" : wanted}, which hasn't been designed yet.`
              : `${relative.name}'s look hasn't been approved yet.`,
            suggestedName: relative.name,
            suggestedRelationship: relative.relationship,
            appearances: [],
          };
          unresolved.push(pending);
        }
        pending.appearances.push({ pageNumber, variant: wanted, outfit: planned?.outfit ?? "" });
        tokens.push(pending.ref);
        continue;
      }
      const pending = findPending(token);
      if (pending) {
        pending.appearances.push({ pageNumber, variant: planned?.variant || pending.variant, outfit: planned?.outfit ?? "" });
        tokens.push(pending.ref);
        continue;
      }
      tokens.push(token);
    }
    page.characters = [...new Set(tokens)];
  });

  // Questions about people who never appear on a page don't need an answer.
  return { unresolved: unresolved.filter((u) => u.appearances.length > 0), appearances };
}

export interface CreateChapterInput {
  storybookId: string;
  memories: SourceMemory[];
  existingChapterId?: string; // replace this chapter's pages (full rewrite)
  revisionRequest?: string;
  castKeys?: string[]; // characters the parent picked for this chapter
  illustrate?: boolean; // false: the caller draws the pictures itself (a visitor's preview, guests.ts)
  noQuestions?: boolean; // a visitor's preview: no Who's who, unplaced people are drawn from the memory
}

// Plans the pages, saves them with a rule snapshot, runs page checks and the
// Guardian, then starts illustrating in the background, unless someone in the
// story still needs identifying.
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
    const stage = effectiveStage(storybook);
    snapshot = {
      ruleSetVersion: active.version,
      rules: active.rules,
      readerAgeBand: stage,
      readingProfile: profileFor(active.rules, stage),
      vambieName: vambieName(storybook),
      instructions,
      cast: await buildCast(input.castKeys ?? []),
      characterCards: await characterCardValues(),
      family: await buildFamilyCast(storybook.child.householdId),
    };
  }
  const profile = snapshot.readingProfile;

  let plan: { title: string; characters: CharacterSheetEntry[]; pages: PlannedPage[]; unresolved: any[] };
  let isMock = false;
  let planUsageId: string | null = null;
  if (!isAiConfigured()) {
    plan = mockPlan(storybook.child.displayName, input.memories, profile);
    isMock = true;
  } else {
    const { output, usageId } = await runAiStep(
      "page_plan",
      namedValues(snapshot, {
        child_name: storybook.child.displayName,
        reading_level: describeProfile(profile),
        embellishment_rules: embellishmentRule(snapshot.rules),
        memories: formatMemories(input.memories),
        previous_chapters: priorChapters.map((c) => c.title).join(", ") || "(none yet — this is the first chapter)",
        revision_request: input.revisionRequest ? `A reviewer asked for this revision: "${input.revisionRequest}"` : "",
        ...snapshotCharacterValues(snapshot),
      }),
      { body: named(snapshot, snapshot.instructions.page_plan) },
      [],
      { chapterId: existing?.id ?? null, householdId: storybook.child.householdId }
    );
    planUsageId = usageId;
    const pages = Array.isArray(output?.pages)
      ? output.pages.map(normalizePage).filter((p: PlannedPage) => p.text || p.pictureSize === "wordless")
      : [];
    if (pages.length === 0) throw new Error("The AI returned no pages. Try again.");
    plan = {
      title: str(output.title) || `Chapter ${existing?.sequence ?? storybook.chapters.length + 1}`,
      characters: Array.isArray(output.characters)
        ? output.characters.map((c: any) => ({ name: str(c?.name), appearance: str(c?.appearance) })).filter((c: CharacterSheetEntry) => c.name)
        : [],
      pages,
      unresolved: Array.isArray(output.unresolved) ? output.unresolved : [],
    };
  }

  // Cast members and family characters are described by their library records,
  // so only extras stay in the chapter's own character list.
  const cast = snapshot.cast ?? [];
  const family = snapshot.family ?? [];
  plan.pages = plan.pages.map((p) => ({ ...p, characters: toPageTokens(p.characters, cast, family) }));
  plan.characters = plan.characters.filter((c) => !findCastMember(cast, c.name) && !findFamily(family, c.name));
  let { unresolved, appearances } = placePeople(plan.pages, family, plan.unresolved);
  if (input.noQuestions && unresolved.length) {
    // A visitor has no family characters to ask about yet: people the planner
    // couldn't place are drawn from the memory's description instead.
    const names = new Map(unresolved.map((u) => [u.ref.toLowerCase(), u.suggestedName || u.mention]));
    plan.pages.forEach((p) => (p.characters = [...new Set(p.characters.map((t) => names.get(t.toLowerCase()) ?? t))]));
    unresolved = [];
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
    unresolvedPeople: JSON.stringify(unresolved),
    pagesStatus: unresolved.length ? "needs_characters" : "illustrating",
  };

  let chapterId: string;
  if (existing) {
    await prisma.storyPage.deleteMany({ where: { chapterId: existing.id } });
    await prisma.guardianFinding.deleteMany({ where: { chapterId: existing.id } });
    await prisma.chapter.update({ where: { id: existing.id }, data: { ...chapterData, revisionRequested: true, version: { increment: 1 } } });
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
  await linkUsage(planUsageId, chapterId);

  await prisma.storyPage.createMany({
    data: plan.pages.map((p, i) => ({ chapterId, pageNumber: i + 1, ...pageData(p, input.memories) })),
  });
  const saved = await prisma.storyPage.findMany({ where: { chapterId }, select: { id: true, pageNumber: true } });
  await prisma.pageAppearance.createMany({
    data: appearances.map((a) => ({
      pageId: saved.find((p) => p.pageNumber === a.pageNumber)!.id,
      familyCharacterId: a.characterId,
      designId: a.designId,
      outfit: a.outfit,
    })),
  });

  await checkPages(chapterId);
  await runGuardian(chapterId);
  if (!unresolved.length && input.illustrate !== false) void illustrateChapter(chapterId);
  return prisma.chapter.findUniqueOrThrow({ where: { id: chapterId }, include: { sources: true, findings: true } });
}

async function runGuardian(chapterId: string) {
  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId }, include: { storybook: { include: { chapters: true } } } });
  const review = await guardianReview({
    chapterId,
    chapterContent: chapter.content,
    readerAgeBand: chapter.storybook.readerAgeBand,
    priorChapterTitles: chapter.storybook.chapters.filter((c) => c.status === "published" && c.id !== chapterId).map((c) => c.title),
  });
  await prisma.guardianFinding.deleteMany({ where: { chapterId } });
  await prisma.guardianFinding.createMany({
    data: review.findings.map((f) => ({ chapterId, category: f.category, status: f.status, note: f.note, quote: f.status === "needs_revision" && f.quote ? String(f.quote) : null })),
  });
  const hasIssues = review.findings.some((f) => f.status === "needs_revision");
  await prisma.chapter.update({ where: { id: chapterId }, data: { guardianStatus: hasIssues ? "needs_revision" : "approved" } });
}

// --- Answering "who is this?" ---

export type PersonAnswer =
  | { ref: string; characterId: string; variant?: string }
  | { ref: string; extra: { name?: string; appearance?: string } };

// Applies the parent's answers: each unidentified person becomes a saved family
// character (with an approved look) or an extra for this chapter. Once nobody is
// left unidentified, the pages are rechecked and illustrated.
export async function resolvePeople(chapterId: string, answers: PersonAnswer[]) {
  const { chapter, snapshot, characterSheet, unresolved } = await loadChapter(chapterId);
  if (!snapshot) throw new Error("This chapter wasn't generated with page rules.");
  const family = snapshot.family ?? [];
  let remaining = [...unresolved];

  for (const answer of answers) {
    const person = remaining.find((u) => u.ref === answer.ref);
    if (!person) continue;
    let replacement: string;

    if ("characterId" in answer) {
      const character = await prisma.familyCharacter.findFirst({
        where: { id: answer.characterId, householdId: chapter.storybook.child.householdId },
        include: { designs: true },
      });
      if (!character) throw new Error("That character isn't saved for this family.");
      const variants = approvedVariants(character.designs);
      const variantName = answer.variant || person.variant || "today";
      const design = variants.get(variantName);
      if (!design) throw new Error(`${character.name} has no approved "${variantName}" look yet. Approve one on Our Characters first.`);

      // Characters saved or approved after planning join the chapter's family list.
      const variantList = [...variants.values()].map((d) => ({
        variant: d.variant,
        designId: d.id,
        version: d.version,
        identity: d.identity,
        usualClothing: d.usualClothing,
      }));
      let entry = family.find((f) => f.characterId === character.id);
      if (!entry) {
        entry = {
          ref: `F${family.length + 1}`,
          characterId: character.id,
          name: character.name,
          relationship: character.relationship,
          aliases: parseAliases(character.aliases),
          context: character.context,
          variants: variantList,
        };
        family.push(entry);
      } else if (!entry.variants.some((v) => v.designId === design.id)) {
        entry.variants = [...entry.variants.filter((v) => v.variant !== design.variant), variantList.find((v) => v.designId === design.id)!];
      }
      replacement = entry.ref;
      for (const a of person.appearances) {
        const page = chapter.pages.find((p) => p.pageNumber === a.pageNumber);
        if (!page) continue;
        await prisma.pageAppearance.upsert({
          where: { pageId_familyCharacterId: { pageId: page.id, familyCharacterId: character.id } },
          create: { pageId: page.id, familyCharacterId: character.id, designId: design.id, outfit: a.outfit },
          update: { designId: design.id, outfit: a.outfit },
        });
      }
    } else {
      replacement = answer.extra.name?.trim() || person.suggestedName || person.mention;
      if (!characterSheet.some((c) => c.name.toLowerCase() === replacement.toLowerCase())) {
        characterSheet.push({ name: replacement, appearance: answer.extra.appearance?.trim() || "A warm, simple storybook figure." });
      }
    }

    for (const page of chapter.pages) {
      const tokens = JSON.parse(page.characters) as string[];
      if (!tokens.includes(person.ref)) continue;
      const updated = [...new Set(tokens.map((t) => (t === person.ref ? replacement : t)))];
      await prisma.storyPage.update({ where: { id: page.id }, data: { characters: JSON.stringify(updated) } });
    }
    remaining = remaining.filter((u) => u.ref !== person.ref);
  }

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      generationSnapshot: JSON.stringify({ ...snapshot, family }),
      characterSheet: JSON.stringify(characterSheet),
      unresolvedPeople: JSON.stringify(remaining),
      pagesStatus: remaining.length ? "needs_characters" : "illustrating",
    },
  });
  if (!remaining.length) {
    await checkPages(chapterId);
    void illustrateChapter(chapterId);
  }
}

// --- Checks ---

// Reading-limit checks run in code on every requested page; the AI then checks
// source fidelity, continuity and scene/text alignment. Pass page numbers to
// check only those (e.g. an edited page and its neighbors).
export async function checkPages(chapterId: string, pageNumbers?: number[]) {
  const { chapter, snapshot, characterSheet, memories, unresolved } = await loadChapter(chapterId);
  if (!snapshot) return;
  const profile = snapshot.readingProfile;
  const targets = chapter.pages.filter((p) => !pageNumbers || pageNumbers.includes(p.pageNumber));
  if (targets.length === 0) return;

  const notes = new Map<number, string[]>(
    targets.map((p) => [p.pageNumber, p.pictureSize === "wordless" ? [] : checkPageLimits(p.text, profile)])
  );
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
        namedValues(snapshot, {
          child_name: chapter.storybook.child.displayName,
          reading_level: describeProfile(profile),
          embellishment_rules: embellishmentRule(snapshot.rules),
          memories: formatMemories(memories),
          characters: formatCharacters(characterSheet),
          pages: chapter.pages.map((p) => formatPage(p, snapshot, unresolved)).join("\n\n"),
          pages_to_check: targets.map((p) => p.pageNumber).join(", "),
          ...snapshotCharacterValues(snapshot),
        }),
        { body: named(snapshot, snapshot.instructions.page_check) },
        [],
        { chapterId }
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
  const { chapter, snapshot, characterSheet, memories, unresolved } = await loadChapter(target.chapterId);
  if (!snapshot) throw new Error("This chapter wasn't generated with page rules.");
  if (!isAiConfigured()) throw new Error("No AI provider configured.");
  const neighbor = (n: number) => {
    const p = chapter.pages.find((x) => x.pageNumber === n);
    return p ? `Page ${n}: ${p.storyMoment} Text: "${p.text}"` : "(none)";
  };

  const { output } = await runAiStep(
    "page_revise",
    namedValues(snapshot, {
      reading_level: describeProfile(snapshot.readingProfile),
      embellishment_rules: embellishmentRule(snapshot.rules),
      memories: formatMemories(memories),
      characters: formatCharacters(characterSheet),
      page_number: String(target.pageNumber),
      current_page: formatPage(target, snapshot, unresolved),
      previous_page: neighbor(target.pageNumber - 1),
      next_page: neighbor(target.pageNumber + 1),
      revision_request: request,
      ...snapshotCharacterValues(snapshot),
    }),
    { body: named(snapshot, snapshot.instructions.page_revise) },
    [],
    { chapterId: target.chapterId }
  );
  const revised = normalizePage(output);
  // Keep the page's picture size unless the revision chose one.
  if (!PICTURE_SIZE_NAMES.includes(str(output?.pictureSize).toLowerCase())) revised.pictureSize = target.pictureSize || "framed";
  if (!revised.text && revised.pictureSize !== "wordless") throw new Error("The AI returned an empty page. Try again.");
  const family = snapshot.family ?? [];
  revised.characters = toPageTokens(revised.characters, snapshot.cast ?? [], family);

  // Family characters keep an approved look: the one the AI picked if approved,
  // otherwise the one they already had on this page.
  const previous = await pageAppearances(pageId);
  const appearances = revised.characters.flatMap((token) => {
    const relative = family.find((f) => f.ref === token);
    if (!relative) return [];
    const planned = revised.appearances.find((a) => findFamily(family, a.ref) === relative);
    const before = previous.find((a) => a.familyCharacterId === relative.characterId);
    const variant =
      relative.variants.find((v) => v.variant.toLowerCase() === (planned?.variant ?? "").toLowerCase()) ??
      relative.variants.find((v) => v.designId === before?.designId) ??
      relative.variants.find((v) => v.variant === "today") ??
      relative.variants[0];
    return variant ? [{ characterId: relative.characterId, designId: variant.designId, outfit: planned?.outfit || before?.outfit || "" }] : [];
  });

  await prisma.storyPage.update({ where: { id: pageId }, data: { ...pageData(revised, memories), approvedAt: null } });
  await prisma.pageAppearance.deleteMany({ where: { pageId } });
  await prisma.pageAppearance.createMany({
    data: appearances.map((a) => ({ pageId, familyCharacterId: a.characterId, designId: a.designId, outfit: a.outfit })),
  });
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
  const missing = pages.filter((p) => hasPicture(p) && p.assets.length === 0).map((p) => p.pageNumber);
  if (missing.length) throw new Error(`Page ${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no illustration yet.`);
  await prisma.storyPage.updateMany({ where: { id: { in: pages.map((p) => p.id) } }, data: { approvedAt: new Date() } });
}

// --- Illustrations ---

// An image attached to an illustration request, with how the model should use it.
interface ImageReference {
  path: string;
  label: string;
}

const SHEET_LABEL =
  "This chapter's character sheet. Use it ONLY for how the characters look (body shape, colors, outfits) and for the art style. Do not copy its layout, poses or plain background: paint a completely new, fully detailed scene framed as described.";
const EARLIER_PAGE_LABEL =
  "An earlier page of this same book: draw the characters, outfits and art style as they appear there, in a new scene.";
const castArtLabel = (m: CastMember) =>
  `Official artwork of ${m.name}: match ${m.name}'s shape, proportions, colors and features exactly, drawn in this book's art style.`;
// References define who characters are; the art style comes from the rules.
const BELONG_NOTE =
  "Reference images show who each character is (shape, proportions, colors, features), not how to render them: draw every character in this book's art style, with the same line, texture, lighting and palette as the scene, so they belong in it.";

// Each page's picture size decides the image's shape and framing. Pages made
// before picture sizes existed keep the original wide format.
const PICTURE_SIZE_NAMES = ["vignette", "framed", "full", "wordless", "none"];
const PICTURE_SIZES: Record<string, { size: string; framing: string }> = {
  vignette: {
    size: "1024x1024",
    framing:
      "Picture size: a small vignette: the characters and a few props on plain warm-cream paper, the color fading out in soft, irregular edges with empty paper all around; no background scenery and no border.",
  },
  framed: { size: "1024x1024", framing: "Picture size: a square picture of the whole scene." },
  full: { size: "1024x1536", framing: "Picture size: a tall full-page picture of the whole scene." },
  wordless: {
    size: "1024x1536",
    framing: "Picture size: a tall full-page picture with no words on the page: the meaningful moment of the chapter, filling the frame edge to edge.",
  },
};
const pictureFormat = (page: { pictureSize: string }) => PICTURE_SIZES[page.pictureSize] ?? { size: "1536x1024", framing: "" };

const describeReferences = (references: ImageReference[]) =>
  references.length ? `Attached images, in order:\n${references.map((r, i) => `${i + 1}. ${r.label}`).join("\n")}` : "";

// One line per character: cast members from their locked card, family
// characters from their approved design and this page's outfit, extras from the
// chapter's character list.
const describePageCharacters = (
  tokens: string[],
  ctx: { cast: CastMember[]; family: FamilyCastEntry[]; people: CharacterSheetEntry[]; appearances: AppearanceWithDesign[] }
) =>
  tokens.map((token) => {
    const member = findCastMember(ctx.cast, token);
    if (member) return `${member.name}: ${member.appearance}${member.neverRules ? `. Never: ${member.neverRules}` : ""}`;
    const relative = ctx.family.find((f) => f.ref === token);
    const appearance = relative && ctx.appearances.find((a) => a.familyCharacterId === relative.characterId);
    if (appearance) return describeAppearance(appearance);
    const person = ctx.people.find((c) => c.name.toLowerCase() === token.toLowerCase());
    return person ? `${person.name}: ${person.appearance}` : relative?.name ?? token;
  });

// Cast members who appear on at least one page of the chapter.
const castOnPages = (cast: CastMember[], pages: PageRow[]) =>
  cast.filter((m) => pages.some((p) => (JSON.parse(p.characters) as string[]).includes(m.key)));

const MIME_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const toUpload = (relativePath: string) =>
  toFile(fs.createReadStream(path.join(process.cwd(), relativePath)), path.basename(relativePath), {
    type: MIME_TYPES[path.extname(relativePath).toLowerCase()] ?? "image/png",
  });

interface PromptContext {
  rules: PageRules;
  cast: CastMember[];
  family: FamilyCastEntry[];
  people: CharacterSheetEntry[];
  appearances: AppearanceWithDesign[];
}

function buildImagePrompt(page: PageRow, ctx: PromptContext, references: ImageReference[], correction?: string) {
  const shot = parseShot(page.shot);
  return [
    shot ? `Camera: ${describeShot(shot)}.` : "",
    pictureFormat(page).framing,
    ctx.rules.illustrationStyle,
    // Chapters from before the Character Library described Baby Vambie in the rules.
    ctx.cast.length ? "" : ctx.rules.babyVambieAppearance ?? "",
    ctx.rules.peopleStyle,
    describeReferences(references),
    references.length ? BELONG_NOTE : "",
    correction ?? "",
    `Characters in this scene (draw no one else):\n${describePageCharacters(JSON.parse(page.characters), ctx).join("\n") || "Baby Vambie"}`,
    `Setting: ${page.setting}`,
    `Show: ${page.visibleAction}`,
    `Mood: ${page.emotionalTone}`,
    page.continuity ? `Keep consistent: ${page.continuity}` : "",
    "Do not include any text, letters or words in the image.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildCharacterSheetPrompt(ctx: PromptContext, references: ImageReference[]) {
  const characters = [
    ...ctx.cast.map((m) => `${m.name}: ${m.appearance}${m.neverRules ? `. Never: ${m.neverRules}` : ""}`),
    ...ctx.appearances.map(describeAppearance),
    ...ctx.people.map((c) => `${c.name}: ${c.appearance}`),
  ];
  return [
    ctx.rules.illustrationStyle,
    ctx.cast.length ? "" : ctx.rules.babyVambieAppearance ?? "",
    ctx.rules.peopleStyle,
    describeReferences(references),
    "A character reference sheet for a picture book: show each character below exactly once, full body, standing side by side in a relaxed neutral pose and facing the viewer, on a plain warm-cream background. No scenery, no props, no labels.",
    `Characters:\n${characters.join("\n") || "Baby Vambie"}`,
    "Do not include any text, letters or words in the image.",
  ]
    .filter(Boolean)
    .join("\n\n");
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
  const { chapter, snapshot, characterSheet } = await loadChapter(chapterId);
  const client = getOpenAI();
  if (!snapshot || !client) return null;
  const cast = castOnPages(snapshot.cast ?? [], chapter.pages);
  // Each family character once, as they first appear in this chapter.
  const all = await prisma.pageAppearance.findMany({
    where: { page: { chapterId } },
    include: { design: true, familyCharacter: true, page: true },
    orderBy: { page: { pageNumber: "asc" } },
  });
  const appearances = all.filter((a, i) => all.findIndex((b) => b.familyCharacterId === a.familyCharacterId) === i);
  const references = [
    ...cast.filter((m) => m.referenceImage).map((m) => ({ path: m.referenceImage!, label: castArtLabel(m) })),
    ...appearances.flatMap((a) => appearanceReferences(a).slice(0, 1)),
  ].slice(0, MAX_REFERENCE_IMAGES);
  try {
    const common = {
      model: snapshot.rules.imageModel,
      prompt: buildCharacterSheetPrompt({ rules: snapshot.rules, cast, family: snapshot.family ?? [], people: characterSheet, appearances }, references),
      size: "1536x1024",
      quality: snapshot.rules.imageQuality,
      output_format: "jpeg" as const,
    };
    const response = await withImageRateLimit(references.length, async () =>
      references.length
        ? client.images.edit({ ...common, image: await Promise.all(references.map((r) => toUpload(r.path))) })
        : client.images.generate(common)
    );
    await recordImage("chapter_sheet", common.model, response, common, { chapterId });
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

export interface IllustrationOptions {
  referencePageId?: string;
  // Family characters the last version got wrong; their approved design gets
  // extra emphasis, and this version won't be retried automatically again.
  fixCharacterIds?: string[];
}

// Generates a new illustration version for one page. Never touches the text.
export async function generateIllustration(pageId: string, options: IllustrationOptions = {}) {
  const page = await prisma.storyPage.findUniqueOrThrow({ where: { id: pageId } });
  if (!hasPicture(page)) return;
  const { chapter, snapshot, characterSheet } = await loadChapter(page.chapterId);
  const rules = snapshot?.rules;
  const cast = snapshot?.cast ?? [];
  const appearances = await pageAppearances(pageId);
  // References, most important first, since a request can only carry a few:
  // each character's own art and family portraits, then the chapter's character
  // sheet (chapters made before sheets existed use page 1 instead, so their
  // pages still match), then family reference sheets and mood/angle renders.
  const onPage = (JSON.parse(page.characters) as string[]).map((t) => findCastMember(cast, t)).filter((m): m is CastMember => Boolean(m));
  const scene: ImageReference[] = [];
  if (chapter.characterSheetImage && !options.referencePageId) {
    scene.push({ path: chapter.characterSheetImage, label: SHEET_LABEL });
  } else {
    const firstPicture = chapter.pages.find(hasPicture);
    const pageRef = await latestReadyAsset(options.referencePageId ?? (firstPicture && firstPicture.id !== page.id ? firstPicture.id : ""));
    if (pageRef?.imagePath) scene.push({ path: pageRef.imagePath, label: EARLIER_PAGE_LABEL });
  }
  const references: ImageReference[] = [
    ...onPage.filter((m) => m.referenceImage).map((m) => ({ path: m.referenceImage!, label: castArtLabel(m) })),
    ...appearances.flatMap((a) => appearanceReferences(a).slice(0, 1)),
    ...scene,
    ...appearances.flatMap((a) => appearanceReferences(a).slice(1)),
    ...onPage.flatMap((m) => renderReferences(m, page, parseShot(page.shot))),
  ].slice(0, MAX_REFERENCE_IMAGES);

  const toFix = appearances.filter((a) => options.fixCharacterIds?.includes(a.familyCharacterId));
  const fixNote = toFix.length ? toFix.map((a) => a.familyCharacter.name).join(", ") : null;
  const correction = fixNote
    ? `Correction: in the previous version of this page, ${fixNote} didn't look like their approved design. Match the attached approved design exactly: same face shape, skin tone, eyes, hair, build and signature accessories.`
    : undefined;
  const ctx = { rules: rules!, cast, family: snapshot?.family ?? [], people: characterSheet, appearances };
  const prompt = rules ? buildImagePrompt(page, ctx, references, correction) : "";

  const last = await prisma.pageAsset.findFirst({ where: { pageId }, orderBy: { version: "desc" } });
  const asset = await prisma.pageAsset.create({
    data: { pageId, version: (last?.version ?? 0) + 1, status: "generating", prompt, model: rules?.imageModel, fixNote },
  });

  const fail = (error: string) => prisma.pageAsset.update({ where: { id: asset.id }, data: { status: "failed", error } });
  const client = getOpenAI();
  if (!rules) return fail("This chapter wasn't generated with page rules.");
  if (!client) return fail("Illustrations need an OpenAI API key (OPENAI_API_KEY).");

  let mismatched: string[] = [];
  try {
    const common = { model: rules.imageModel, prompt, size: pictureFormat(page).size, quality: rules.imageQuality, output_format: "jpeg" as const };
    const response = await withImageRateLimit(references.length, async () =>
      references.length
        ? client.images.edit({ ...common, image: await Promise.all(references.map((r) => toUpload(r.path))) })
        : client.images.generate(common)
    );
    const step = fixNote ? "page_fix" : asset.version > 1 ? "page_redraw" : "page_picture";
    await recordImage(step, common.model, response, common, { chapterId: page.chapterId });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("The image service returned no image.");
    const imagePath = saveImage(b64, `${pageId}-v${asset.version}.jpg`);
    await prisma.pageAsset.update({ where: { id: asset.id }, data: { status: "ready", imagePath } });
    await prisma.storyPage.update({ where: { id: pageId }, data: { approvedAt: null } });
    mismatched = await checkIllustration(asset.id);
  } catch (error: any) {
    console.error(`Illustration failed for page ${pageId}:`, error?.message);
    await fail(error?.message ?? "Illustration failed.");
    return;
  }
  // A family character who doesn't match their approved design gets one
  // automatic redraw; after that the page is flagged for the parent.
  if (mismatched.length && !fixNote) await generateIllustration(pageId, { fixCharacterIds: mismatched });
}

// Returns the IDs of family characters who don't match their approved design.
async function checkIllustration(assetId: string): Promise<string[]> {
  const asset = await prisma.pageAsset.findUniqueOrThrow({ where: { id: assetId }, include: { page: true } });
  if (!asset.imagePath) return [];
  const { snapshot, characterSheet } = await loadChapter(asset.page.chapterId);
  const tokens = JSON.parse(asset.page.characters) as string[];
  const appearances = (await pageAppearances(asset.pageId)).filter((a) => a.design.portraitPath);
  const ctx = { rules: snapshot?.rules as PageRules, cast: snapshot?.cast ?? [], family: snapshot?.family ?? [], people: characterSheet, appearances };
  try {
    const image = fs.readFileSync(path.join(process.cwd(), asset.imagePath)).toString("base64");
    const { output } = await runAiStep(
      "illustration_check",
      {
        page_text: asset.page.text,
        visible_action: asset.page.visibleAction,
        characters: describePageCharacters(tokens, ctx).join("\n"),
        reference_images: appearances.length
          ? appearances.map((a, i) => `Image ${i + 2} (R${i + 1}): ${a.familyCharacter.name}'s approved design`).join("\n")
          : "(none)",
      },
      snapshot ? { body: snapshot.instructions.illustration_check } : undefined,
      [`data:image/jpeg;base64,${image}`, ...appearanceDataUrls(appearances)],
      { chapterId: asset.page.chapterId }
    );
    const mismatched = (Array.isArray(output?.mismatched) ? output.mismatched : [])
      .map((ref: unknown) => appearances[Number(String(ref).replace(/\D/g, "")) - 1]?.familyCharacterId)
      .filter(Boolean) as string[];
    const flagged = output?.status === "flagged" || mismatched.length > 0;
    await prisma.pageAsset.update({
      where: { id: assetId },
      data: { checkStatus: flagged ? "flagged" : "ok", checkNote: flagged ? str(output?.note) || "Doesn't match the page." : null },
    });
    return mismatched;
  } catch (error: any) {
    await prisma.pageAsset.update({
      where: { id: assetId },
      data: { checkStatus: "flagged", checkNote: `The automatic check couldn't run (${error?.message ?? "unknown error"}). Look at this picture carefully.` },
    });
    return [];
  }
}

export async function updatePagesStatus(chapterId: string) {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { pages: { include: { assets: { orderBy: { version: "desc" }, take: 1 } } } },
  });
  if (chapter.pages.length === 0) return;
  if (parseUnresolved(chapter.unresolvedPeople).length) {
    await prisma.chapter.update({ where: { id: chapterId }, data: { pagesStatus: "needs_characters" } });
    return;
  }
  // Call this once nothing more is queued: a page with no illustration then needs a retry.
  const latest = chapter.pages.filter(hasPicture).map((p) => p.assets[0]?.status);
  const status = latest.some((s) => s === "generating")
    ? "illustrating"
    : latest.some((s) => s !== "ready")
      ? "needs_attention"
      : "ready";
  await prisma.chapter.update({ where: { id: chapterId }, data: { pagesStatus: status } });
}

// Character sheet first, then every page in parallel against it. If the sheet
// fails, page 1 is drawn first and used as the reference instead. Waits while
// someone in the chapter still needs identifying. A visitor's preview draws only
// its first pages; once they save, the rest are drawn (missingOnly).
export async function illustrateChapter(chapterId: string, options: { firstPages?: number; missingOnly?: boolean } = {}) {
  let pages = (
    await prisma.storyPage.findMany({ where: { chapterId }, orderBy: { pageNumber: "asc" }, include: { assets: { where: { status: "ready" }, take: 1 } } })
  ).filter(hasPicture);
  if (options.missingOnly) pages = pages.filter((p) => p.assets.length === 0);
  if (options.firstPages) pages = pages.filter((p) => p.pageNumber <= options.firstPages!);
  const current = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
  if (parseUnresolved(current.unresolvedPeople).length) return;
  if (pages.length === 0) return updatePagesStatus(chapterId);
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

// Redraws pages after a family character's new look was approved for drafts.
export async function redrawPages(pageIds: string[]) {
  const pages = (await prisma.storyPage.findMany({ where: { id: { in: pageIds } } })).filter(hasPicture);
  for (const chapterId of new Set(pages.map((p) => p.chapterId))) {
    await prisma.chapter.update({ where: { id: chapterId }, data: { pagesStatus: "illustrating" } });
  }
  const queue = [...pages];
  const worker = async () => {
    for (let page = queue.shift(); page; page = queue.shift()) await generateIllustration(page.id);
  };
  await Promise.all(Array.from({ length: ILLUSTRATION_CONCURRENCY }, worker));
  for (const chapterId of new Set(pages.map((p) => p.chapterId))) await updatePagesStatus(chapterId);
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
  // Reference sheets that were being drawn are marked failed so they can be redone.
  await prisma.characterDesign.updateMany({ where: { sheetStatus: "generating" }, data: { sheetStatus: "failed" } });
}
