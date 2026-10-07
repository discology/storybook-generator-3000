// Makes one example chapter in the local app from a memory given as JSON, with
// pictures drawn in this process (so dev-server restarts can't interrupt them).
//   npx tsx prisma/makeExampleChapter.ts --memory-json file --storybook id --contributor id [--alias Name=Alias]
import "dotenv/config";
import fs from "fs";
import { prisma } from "../server/db";
import { createPagedChapter } from "../server/storyPages";
import { getAiStep } from "../server/aiInstructions";

const arg = (n: string, d = "") => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] ?? "" : d; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const m = JSON.parse(fs.readFileSync(arg("memory-json"), "utf8"));
  const storybookId = arg("storybook"); const contributorId = arg("contributor");

  // A saved Plan pages row that is a verbatim copy of an earlier default would
  // shadow the current one; refresh it to the current default (same intent).
  const step = getAiStep("page_plan")!;
  const saved = await prisma.aiInstruction.findUnique({ where: { key: "page_plan" } });
  if (saved && saved.body !== step.defaultBody) {
    await prisma.aiInstruction.update({ where: { key: "page_plan" }, data: { body: step.defaultBody } });
    console.log("Plan pages: saved copy refreshed to the current default");
  }
  for (const pair of arg("alias").split(",").filter(Boolean)) {
    const [name, alias] = pair.split("=");
    const fc = await prisma.familyCharacter.findFirst({ where: { name } });
    if (fc) {
      const aliases: string[] = JSON.parse(fc.aliases || "[]");
      if (!aliases.includes(alias)) { await prisma.familyCharacter.update({ where: { id: fc.id }, data: { aliases: JSON.stringify([alias, ...aliases]) } }); console.log(`${name}: alias "${alias}" added`); }
    }
  }

  const memory = await prisma.memory.create({
    data: {
      storybookId, contributorId, title: m.title, visibility: "contributor_only", storyUseConsent: true, status: "ready",
      promptText: "What would you like to remember?",
      transcripts: { create: { source: "machine", text: m.transcript } },
      interpretation: { create: { events: m.events, emotions: m.emotions, themes: m.themes, isMock: false } },
    },
    include: { contributor: true },
  });
  console.log("memory created:", memory.id, "recorded by", memory.contributor.name);

  const started = Date.now();
  const chapter = await createPagedChapter({
    storybookId, castKeys: [],
    memories: [{ id: memory.id, transcript: m.transcript, events: m.events, emotions: m.emotions, themes: m.themes, recordedBy: `${memory.contributor.name} (${memory.contributor.relationship})` }],
  });
  const id = (chapter as any).id ?? (chapter as any).chapter?.id;
  console.log(`chapter planned in ${Math.round((Date.now() - started) / 1000)}s: ${id}`);
  console.log(`pages:   http://localhost:5174/storybooks/${storybookId}/chapters/${id}/pages`);
  console.log(`reader:  http://localhost:5174/storybooks/${storybookId}/read/${id}`);

  // Wait for the pictures, which draw in this process.
  for (let i = 0; i < 80; i++) {
    const ch = await prisma.chapter.findUnique({ where: { id }, include: { pages: { include: { assets: true }, orderBy: { pageNumber: "asc" } } } });
    const summary = ch!.pages.map((p) => { const a = p.assets.sort((x, y) => y.version - x.version)[0]; return `${p.pageNumber}:${p.pictureSize === "none" ? "text" : a?.status ?? "queued"}`; }).join(" ");
    console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${ch!.pagesStatus} | ${summary}`);
    if (ch!.pagesStatus !== "illustrating") break;
    await sleep(15000);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
