import "./setup";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../server/db";
import { currentModel, DEFAULT_IMAGE_MODEL, RETIREMENTS } from "../server/models";
import { checkModels } from "../server/modelCheck";
import { DEFAULT_RULES, getActiveRules } from "../server/pageRules";
import { recordVoice, priceFor } from "../server/aiUsage";

after(() => prisma.$disconnect());

test("retired aliases and dated snapshots resolve to priced active models", () => {
  for (const model of Object.keys(RETIREMENTS)) {
    for (const name of [model, `${model}-2025-12-16`]) {
      const resolved = currentModel(name);
      assert.ok(!RETIREMENTS[resolved]);
      assert.ok(priceFor(resolved, model.includes("image") ? "image" : model.includes("transcribe") || model === "whisper-1" ? "voice" : "text").known);
    }
  }
  assert.equal(currentModel("gpt-image-2.6-flare"), "gpt-image-2.6-flare");
});

test("startup creates one new rules version without changing the historical version", async () => {
  await prisma.generationRuleSet.create({ data: { version: 1, rules: JSON.stringify({ ...DEFAULT_RULES, imageModel: "gpt-image-1.5" }) } });
  await checkModels();
  await checkModels();
  const active = await getActiveRules();
  assert.equal(active.version, 2);
  assert.equal(active.rules.imageModel, DEFAULT_IMAGE_MODEL);
  assert.equal(JSON.parse((await prisma.generationRuleSet.findUniqueOrThrow({ where: { version: 1 } })).rules).imageModel, "gpt-image-1.5");
  process.env.OPENAI_MODEL = "unpriced-model";
  try { await assert.rejects(checkModels(), /Unpriced AI model/); }
  finally { delete process.env.OPENAI_MODEL; }
});

test("new transcription model is billed by minute, not legacy token estimates", async () => {
  const id = await recordVoice("gpt-transcribe", { type: "duration", seconds: 120 }, null);
  const row = await prisma.aiUsage.findUniqueOrThrow({ where: { id: id! } });
  assert.equal(row.costUsd, 0.009);
  assert.equal(row.estimated, false);
});
