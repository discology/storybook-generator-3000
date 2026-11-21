import "./setup";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../server/db";
import { reserveChapter } from "../server/entitlements";
import { family, joinAsRelative, key, signedInUser } from "./fixtures";
import { settleJob, startServer } from "./server";

let server: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server?.stop();
  await prisma.$disconnect();
});

const get = (path: string, cookie = "") => fetch(server.base + path, { headers: { cookie }, redirect: "manual" });
const send = (path: string, method: string, body: unknown, cookie = "") =>
  fetch(server.base + path, { method, headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body), redirect: "manual" });

// The family that couldn't open its home screen (GitHub #22), and the 2.4 MB
// response (#29): 150 chapters of 10 pages and 1,000 memories.
test("a long-running family's home loads, without every transcript", async () => {
  const f = await family({ grandfathered: true });
  const words = "We went to the park and the ducks followed us all the way home. ".repeat(24);
  await prisma.memory.createMany({
    data: Array.from({ length: 1000 }, (_, i) => ({ id: `mem${i}`, storybookId: f.storybook.id, contributorId: f.me.id, title: `Memory ${i}`, status: "ready", storyUseConsent: true })),
  });
  await prisma.transcriptVersion.createMany({
    data: Array.from({ length: 1000 }, (_, i) => ({ memoryId: `mem${i}`, source: "typed", text: `${words} needle${i === 7 ? "zebra" : ""}` })),
  });
  for (let c = 0; c < 150; c++) {
    await prisma.chapter.create({
      data: {
        storybookId: f.storybook.id,
        sequence: c + 1,
        title: `Chapter ${c + 1}`,
        content: "A page of the story. ".repeat(40),
        status: "published",
        publishedAt: new Date(),
        pages: {
          create: Array.from({ length: 10 }, (_, p) => ({
            pageNumber: p + 1, storyMoment: "", characters: "[]", setting: "", visibleAction: "", emotionalTone: "", continuity: "", text: "Words.", interpretationNote: "",
            approvedAt: new Date(),
            assets: { create: [{ imagePath: `uploads/pages/c${c}p${p}.jpg`, status: "ready", version: 1, prompt: "" }] },
          })),
        },
      },
    });
  }
  const started = Date.now();
  const res = await get(`/api/storybooks/${f.storybook.id}`, f.owner.cookie);
  const ms = Date.now() - started;
  const body = await res.text();
  assert.equal(res.status, 200, body.slice(0, 300));
  const data = JSON.parse(body);
  assert.equal(data.chapters.length, 150);
  assert.equal(data.memories.length, 1000);
  assert.ok(data.chapters.every((c: any) => c.cover), "every chapter has its cover");
  assert.equal("words" in data.memories[0], false);
  assert.ok(data.memories[0].excerpt.length <= 220);
  console.log(`home response: ${(body.length / 1024).toFixed(0)} KB in ${ms} ms`);
  assert.ok(body.length < 1_200_000, `home response is ${body.length} bytes`);

  // Full words are still searchable, past the excerpt.
  const search = await (await get(`/api/storybooks/${f.storybook.id}/memories/search?q=needlezebra`, f.owner.cookie)).json();
  assert.deepEqual(search.ids, ["mem7"]);
});

test("search never returns a memory the reader can't see", async () => {
  const f = await family();
  const relative = await joinAsRelative(f.household.id);
  const memory = await prisma.memory.create({ data: { storybookId: f.storybook.id, contributorId: f.me.id, title: "Private", visibility: "private", transcripts: { create: { source: "typed", text: "secret pineapple" } } } });
  const mine = await (await get(`/api/storybooks/${f.storybook.id}/memories/search?q=pineapple`, f.owner.cookie)).json();
  assert.deepEqual(mine.ids, [memory.id]);
  const theirs = await (await get(`/api/storybooks/${f.storybook.id}/memories/search?q=pineapple`, relative.cookie)).json();
  assert.deepEqual(theirs.ids, []);
  assert.equal((await get(`/api/storybooks/${f.storybook.id}/memories/search?q=pineapple`)).status, 401);
});

test("the owner's home says why the next chapter can't be made", async () => {
  const f = await family();
  let home = await (await get(`/api/storybooks/${f.storybook.id}`, f.owner.cookie)).json();
  assert.equal(home.plan.reason, "free");
  assert.equal(home.plan.nextChapter, null);
  await reserveChapter(f.household.id, key());
  home = await (await get(`/api/storybooks/${f.storybook.id}`, f.owner.cookie)).json();
  assert.equal(home.plan.nextChapter.why, "paywall");
  const relative = await joinAsRelative(f.household.id);
  const theirs = await (await get(`/api/storybooks/${f.storybook.id}`, relative.cookie)).json();
  assert.equal(theirs.plan, null);
});

test("past the free chapter, making a chapter answers 402 and spends nothing", async () => {
  const f = await family();
  await reserveChapter(f.household.id, key());
  const memory = await prisma.memory.create({ data: { storybookId: f.storybook.id, contributorId: f.me.id, title: "Park", status: "interpreted", storyUseConsent: true, transcripts: { create: { source: "typed", text: "The park" } } } });
  const res = await settleJob(server.base, f.owner.cookie, await send(`/api/storybooks/${f.storybook.id}/chapters`, "POST", { memoryIds: [memory.id] }, f.owner.cookie));
  assert.equal(res.status, 402);
  assert.equal((await res.json()).why, "paywall");
  const weekly = await send(`/api/storybooks/${f.storybook.id}/chapters/weekly`, "POST", {}, f.owner.cookie);
  assert.equal(weekly.status, 402);
  assert.equal(await prisma.chapter.count({ where: { storybookId: f.storybook.id } }), 0);
  assert.equal(await prisma.creditEntry.count({ where: { householdId: f.household.id } }), 1);
});

test("an admin comp is one chapter however often it's sent", async () => {
  const f = await family();
  const admin = await signedInUser("Admin");
  const comp = () => send(`/api/admin/households/${f.household.id}/credits`, "POST", { delta: 1, note: "Sorry about the pictures", requestId: "click-1" }, admin.cookie);
  const first = await comp();
  assert.equal(first.status, 201);
  const again = await comp();
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { created: false, credits: 1 });
  const plan = await (await get(`/api/admin/households/${f.household.id}/plan`, admin.cookie)).json();
  assert.equal(plan.plan.credits, 1);
  assert.equal(plan.ledger.length, 1);
});

test("a family's referral link credits the family that starts from it", async () => {
  const referrer = await family({ grandfathered: true });
  const relative = await joinAsRelative(referrer.household.id);
  const { code, url } = await (await get(`/api/storybooks/${referrer.storybook.id}/referral`, relative.cookie)).json();
  assert.match(code, /^[a-z0-9]{8}$/);
  assert.ok(url.endsWith(`/r/${code}`));
  // Same code every time.
  assert.equal((await (await get(`/api/storybooks/${referrer.storybook.id}/referral`, referrer.owner.cookie)).json()).code, code);

  const landing = await get(`/r/${code}`);
  assert.equal(landing.status, 302);
  assert.equal(landing.headers.get("location"), `/try?ref=${code}`);
  const refCookie = landing.headers.get("set-cookie")!.split(";")[0];
  assert.equal(refCookie, `sb_ref=${code}`);
  const unknown = await get(`/r/zzzzzzzz`);
  assert.equal(unknown.headers.get("location"), "/try");
  assert.equal(unknown.headers.get("set-cookie"), null);

  // The relative starts a storybook for their own child.
  const setup = { childName: "Theo", parentName: "Grandma", relationship: "Parent", parentPhone: "+15555550100", stage: "born", birthDate: "2025-01-01" };
  const created = await send(`/api/storybooks`, "POST", setup, `${relative.cookie}; ${refCookie}`);
  assert.equal(created.status, 201, await created.clone().text());
  const newFamily = await prisma.household.findFirstOrThrow({ where: { ownerUserId: relative.user.id } });
  assert.equal(newFamily.referredByHouseholdId, referrer.household.id);
  assert.equal(newFamily.grandfathered, false);

  // The referring family's owner starting another storybook isn't a referral.
  await send(`/api/storybooks`, "POST", { ...setup, childName: "Ada" }, `${referrer.owner.cookie}; ${refCookie}`);
  const own = await prisma.household.findFirstOrThrow({ where: { ownerUserId: referrer.owner.user.id, id: { not: referrer.household.id } } });
  assert.equal(own.referredByHouseholdId, null);

  const admin = await signedInUser("Admin");
  const report = await (await get(`/api/admin/referrals`, admin.cookie)).json();
  const row = report.families.find((r: any) => r.householdId === referrer.household.id);
  assert.equal(row.referralSignups, 1);
  assert.ok(report.totals.referralSignups >= 1);
});
