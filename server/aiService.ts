import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import OpenAI, { toFile } from "openai";
import { WORLD_KEY, getAiInstruction } from "./aiInstructions";
import { fillTemplate } from "./messageTemplates";
import { characterCardValues } from "./characters";
import { stageInfo } from "./readingStages";
import { geminiTextUsage, openAiTextUsage, recordText, recordUsage, recordVoice, type TextUsage, type UsageTags } from "./aiUsage";

const GEMINI_MODEL = "gemini-2.5-flash";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";

// OpenAI wins if both keys are set; with neither, every step falls back to mock output.
type Provider = { kind: "openai"; client: OpenAI } | { kind: "gemini"; client: GoogleGenAI };

const getProvider = (): Provider | null => {
  if (process.env.OPENAI_API_KEY) return { kind: "openai", client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) };
  if (process.env.GEMINI_API_KEY) return { kind: "gemini", client: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) };
  return null;
};

// GPT-5 family and o-series reasoning models only accept the default temperature.
const supportsTemperature = (model: string) => /^gpt-4/.test(model);

// Returns the reply unparsed, so a reply that isn't JSON is still recorded as spent.
// An image for a text step: a data URL, or one with a detail level ("low" sends a
// small copy, for steps that look at many pictures).
export type AiImage = string | { url: string; detail: "low" | "high" | "auto" };
const imageUrl = (image: AiImage) => (typeof image === "string" ? image : image.url);

async function generateJson(provider: Provider, prompt: string, temperature: number, model = OPENAI_MODEL, images: AiImage[] = []): Promise<{ raw: string; usage: TextUsage | null }> {
  let raw: string;
  let usage: TextUsage | null;
  if (provider.kind === "openai") {
    const response = await provider.client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: images.length
            ? [
                { type: "text", text: prompt },
                ...images.map((image) => ({
                  type: "image_url" as const,
                  image_url: typeof image === "string" ? { url: image } : { url: image.url, detail: image.detail },
                })),
              ]
            : prompt,
        },
      ],
      response_format: { type: "json_object" },
      ...(supportsTemperature(model) ? { temperature } : {}),
    });
    raw = response.choices[0]?.message?.content ?? "";
    usage = openAiTextUsage(response.usage);
  } else {
    const imageParts = images.flatMap((image) => {
      const [, mimeType, data] = imageUrl(image).match(/^data:(.+?);base64,(.+)$/) ?? [];
      return data ? [{ inlineData: { mimeType, data } }] : [];
    });
    const response = await provider.client.models.generateContent({
      model: GEMINI_MODEL,
      contents: imageParts.length ? [{ role: "user", parts: [{ text: prompt }, ...imageParts] }] : prompt,
      config: { temperature },
    });
    raw = response.text ?? "";
    usage = geminiTextUsage(response.usageMetadata);
  }
  return { raw, usage };
}

const parseJson = (raw: string) => JSON.parse(raw.trim().replace(/^```json\s*|```$/g, ""));

const TEMPERATURE: Record<string, number> = {
  interpret: 0.4,
  page_plan: 0.9,
  page_check: 0.2,
  page_revise: 0.7,
  illustration_check: 0.2,
  describe_person: 0.2,
  guardian: 0.2,
  feedback_analysis: 0.3,
};

// Unsaved instructions from the admin editor, used for test runs.
export interface InstructionOverride {
  body?: string;
  model?: string | null;
}

// Builds the prompt from the admin-editable instructions plus the fixed reply
// format, then calls the AI. Throws on failure; callers decide the fallback.
// <character_key> variables come from the Character Library unless `values`
// supplies them (chapters pass the character cards from their snapshot).
// `images` are data URLs attached after the prompt, in order. `tags` say which
// chapter, memory or family the call's cost belongs to (server/aiUsage.ts).
export async function runAiStep(key: string, values: Record<string, string>, override?: InstructionOverride, images: AiImage[] = [], tags?: UsageTags) {
  const provider = getProvider();
  if (!provider) throw new Error("No AI provider configured");
  const instruction = await getAiInstruction(key);
  const body = override?.body ?? instruction.body;
  const model = (override && "model" in override ? override.model : instruction.model) || OPENAI_MODEL;
  // <world> is the shared "The Vambie world" block. Chapters pass the copy from
  // their snapshot; everything else (and older chapters) reads the current text.
  const world = values.world || (key === WORLD_KEY ? "" : (await getAiInstruction(WORLD_KEY)).body);
  const allValues = { ...(await characterCardValues()), ...values, world };
  const prompt = `${fillTemplate(body, allValues).replace(/\n{3,}/g, "\n\n").trim()}\n\n${instruction.outputFormat}`;
  const usedModel = provider.kind === "openai" ? model : GEMINI_MODEL;
  const { raw, usage } = await generateJson(provider, prompt, TEMPERATURE[key] ?? 0.7, model, images);
  const usageId = await recordText(key, usedModel, usage, tags);
  return { prompt, output: parseJson(raw), model: usedModel, usageId };
}

export const isAiConfigured = () => getProvider() !== null;

export interface TranscribeResult {
  text: string | null;
  isMock: boolean;
  reason?: string;
}

export async function transcribeAudio(filePath: string, mimeType: string, audioSeconds: number | null = null, tags?: UsageTags): Promise<TranscribeResult> {
  const provider = getProvider();
  if (!provider) {
    return { text: null, isMock: true, reason: "No AI provider configured — enter the transcript manually below." };
  }
  try {
    if (provider.kind === "openai") {
      const file = await toFile(fs.createReadStream(filePath), path.basename(filePath), { type: mimeType });
      const response = await provider.client.audio.transcriptions.create({ model: OPENAI_TRANSCRIBE_MODEL, file });
      await recordVoice(OPENAI_TRANSCRIBE_MODEL, response.usage, audioSeconds, tags);
      const text = response.text?.trim();
      if (!text) return { text: null, isMock: true, reason: "Transcription returned empty — enter it manually." };
      return { text, isMock: false };
    }
    const audioBytes = fs.readFileSync(filePath).toString("base64");
    const response = await provider.client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: "Transcribe this voice memory verbatim. Only output the transcript text, nothing else." },
            { inlineData: { mimeType, data: audioBytes } },
          ],
        },
      ],
    });
    const usage = geminiTextUsage(response.usageMetadata);
    await recordUsage({ kind: "voice", step: "transcribe", model: GEMINI_MODEL, inputTokens: usage?.input, outputTokens: usage?.output, estimated: !usage, tags });
    const text = response.text?.trim();
    if (!text) return { text: null, isMock: true, reason: "Transcription returned empty — enter it manually." };
    return { text, isMock: false };
  } catch (error: any) {
    return { text: null, isMock: true, reason: error?.message ?? "Transcription failed — enter it manually." };
  }
}

export interface InterpretResult {
  title: string;
  events: string;
  emotions: string;
  themes: string;
  isMock: boolean;
}

export async function interpretMemory(transcript: string, tags?: UsageTags): Promise<InterpretResult> {
  const fallback = { title: "", events: transcript.slice(0, 160), emotions: "", themes: "", isMock: true };
  if (!getProvider()) return fallback;
  try {
    const { output } = await runAiStep("interpret", { transcript }, undefined, [], tags);
    return {
      title: typeof output.title === "string" ? output.title.trim().replace(/[.!]+$/, "") : "",
      events: output.events ?? "",
      emotions: output.emotions ?? "",
      themes: output.themes ?? "",
      isMock: false,
    };
  } catch {
    return fallback;
  }
}

export interface GuardianFindingResult {
  category: "continuity" | "reader_fit" | "private_details";
  status: "ok" | "needs_revision";
  note: string;
  quote?: string;
}

export interface GuardianReviewInput {
  chapterContent: string;
  readerAgeBand: string;
  priorChapterTitles: string[];
  chapterId?: string; // the chapter the review's cost belongs to
}

export async function guardianReview(input: GuardianReviewInput): Promise<{ findings: GuardianFindingResult[]; isMock: boolean }> {
  const provider = getProvider();
  const categories: GuardianFindingResult["category"][] = ["continuity", "reader_fit", "private_details"];

  if (!provider) {
    return {
      isMock: true,
      findings: categories.map((category) => ({
        category,
        status: "ok",
        note: "No AI provider configured — Guardian review skipped. Please read this chapter yourself before approving.",
      })),
    };
  }

  try {
    const { output } = await runAiStep("guardian", {
      reader_level: readerAgeBandToInstruction(input.readerAgeBand),
      previous_chapters: input.priorChapterTitles.join(", ") || "(none yet — this is the first chapter)",
      chapter_text: input.chapterContent,
    }, undefined, [], { chapterId: input.chapterId });
    const findings = (Array.isArray(output) ? output : output.findings) as GuardianFindingResult[];
    if (!Array.isArray(findings) || findings.length === 0) throw new Error("reply had no findings");
    return { isMock: false, findings };
  } catch (error: any) {
    return {
      isMock: true,
      findings: categories.map((category) => ({
        category,
        status: "ok",
        note: `Guardian review failed (${error?.message ?? "unknown error"}) — please read this chapter yourself before approving.`,
      })),
    };
  }
}

export function readerAgeBandToInstruction(band: string): string {
  const stage = stageInfo(band);
  return `${stage.label} (ages ${stage.ages}): ${stage.summary}`;
}
