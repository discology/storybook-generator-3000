import { AsyncLocalStorage } from "async_hooks";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./db";
import { SESSION_COOKIE } from "./session";

// What every AI call costs. Each call records the usage the API reports, priced
// with the table below, and is tagged with the family, chapter or memory it was
// for and what started it. The admin Costs page (server/costRoutes.ts) adds it up.

export type UsageKind = "text" | "image" | "voice";
// family: a parent or family member asked for it; weekly: the weekly chapter
// batch; admin: the Vambie team; system: resumed after a restart.
export type Trigger = "family" | "weekly" | "admin" | "system";

// Standard prices, US dollars per 1M tokens, from https://developers.openai.com/api/docs/pricing.
// Update these when prices change; each call's cost is stored when it's made, so
// older rows keep the price they were charged.
export const PRICES_CHECKED = "2026-10-06";
interface Price {
  input: number;
  cached?: number;
  imageInput?: number;
  output: number;
}
export const PRICES: Record<string, Price> = {
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.4": { input: 2.5, cached: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cached: 0.075, output: 4.5 },
  "gpt-4.1": { input: 2, cached: 0.5, output: 8 },
  "gpt-image-2": { input: 5, cached: 1.25, imageInput: 8, output: 30 },
  "gpt-image-1.5": { input: 5, cached: 1.25, imageInput: 8, output: 32 },
  "gpt-image-1": { input: 5, cached: 1.25, imageInput: 10, output: 40 },
  "gpt-image-1-mini": { input: 2, cached: 0.2, imageInput: 2.5, output: 8 },
  "gpt-4o-transcribe": { input: 2.5, output: 10 },
  "gpt-4o-mini-transcribe": { input: 1.25, output: 5 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
};
// A model missing from the table is priced like the app's default for its kind,
// and its rows are marked as estimates.
const FALLBACK: Record<UsageKind, string> = { text: "gpt-5.5", image: "gpt-image-2", voice: "gpt-4o-transcribe" };

const priceFor = (model: string, kind: UsageKind) => {
  const key = Object.keys(PRICES)
    .filter((k) => model === k || model.startsWith(`${k}-20`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? { price: PRICES[key], known: true } : { price: PRICES[FALLBACK[kind]], known: false };
};

// What each step is, in the words the Costs page uses.
export const STEP_LABELS: Record<string, { label: string; kind: UsageKind; group: "chapter" | "memory" | "family" | "admin" }> = {
  page_plan: { label: "Writing the chapter", kind: "text", group: "chapter" },
  page_check: { label: "Checking the pages", kind: "text", group: "chapter" },
  guardian: { label: "Guardian review", kind: "text", group: "chapter" },
  page_revise: { label: "Rewriting a page", kind: "text", group: "chapter" },
  chapter_sheet: { label: "Chapter character sheet", kind: "image", group: "chapter" },
  page_picture: { label: "Drawing pages", kind: "image", group: "chapter" },
  page_fix: { label: "Automatic redraws (character didn't match)", kind: "image", group: "chapter" },
  page_redraw: { label: "Redraws someone asked for", kind: "image", group: "chapter" },
  illustration_check: { label: "Checking pictures", kind: "text", group: "chapter" },
  transcribe: { label: "Transcribing voice memories", kind: "voice", group: "memory" },
  interpret: { label: "Understanding memories", kind: "text", group: "memory" },
  describe_person: { label: "Describing family photos", kind: "text", group: "family" },
  design_proposal: { label: "Family character designs", kind: "image", group: "family" },
  reference_sheet: { label: "Family reference sheets", kind: "image", group: "family" },
  library_art: { label: "Vambie library art", kind: "image", group: "admin" },
  admin_test: { label: "Admin test runs", kind: "text", group: "admin" },
};

export interface UsageTags {
  trigger?: Trigger;
  session?: string | null;
  userId?: string | null;
  householdId?: string | null;
  chapterId?: string | null;
  memoryId?: string | null;
  step?: string; // replaces the step name of every call inside (admin test runs)
}

const context = new AsyncLocalStorage<UsageTags>();

// Tags every AI call made inside fn, including work it starts in the background.
export function withUsage<T>(tags: UsageTags, fn: () => T): T {
  return context.run({ ...context.getStore(), ...tags }, fn);
}

// Express middleware: calls made while handling a request record who asked.
// Placed after any body parsing (multer included), which can lose the context.
export const usageFromRequest = (trigger: Trigger) => (req: Request, _res: Response, next: NextFunction) =>
  context.run({ ...context.getStore(), trigger, session: req.cookies?.[SESSION_COOKIE] ?? null }, next);

interface UsageRecord {
  kind: UsageKind;
  step: string;
  model: string;
  inputTokens?: number;
  cachedTokens?: number;
  imageTokens?: number;
  outputTokens?: number;
  estimated?: boolean;
  tags?: UsageTags;
}

async function householdFor(tags: UsageTags) {
  if (tags.chapterId) {
    const chapter = await prisma.chapter.findUnique({ where: { id: tags.chapterId }, select: { storybook: { select: { child: { select: { householdId: true } } } } } });
    if (chapter) return chapter.storybook.child.householdId;
  }
  if (tags.memoryId) {
    const memory = await prisma.memory.findUnique({ where: { id: tags.memoryId }, select: { storybook: { select: { child: { select: { householdId: true } } } } } });
    if (memory) return memory.storybook.child.householdId;
  }
  return null;
}

// Saves one call's usage. Never throws: a failed record must not fail the call.
// Returns the row's id so a call made before its chapter existed can be linked.
export async function recordUsage(r: UsageRecord): Promise<string | null> {
  try {
    const tags = { ...context.getStore(), ...r.tags };
    const { price, known } = priceFor(r.model, r.kind);
    const n = (v?: number) => Math.max(0, Math.round(v ?? 0));
    const costUsd =
      (n(r.inputTokens) * price.input +
        n(r.cachedTokens) * (price.cached ?? price.input) +
        n(r.imageTokens) * (price.imageInput ?? price.input) +
        n(r.outputTokens) * price.output) /
      1_000_000;
    const userId = tags.userId ?? (tags.session ? ((await prisma.session.findUnique({ where: { token: tags.session } }))?.userId ?? null) : null);
    const row = await prisma.aiUsage.create({
      data: {
        kind: r.kind,
        step: tags.step ?? r.step,
        model: r.model,
        inputTokens: n(r.inputTokens),
        cachedTokens: n(r.cachedTokens),
        imageTokens: n(r.imageTokens),
        outputTokens: n(r.outputTokens),
        costUsd,
        estimated: Boolean(r.estimated) || !known,
        trigger: tags.trigger ?? "system",
        householdId: tags.householdId ?? (await householdFor(tags)),
        chapterId: tags.chapterId ?? null,
        memoryId: tags.memoryId ?? null,
        userId,
      },
    });
    return row.id;
  } catch (error: any) {
    console.error("Couldn't record AI usage:", error?.message);
    return null;
  }
}

// A chapter's first call (writing it) happens before the chapter exists.
export async function linkUsage(usageId: string | null, chapterId: string) {
  if (!usageId) return;
  await prisma.aiUsage.update({ where: { id: usageId }, data: { chapterId } }).catch(() => undefined);
}

// --- Reading what each API reports ---

// Chat completions (OpenAI) or generateContent (Gemini).
export interface TextUsage {
  input: number;
  cached: number;
  output: number;
}
export const openAiTextUsage = (u: any): TextUsage | null =>
  u ? { input: (u.prompt_tokens ?? 0) - (u.prompt_tokens_details?.cached_tokens ?? 0), cached: u.prompt_tokens_details?.cached_tokens ?? 0, output: u.completion_tokens ?? 0 } : null;
export const geminiTextUsage = (u: any): TextUsage | null =>
  u ? { input: (u.promptTokenCount ?? 0) - (u.cachedContentTokenCount ?? 0), cached: u.cachedContentTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) } : null;

export const recordText = (step: string, model: string, usage: TextUsage | null, tags?: UsageTags) =>
  recordUsage({ kind: "text", step, model, inputTokens: usage?.input, cachedTokens: usage?.cached, outputTokens: usage?.output, estimated: !usage, tags });

// Output tokens per picture, for the rare response without usage (OpenAI's image
// token table). Wide and tall pictures cost about 1.5× a square one.
const IMAGE_OUTPUT_TOKENS: Record<string, number> = { low: 272, medium: 1056, high: 4160, auto: 4160 };

export function recordImage(step: string, model: string, response: any, request: { size?: string; quality?: string }, tags?: UsageTags) {
  const u = response?.usage;
  if (u) {
    return recordUsage({
      kind: "image",
      step,
      model,
      inputTokens: u.input_tokens_details?.text_tokens ?? u.input_tokens ?? 0,
      imageTokens: u.input_tokens_details?.image_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      tags,
    });
  }
  const square = !request.size || request.size === "1024x1024";
  const output = (IMAGE_OUTPUT_TOKENS[request.quality ?? "auto"] ?? IMAGE_OUTPUT_TOKENS.high) * (square ? 1 : 1.5);
  return recordUsage({ kind: "image", step, model, outputTokens: output, estimated: true, tags });
}

// Transcriptions report tokens, or for some models only the audio's length.
export function recordVoice(model: string, usage: any, audioSeconds: number | null, tags?: UsageTags) {
  if (usage?.type === "tokens") {
    return recordUsage({ kind: "voice", step: "transcribe", model, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, tags });
  }
  // 40 input tokens a second gives OpenAI's own estimates ($0.006 a minute for
  // gpt-4o-transcribe, $0.003 for the mini model).
  const seconds = usage?.type === "duration" ? usage.seconds : (audioSeconds ?? 60);
  return recordUsage({ kind: "voice", step: "transcribe", model, inputTokens: seconds * 40, estimated: true, tags });
}
