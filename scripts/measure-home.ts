// Measures GET /api/storybooks/:id for a 3-year family (150 chapters x 10
// pages, 1,000 memories) on a scratch database. Run from the repo root:
//   npx tsx scripts/measure-home.ts
// Prints the response size and p50/p99 over 50 sequential requests.
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vambie-measure-"));
process.env.DATABASE_URL = `file:${path.join(dir, "measure.db")}`;
execFileSync("npx", ["prisma", "migrate", "deploy"], { env: process.env, stdio: "ignore" });
const { prisma } = await import("../server/db");

const user = await prisma.user.create({ data: { name: "Parent", phone: "+15555550199" } });
const token = crypto.randomBytes(32).toString("hex");
await prisma.session.create({ data: { userId: user.id, token, expiresAt: new Date(Date.now() + 86_400_000) } });
const household = await prisma.household.create({ data: { ownerUserId: user.id } });
const child = await prisma.child.create({ data: { householdId: household.id, displayName: "Theo", stage: "born", birthDate: new Date("2023-01-01") } });
const storybook = await prisma.storybook.create({ data: { childId: child.id, title: "Theo's story", status: "active" } });
const me = await prisma.contributor.create({ data: { householdId: household.id, userId: user.id, name: "Parent", role: "owner", relationship: "Mom" } });
const words = "We went to the park and the ducks followed us all the way home. ".repeat(24);
await prisma.memory.createMany({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `mem${i}`, storybookId: storybook.id, contributorId: me.id, title: `Memory ${i}`, status: "ready", storyUseConsent: true })) });
await prisma.transcriptVersion.createMany({ data: Array.from({ length: 1000 }, (_, i) => ({ memoryId: `mem${i}`, source: "recorded", text: words })) });
for (let c = 0; c < 150; c++) {
  await prisma.chapter.create({
    data: {
      storybookId: storybook.id, sequence: c + 1, title: `Chapter ${c + 1}`, content: "A page of the story. ".repeat(40), status: "published", publishedAt: new Date(),
      pages: { create: Array.from({ length: 10 }, (_, p) => ({ pageNumber: p + 1, storyMoment: "", characters: "[]", setting: "", visibleAction: "", emotionalTone: "", continuity: "", text: "Words.", interpretationNote: "", approvedAt: new Date(), assets: { create: [{ imagePath: `uploads/pages/c${c}p${p}.jpg`, status: "ready", version: 1, prompt: "" }] } })) },
    },
  });
}
await prisma.$disconnect();

const port = 3900 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, ["--import", "tsx", "server.ts"], { env: { ...process.env, PORT: String(port), NODE_ENV: "test" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
try {
  for (let i = 0; !(await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)); i++) {
    if (i > 150) throw new Error("server didn't start");
    await new Promise((r) => setTimeout(r, 100));
  }
  const times: number[] = [];
  let bytes = 0;
  for (let i = 0; i < 50; i++) {
    const t = performance.now();
    const res = await fetch(`${base}/api/storybooks/${storybook.id}`, { headers: { cookie: `sb_session=${token}`, "accept-encoding": "identity" } });
    const body = await res.text();
    times.push(performance.now() - t);
    if (res.status !== 200) throw new Error(`status ${res.status}: ${body.slice(0, 200)}`);
    bytes = Buffer.byteLength(body);
  }
  times.sort((a, b) => a - b);
  const pct = (p: number) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))].toFixed(0);
  console.log(`home response: ${(bytes / 1024).toFixed(0)} KB; p50 ${pct(50)} ms, p99 ${pct(99)} ms (50 sequential requests)`);
} finally {
  server.kill("SIGTERM");
  fs.rmSync(dir, { recursive: true, force: true });
}
