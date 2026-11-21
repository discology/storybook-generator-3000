import { prisma } from "./db";
import { priceFor } from "./aiUsage";
import { getActiveRules, saveRules } from "./pageRules";
import { DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL, DEFAULT_VOICE_MODEL, IMAGE_MODELS, TEXT_MODELS, currentModel } from "./models";

// Fail before accepting traffic, including saved admin instruction overrides.
export async function checkModels() {
  const active = await getActiveRules();
  const instructions = await prisma.aiInstruction.findMany({ where: { model: { not: null } } });
  const configured = [
    ...TEXT_MODELS.map((model) => ({ model, kind: "text" as const })),
    ...IMAGE_MODELS.map((model) => ({ model, kind: "image" as const })),
    { model: process.env.OPENAI_MODEL || DEFAULT_TEXT_MODEL, kind: "text" as const },
    { model: process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_VOICE_MODEL, kind: "voice" as const },
    { model: active.rules.imageModel, kind: "image" as const },
    { model: DEFAULT_IMAGE_MODEL, kind: "image" as const },
    ...instructions.map((i) => ({ model: i.model!, kind: "text" as const })),
  ];
  for (const { model, kind } of configured) {
    if (!priceFor(currentModel(model), kind).known) throw new Error(`Unpriced AI model: ${model}. Add its verified price before starting.`);
  }
  const imageModel = currentModel(active.rules.imageModel);
  if (imageModel !== active.rules.imageModel) await saveRules({ ...active.rules, imageModel });
}
