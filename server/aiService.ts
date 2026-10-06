import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import OpenAI, { toFile } from "openai";
import { getAiInstruction } from "./aiInstructions";
import { fillTemplate } from "./messageTemplates";
import { characterCardValues } from "./characters";

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

async function generateJson(provider: Provider, prompt: string, temperature: number, model = OPENAI_MODEL, images: string[] = []): Promise<any> {
  let raw: string;
  if (provider.kind === "openai") {
    const response = await provider.client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: images.length
            ? [{ type: "text", text: prompt }, ...images.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
            : prompt,
        },
      ],
      response_format: { type: "json_object" },
      ...(supportsTemperature(model) ? { temperature } : {}),
    });
    raw = response.choices[0]?.message?.content ?? "";
  } else {
    const imageParts = images.flatMap((url) => {
      const [, mimeType, data] = url.match(/^data:(.+?);base64,(.+)$/) ?? [];
      return data ? [{ inlineData: { mimeType, data } }] : [];
    });
    const response = await provider.client.models.generateContent({
      model: GEMINI_MODEL,
      contents: imageParts.length ? [{ role: "user", parts: [{ text: prompt }, ...imageParts] }] : prompt,
      config: { temperature },
    });
    raw = response.text ?? "";
  }
  return JSON.parse(raw.trim().replace(/^```json\s*|```$/g, ""));
}

const TEMPERATURE: Record<string, number> = {
  interpret: 0.4,
  page_plan: 0.9,
  page_check: 0.2,
  page_revise: 0.7,
  illustration_check: 0.2,
  describe_person: 0.2,
  guardian: 0.2,
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
// `images` are data URLs attached after the prompt, in order.
export async function runAiStep(key: string, values: Record<string, string>, override?: InstructionOverride, images: string[] = []) {
  const provider = getProvider();
  if (!provider) throw new Error("No AI provider configured");
  const instruction = await getAiInstruction(key);
  const body = override?.body ?? instruction.body;
  const model = (override && "model" in override ? override.model : instruction.model) || OPENAI_MODEL;
  const allValues = { ...(await characterCardValues()), ...values };
  const prompt = `${fillTemplate(body, allValues).replace(/\n{3,}/g, "\n\n").trim()}\n\n${instruction.outputFormat}`;
  const output = await generateJson(provider, prompt, TEMPERATURE[key] ?? 0.7, model, images);
  return { prompt, output, model: provider.kind === "openai" ? model : GEMINI_MODEL };
}

export const isAiConfigured = () => getProvider() !== null;

export interface TranscribeResult {
  text: string | null;
  isMock: boolean;
  reason?: string;
}

export async function transcribeAudio(filePath: string, mimeType: string): Promise<TranscribeResult> {
  const provider = getProvider();
  if (!provider) {
    return { text: null, isMock: true, reason: "No AI provider configured — enter the transcript manually below." };
  }
  try {
    if (provider.kind === "openai") {
      const file = await toFile(fs.createReadStream(filePath), path.basename(filePath), { type: mimeType });
      const response = await provider.client.audio.transcriptions.create({ model: OPENAI_TRANSCRIBE_MODEL, file });
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
    const text = response.text?.trim();
    if (!text) return { text: null, isMock: true, reason: "Transcription returned empty — enter it manually." };
    return { text, isMock: false };
  } catch (error: any) {
    return { text: null, isMock: true, reason: error?.message ?? "Transcription failed — enter it manually." };
  }
}

export interface InterpretResult {
  events: string;
  emotions: string;
  themes: string;
  isMock: boolean;
}

export async function interpretMemory(transcript: string): Promise<InterpretResult> {
  const fallback = { events: transcript.slice(0, 160), emotions: "", themes: "", isMock: true };
  if (!getProvider()) return fallback;
  try {
    const { output } = await runAiStep("interpret", { transcript });
    return {
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
}

export interface GuardianReviewInput {
  chapterContent: string;
  readerAgeBand: string;
  priorChapterTitles: string[];
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
    });
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
  switch (band) {
    case "0-3":
      return "Very young child: extremely simple sentences, concrete, soothing, read-aloud-by-a-parent tone.";
    case "4-7":
      return "Early reader: simple sentences, warm and playful, can name feelings directly.";
    case "8-12":
      return "Older child: fuller sentences, can hold more emotional nuance and complexity.";
    default:
      return "General family audience: warm, simple, read-aloud tone.";
  }
}
