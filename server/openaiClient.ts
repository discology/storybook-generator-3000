import OpenAI from "openai";

let client: OpenAI | null = null;

// Shared OpenAI client for image generation; null when no key is configured.
export const getOpenAI = () => {
  if (!process.env.OPENAI_API_KEY) return null;
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
};
