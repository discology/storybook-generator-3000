import "./setup";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../server/db";
import { setRedrawCaps, setSpendCap } from "../server/spendCaps";
import { family, signedInUser } from "./fixtures";
import { settleJob, startServer } from "./server";

// The spend guardrails (#13): a global cap by what started the work, and a
// per-family limit on redraws.

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

const spend = (trigger: string, costUsd: number, extra: Record<string, unknown> = {}) =>
  prisma.aiUsage.create({ data: { kind: "image", step: "page_picture", model: "gpt-image-2.6-sunburst", costUsd, trigger, ...extra } });

test("a $1 visitor cap turns the next preview into a come-back-tomorrow", async () => {
  const started = await send("/api/guest/start", "POST", { childName: "Mira", relationship: "Parent", stage: "born", birthDate: "2024-03-02" });
  assert.equal(started.status, 201, await started.clone().text());
  const cookie = started.headers.get("set-cookie")!.split(";")[0];
  const draft = await prisma.household.findFirstOrThrow({ where: { guestToken: cookie.split("=")[1] }, include: { contributors: true, children: { include: { storybooks: true } } } });
  await prisma.memory.create({
    data: {
      storybookId: draft.children[0].storybooks[0].id,
      contributorId: draft.contributors[0].id,
      title: "The park",
      status: "interpreted",
      storyUseConsent: true,
      transcripts: { create: { source: "typed", text: "We fed the ducks." } },
    },
  });

  // Under the cap, the preview is offered and starts.
  let state = await (await get("/api/guest", cookie)).json();
  assert.equal(state.limits.canPreview, true);

  await setSpendCap("visitor", "daily", 1);
  await spend("visitor", 1.5);
  state = await (await get("/api/guest", cookie)).json();
  assert.equal(state.limits.canPreview, false);
  assert.equal(state.limits.reason, "spent");

  const refused = await send("/api/guest/preview", "POST", {}, cookie);
  assert.equal(refused.status, 429);
  const body = await refused.json();
  assert.equal(body.reason, "spent");
  assert.match(body.error, /tomorrow/);
  // Nothing was started, so the visitor's preview wasn't counted against them.
  assert.equal(await prisma.guestPreview.count(), 0);
  assert.equal(await prisma.chapter.count({ where: { storybookId: draft.children[0].storybooks[0].id } }), 0);

  await setSpendCap("visitor", "daily", null);
});

test("a family cap stops a chapter before anything is reserved", async () => {
  const f = await family({ grandfathered: true });
  const memory = await prisma.memory.create({
    data: { storybookId: f.storybook.id, contributorId: f.me.id, title: "Park", status: "interpreted", storyUseConsent: true, transcripts: { create: { source: "typed", text: "The park" } } },
  });
  await setSpendCap("family", "daily", 1);
  await spend("family", 2, { householdId: f.household.id });

  const home = await (await get(`/api/storybooks/${f.storybook.id}`, f.owner.cookie)).json();
  assert.equal(home.plan.nextChapter.why, "capped");

  const res = await settleJob(server.base, f.owner.cookie, await send(`/api/storybooks/${f.storybook.id}/chapters`, "POST", { memoryIds: [memory.id] }, f.owner.cookie));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).why, "capped");
  assert.equal(await prisma.chapter.count({ where: { storybookId: f.storybook.id } }), 0);
  assert.equal(await prisma.creditEntry.count({ where: { householdId: f.household.id } }), 0);

  // A monthly cap with room left doesn't block on its own.
  await setSpendCap("family", "daily", null);
  await setSpendCap("family", "monthly", 100);
  const allowed = await (await get(`/api/storybooks/${f.storybook.id}`, f.owner.cookie)).json();
  assert.equal(allowed.plan.nextChapter, null);
  await setSpendCap("family", "monthly", null);
});

test("redraws someone asked for are limited; automatic fixes are not", async () => {
  const f = await family({ grandfathered: true });
  const chapter = await prisma.chapter.create({
    data: {
      storybookId: f.storybook.id,
      sequence: 1,
      title: "Ducks",
      content: "Words.",
      status: "published",
      publishedAt: new Date(),
      pages: {
        create: [
          {
            pageNumber: 1, storyMoment: "", characters: "[]", setting: "", visibleAction: "", emotionalTone: "", continuity: "", text: "Words.", interpretationNote: "",
            assets: { create: [{ imagePath: "uploads/pages/a.jpg", status: "ready", version: 1, prompt: "" }] },
          },
        ],
      },
    },
    include: { pages: true },
  });
  const pageId = chapter.pages[0].id;
  await setRedrawCaps(1, 40);
  await spend("family", 0.2, { householdId: f.household.id, chapterId: chapter.id, step: "page_redraw" });

  const refused = await send(`/api/pages/${pageId}/illustration`, "POST", {}, f.owner.cookie);
  assert.equal(refused.status, 429);
  assert.match((await refused.json()).error, /1 redraws/);

  // An automatic character fix isn't the family's choice, so the limit doesn't apply.
  const fix = await send(`/api/pages/${pageId}/illustration`, "POST", { fixCharacterIds: ["c1"] }, f.owner.cookie);
  assert.equal(fix.status, 202);

  // The weekly limit is counted across the family's chapters, not one chapter.
  await setRedrawCaps(50, 1);
  const weekly = await send(`/api/pages/${pageId}/illustration`, "POST", {}, f.owner.cookie);
  assert.equal(weekly.status, 429);
  assert.match((await weekly.json()).error, /this week/);
  await setRedrawCaps(12, 40);
});

test("the Costs page names models that have no price, and saves the caps", async () => {
  const admin = await signedInUser("Admin");
  await spend("admin", 0.4, {});
  await prisma.aiUsage.create({ data: { kind: "text", step: "page_plan", model: "mystery-1", costUsd: 0.5, trigger: "admin", estimated: true } });

  await setSpendCap("visitor", "daily", 40);
  const costs = await (await get("/api/admin/costs", admin.cookie)).json();
  assert.deepEqual(
    costs.unknownModels.map((m: any) => ({ model: m.model, calls: m.calls })),
    [{ model: "mystery-1", calls: 1 }],
    JSON.stringify({ unknown: costs.unknownModels, calls: costs.totals?.calls })
  );
  assert.equal(costs.caps.find((c: any) => c.trigger === "visitor").caps.daily, 40);
  assert.equal(costs.redraws.perChapter, 12);

  const bad = await send("/api/admin/spend-caps", "PUT", { caps: { visitor: { daily: -5, monthly: null } } }, admin.cookie);
  assert.equal(bad.status, 400);
  const saved = await send("/api/admin/spend-caps", "PUT", { caps: { visitor: { daily: 25, monthly: "" } }, redraws: { perChapter: 6, perWeek: 20 } }, admin.cookie);
  assert.equal(saved.status, 200);
  const after = await saved.json();
  const visitor = after.caps.find((c: any) => c.trigger === "visitor");
  assert.deepEqual(visitor.caps, { daily: 25, monthly: null });
  assert.deepEqual(after.redraws, { perChapter: 6, perWeek: 20 });
  await setRedrawCaps(12, 40);
  await setSpendCap("visitor", "daily", null);
});
