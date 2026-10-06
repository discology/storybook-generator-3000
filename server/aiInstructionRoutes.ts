import express, { Router } from "express";
import { prisma } from "./db";
import { getCurrentUser } from "./session";
import { AI_STEPS, getAiStep, getAiInstruction } from "./aiInstructions";
import { findUnknownVariables } from "./messageTemplates";
import { runAiStep } from "./aiService";
import { withUsage } from "./aiUsage";
import { characterVariables } from "./characters";

const router: Router = express.Router();

// Models offered in the editor; null means the OPENAI_MODEL default.
export const AI_MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-4.1"];

router.use("/admin/ai-instructions", async (req, res, next) => {
  if (!(await getCurrentUser(req))) return res.status(401).json({ error: "Sign in first" });
  next();
});

const withModels = async (key: string) => ({
  ...(await getAiInstruction(key)),
  models: AI_MODELS,
  defaultModel: process.env.OPENAI_MODEL || "gpt-5.5",
  // Every Character Library character can be referenced as <key> in any step.
  characterVariables: await characterVariables(),
});

router.get("/admin/ai-instructions", async (_req, res) => {
  res.json(await Promise.all(AI_STEPS.map((s) => withModels(s.key))));
});

router.get("/admin/ai-instructions/:key", async (req, res) => {
  if (!getAiStep(req.params.key)) return res.status(404).json({ error: "Not found" });
  res.json(await withModels(req.params.key));
});

// Checks edited instructions; returns an error message or null.
async function validate(key: string, body: unknown, model: unknown): Promise<string | null> {
  const step = getAiStep(key)!;
  if (typeof body !== "string" || !body.trim()) return "The instructions can't be empty.";
  const characterKeys = (await characterVariables()).map((v) => v.name);
  const unknown = findUnknownVariables(step, body, characterKeys);
  if (unknown.length) {
    return `This step doesn't support ${unknown.map((n) => `<${n}>`).join(", ")}. Use one of the variables listed, or add the character on the Characters page first.`;
  }
  if (model !== null && model !== undefined && !AI_MODELS.includes(String(model))) return "Pick one of the listed models.";
  return null;
}

router.put("/admin/ai-instructions/:key", async (req, res) => {
  const step = getAiStep(req.params.key);
  if (!step) return res.status(404).json({ error: "Not found" });
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : req.body?.body;
  const model = req.body?.model || null;
  const error = await validate(step.key, body, model);
  if (error) return res.status(400).json({ error });

  await prisma.aiInstruction.upsert({
    where: { key: step.key },
    create: { key: step.key, body, model },
    update: { body, model },
  });
  res.json(await withModels(step.key));
});

// Runs the step on its sample values with the (possibly unsaved) instructions.
router.post("/admin/ai-instructions/:key/test", async (req, res) => {
  const step = getAiStep(req.params.key);
  if (!step) return res.status(404).json({ error: "Not found" });
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : req.body?.body;
  const model = req.body?.model || null;
  const error = await validate(step.key, body, model);
  if (error) return res.status(400).json({ error });

  const values = Object.fromEntries(step.variables.map((v) => [v.name, v.sample]));
  const started = Date.now();
  try {
    const result = await withUsage({ step: "admin_test" }, () => runAiStep(step.key, values, { body, model }));
    res.json({ ...result, seconds: Math.round((Date.now() - started) / 100) / 10 });
  } catch (err: any) {
    res.status(502).json({ error: `The AI call failed: ${err?.message ?? "unknown error"}` });
  }
});

export default router;
