import "./setup";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../server/db";
import { family, signedInUser } from "./fixtures";
import { startServer } from "./server";

// The funnel (#2): a tagged link's visit is counted, its steps join up through
// signup, and the admin panel reads them back by source.

let server: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server?.stop();
  await prisma.$disconnect();
});

const send = (path: string, method: string, body: unknown, cookie = "") =>
  fetch(server.base + path, { method, headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body), redirect: "manual" });

// A visitor arrives from a tagged ad link; the cookie jar for what follows.
async function arrive() {
  const landing = await fetch(`${server.base}/api/guest?utm_source=meta&utm_medium=paid&utm_campaign=spring_launch&fbclid=abc123`, { redirect: "manual" });
  const cookies = landing.headers.getSetCookie().map((c) => c.split(";")[0]);
  const attr = cookies.find((c) => c.startsWith("sb_attr="));
  const vid = cookies.find((c) => c.startsWith("sb_vid="));
  assert.ok(attr, "the tagged landing sets the attribution cookie");
  assert.ok(vid, "every visitor gets an id");
  const parsed = JSON.parse(decodeURIComponent(attr!.split("=").slice(1).join("=")));
  assert.equal(parsed.utm_source, "meta");
  assert.equal(parsed.utm_campaign, "spring_launch");
  assert.equal(parsed.fbclid, "abc123");
  return cookies.join("; ");
}

test("a tagged landing sets first-party cookies; the first tags win", async () => {
  const cookie = await arrive();
  // A later, different tag doesn't replace the first.
  const again = await fetch(`${server.base}/api/guest?utm_source=google&utm_campaign=other`, { headers: { cookie }, redirect: "manual" });
  assert.equal(again.headers.getSetCookie().some((c) => c.startsWith("sb_attr=")), false);
});

test("the visitor's steps join up from landing to their first memory", async () => {
  const cookie = await arrive();
  const started = await send("/api/guest/start", "POST", { childName: "Mira", relationship: "Parent", stage: "born", birthDate: "2024-03-02" }, cookie);
  assert.equal(started.status, 201);
  const guestCookie = started.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("sb_guest="));
  const jar = `${cookie}; ${guestCookie}`;
  const draft = await prisma.household.findFirstOrThrow({ where: { guestToken: guestCookie!.split("=")[1] }, include: { contributors: true, children: { include: { storybooks: true } } } });
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

  // The browser's own step: one per visitor, however often it fires.
  for (let i = 0; i < 2; i++) assert.equal((await send("/api/funnel/events", "POST", { name: "landing_view" }, jar)).status, 204);
  assert.equal((await send("/api/funnel/events", "POST", { name: "subscribed" }, jar)).status, 400, "the browser can only report its own steps");

  const preview = await send("/api/guest/preview", "POST", {}, jar);
  assert.equal(preview.status, 202, await preview.clone().text());

  const events = () => prisma.funnelEvent.findMany({ orderBy: { createdAt: "asc" } });
  let names = (await events()).map((e) => e.name);
  assert.deepEqual(names.filter((n) => n === "landing_view").length, 1, "one landing per visitor");
  assert.ok(names.includes("preview_started"));
  const startedEvent = (await events()).find((e) => e.name === "preview_started")!;
  assert.equal(startedEvent.source, "meta");
  assert.equal(startedEvent.campaign, "spring_launch");
  assert.equal(startedEvent.clickId, "fb:abc123");
  assert.equal(startedEvent.householdId, draft.id);

  // Signing up and saving the draft adds signup and first memory, still under
  // the same visitor.
  const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
  const codeRes = await send("/api/auth/send-code", "POST", { phone }, jar);
  const { devCode } = await codeRes.json();
  const verify = await send("/api/auth/verify", "POST", { phone, code: devCode }, jar);
  assert.equal(verify.status, 200);
  const session = verify.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("sb_session="));
  const claimed = await send("/api/guest/claim", "POST", { name: "Morgan" }, `${jar}; ${session}`);
  assert.equal(claimed.status, 200, await claimed.clone().text());

  names = (await events()).map((e) => e.name);
  for (const step of ["landing_view", "preview_started", "signup_verified", "first_memory_saved"]) assert.ok(names.includes(step), `recorded ${step}`);
  const signup = (await events()).find((e) => e.name === "signup_verified")!;
  assert.equal(signup.visitorId, startedEvent.visitorId, "signup stitches to the same visitor");
  assert.equal(signup.source, "meta");
});

test("the family's first published chapter is recorded once, with their attribution", async () => {
  const f = await family({ grandfathered: true });
  // The family arrived from a tagged link, as its earliest recorded step.
  await prisma.funnelEvent.create({ data: { visitorId: "v-test", householdId: f.household.id, name: "landing_view", source: "newsletter", campaign: "launch" } });
  const chapter = await prisma.chapter.create({
    data: { storybookId: f.storybook.id, sequence: 1, title: "Ducks", content: "Words.", status: "published", publishedAt: new Date() },
  });
  const { recordFirstChapterPublished } = await import("../server/funnel");
  await recordFirstChapterPublished(chapter.id);
  await recordFirstChapterPublished(chapter.id);
  const second = await prisma.chapter.create({
    data: { storybookId: f.storybook.id, sequence: 2, title: "More ducks", content: "Words.", status: "published", publishedAt: new Date() },
  });
  await recordFirstChapterPublished(second.id);
  const events = await prisma.funnelEvent.findMany({ where: { name: "first_chapter_published", householdId: f.household.id } });
  assert.equal(events.length, 1);
  assert.equal(events[0].source, "newsletter", "borrowed the family's own attribution");
  assert.equal(events[0].visitorId, "v-test");
});

test("the admin funnel reads the steps back by source and campaign", async () => {
  const admin = await signedInUser("Admin");
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${server.base}/api/admin/funnel?from=${today}&to=${today}`, { headers: { cookie: admin.cookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  const names = data.steps.map((s: any) => s.name);
  assert.deepEqual(names[0], "landing_view");
  assert.ok(names.includes("subscribed"));
  const meta = data.sources.find((s: any) => s.source === "meta" && s.campaign === "spring_launch");
  assert.ok(meta, "the spring_launch campaign shows up");
  assert.ok(meta.landing >= 1 && meta.preview >= 1 && meta.signup >= 1, JSON.stringify({ meta, sources: data.sources, all: await prisma.funnelEvent.findMany({ select: { name: true, visitorId: true, source: true, campaign: true, createdAt: true } }) }));
  // Out of range reads nothing.
  const empty = await (await fetch(`${server.base}/api/admin/funnel?from=2020-01-01&to=2020-01-02`, { headers: { cookie: admin.cookie } })).json();
  assert.ok(empty.steps.every((s: any) => s.events === 0));
});
