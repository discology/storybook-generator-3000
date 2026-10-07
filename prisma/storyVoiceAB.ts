// A/B test for the story voice: plans the same memories with the current
// page_plan instructions and with a proposed body, at chosen reading stages,
// through the app's real prompt path (runAiStep), and saves the page text.
//   npx tsx prisma/storyVoiceAB.ts --proposed path/to/body.txt --out dir [--dry]
//     [--memories id1,id2] [--stages read_to_me,chapter_book] [--arms current,proposed]
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../server/db";
import { runAiStep } from "../server/aiService";
import { buildCast, describeCast } from "../server/characters";
import { buildFamilyCast, describeFamilyCast } from "../server/familyCharacters";
import { EMBELLISHMENT_LEVELS, describeProfile, getActiveRules, profileFor } from "../server/pageRules";
import { formatMemories, recordedBy, type SourceMemory } from "../server/storyPages";

const arg = (name: string, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? "" : fallback;
};
const dry = process.argv.includes("--dry");
const proposedPath = arg("proposed");
const outDir = arg("out", "ab-out");
const memoryIds = arg("memories").split(",").filter(Boolean);
const stages = arg("stages", "read_to_me,chapter_book").split(",");
const arms = arg("arms", "current,proposed").split(",");
const concurrency = Number(arg("concurrency", "4"));
// Test-only overrides for the proposed arm: an embellishment rule, and alias rewrites
// in the family cast ("Anna=Mama") so a naming gap in sample data doesn't muddy a voice test.
const embellishmentPath = arg("embellishment-file");
const aliasPairs = arg("alias").split(",").filter(Boolean).map((x) => x.split("=") as [string, string]);

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const proposedBody = proposedPath ? fs.readFileSync(proposedPath, "utf8") : "";
  const active = await getActiveRules();
  const memories = await prisma.memory.findMany({
    where: { id: { in: memoryIds } },
    include: {
      contributor: true,
      interpretation: true,
      transcripts: { orderBy: { createdAt: "desc" }, take: 1 },
      storybook: { include: { child: true } },
    },
  });
  if (memories.length !== memoryIds.length) throw new Error(`Found ${memories.length} of ${memoryIds.length} memories`);

  const jobs: Array<() => Promise<void>> = [];
  for (const m of memories) {
    const source: SourceMemory = {
      id: m.id,
      transcript: m.transcripts[0]?.text ?? "",
      events: m.interpretation?.events ?? "",
      emotions: m.interpretation?.emotions ?? "",
      themes: m.interpretation?.themes ?? "",
      recordedBy: recordedBy(m.contributor),
    };
    const cast = await buildCast([]);
    const family = await buildFamilyCast(m.storybook.child.householdId);
    for (const stage of stages) {
      const profile = profileFor(active.rules, stage);
      const values = {
        child_name: m.storybook.child.displayName,
        reading_level: describeProfile(profile),
        embellishment_rules: EMBELLISHMENT_LEVELS[active.rules.embellishment].rule,
        memories: formatMemories([source]),
        previous_chapters: "(none yet — this is the first chapter)",
        revision_request: "",
        cast: describeCast(cast),
        family_cast: describeFamilyCast(family),
      };
      for (const armName of arms) {
        if (armName === "proposed") {
          if (embellishmentPath) values.embellishment_rules = fs.readFileSync(embellishmentPath, "utf8").trim();
          for (const [from, to] of aliasPairs) values.family_cast = values.family_cast.replace(`Also called: ${from}`, `Also called: ${to}`);
        }
        const label = `${(m.title ?? m.id).replace(/[^a-z0-9]+/gi, "_").slice(0, 30)}__${stage}__${armName}`;
        jobs.push(async () => {
          const override = armName === "proposed" ? { body: proposedBody } : undefined;
          const started = Date.now();
          if (dry) {
            // Build the prompt the way runAiStep does, without calling the model.
            const { getAiInstruction } = await import("../server/aiInstructions");
            const { characterCardValues } = await import("../server/characters");
            const { fillTemplate } = await import("../server/messageTemplates");
            const instruction = await getAiInstruction("page_plan");
            const body = override?.body ?? instruction.body;
            const world = (await getAiInstruction("world")).body;
            const prompt = fillTemplate(body, { ...(await characterCardValues()), ...values, world });
            const unresolved = [...prompt.matchAll(/<([a-z_]+)>/g)].map((x) => x[1]).filter((v) => !["baby_vambie"].includes(v));
            fs.writeFileSync(path.join(outDir, `${label}.prompt.txt`), prompt);
            console.log(`[dry] ${label}: ${prompt.length} chars, unresolved variables: ${unresolved.join(", ") || "none"}`);
            return;
          }
          try {
            const { output, model, prompt } = await runAiStep("page_plan", values, override, [], { trigger: "test" as any, memoryId: m.id, householdId: m.storybook.child.householdId });
            const pages = Array.isArray(output?.pages) ? output.pages : [];
            const result = {
              memory: m.title, memoryId: m.id, stage, arm: armName, model, seconds: Math.round((Date.now() - started) / 1000),
              promptChars: prompt.length, title: output?.title ?? "",
              pages: pages.map((p: any) => ({ text: p?.text ?? "", pictureSize: p?.pictureSize ?? "", storyMoment: p?.storyMoment ?? "", interpretationNote: p?.interpretationNote ?? "" })),
              unresolved: output?.unresolved ?? [],
            };
            fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(result, null, 2));
            console.log(`[done] ${label}: "${result.title}" ${pages.length} pages in ${result.seconds}s`);
          } catch (error: any) {
            console.log(`[fail] ${label}: ${error?.message ?? error}`);
            fs.writeFileSync(path.join(outDir, `${label}.error.txt`), String(error?.stack ?? error));
          }
        });
      }
    }
  }
  // Run with limited concurrency.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) await jobs[next++]();
  }));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
