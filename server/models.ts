// OpenAI's announced shutdowns (#21), checked 2026-11-21:
// https://developers.openai.com/api/docs/deprecations
export const DEFAULT_IMAGE_MODEL = "gpt-image-2.6-sunburst";
export const DEFAULT_TEXT_MODEL = "gpt-5.5";
export const DEFAULT_VOICE_MODEL = "gpt-transcribe";
export const IMAGE_MODELS = [DEFAULT_IMAGE_MODEL, "gpt-image-2.6-flare"];
export const TEXT_MODELS = [DEFAULT_TEXT_MODEL, "gpt-5.4", "gpt-5.4-mini", "gpt-6-luna"];

export const RETIREMENTS: Record<string, { shutdown: string; replacement: string }> = {
  "gpt-image-1": { shutdown: "2026-10-23", replacement: DEFAULT_IMAGE_MODEL },
  "gpt-image-1.5": { shutdown: "2026-12-01", replacement: DEFAULT_IMAGE_MODEL },
  "gpt-image-1-mini": { shutdown: "2026-12-01", replacement: DEFAULT_IMAGE_MODEL },
  "gpt-image-2": { shutdown: "2027-02-10", replacement: DEFAULT_IMAGE_MODEL },
  "gpt-4.1": { shutdown: "2027-01-14", replacement: "gpt-6-luna" },
  "gpt-4o-transcribe": { shutdown: "2027-02-26", replacement: DEFAULT_VOICE_MODEL },
  "gpt-4o-mini-transcribe": { shutdown: "2027-02-26", replacement: DEFAULT_VOICE_MODEL },
  "whisper-1": { shutdown: "2027-02-26", replacement: DEFAULT_VOICE_MODEL },
};

// Resolve at the call site, not by rewriting a chapter's historical snapshot.
// Dated model snapshots follow their base model's retirement too.
export function currentModel(model: string): string {
  const base = Object.keys(RETIREMENTS).find((key) => model === key || model.startsWith(`${key}-20`));
  return base ? RETIREMENTS[base].replacement : model;
}
