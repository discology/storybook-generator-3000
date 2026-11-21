import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../server/db";
import { canGenerateChapter, entitlements, grantCredits, refundChapter, reserveChapter, withChapterAdmission } from "../server/entitlements";
import { family, key } from "./fixtures";

const DAY = 86_400_000;
const subscribe = (householdId: string, status: string, extra: object = {}) =>
  prisma.subscription.create({ data: { householdId, planId: "family", status, ...extra } });

test("a family saved before plans existed is never stopped", async () => {
  const { household } = await family({ grandfathered: true });
  for (let i = 0; i < 8; i++) assert.deepEqual(await reserveChapter(household.id, key()), { ok: true, pool: "allowance" });
  const e = await entitlements(household.id);
  assert.equal(e.reason, "grandfathered");
  assert.equal(e.allowance, null);
  assert.equal(e.allowanceUsed, 8);
});

test("a new family gets its first full chapter free, then the paywall", async () => {
  const { household } = await family();
  assert.deepEqual(await canGenerateChapter(household.id), { ok: true, pool: "allowance" });
  assert.deepEqual(await reserveChapter(household.id, key()), { ok: true, pool: "allowance" });
  assert.deepEqual(await reserveChapter(household.id, key()), { ok: false, why: "paywall" });
  assert.deepEqual(await canGenerateChapter(household.id), { ok: false, why: "paywall" });
  // A refused attempt leaves nothing in the ledger.
  assert.equal(await prisma.creditEntry.count({ where: { householdId: household.id } }), 1);
});

test("concurrent requests can't both take the last free chapter", async () => {
  const { household } = await family();
  const results = await Promise.all(Array.from({ length: 20 }, () => reserveChapter(household.id, key())));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => !r.ok && r.why === "paywall").length, 19);
  assert.equal(await prisma.creditEntry.count({ where: { householdId: household.id } }), 1);
});

test("many families reserving at once don't stall each other", async () => {
  const families = await Promise.all(Array.from({ length: 20 }, () => family()));
  const results = await Promise.all(families.map((f) => reserveChapter(f.household.id, key())));
  assert.equal(results.filter((r) => r.ok).length, 20);
});

test("reserving the same key twice spends once; a refund gives it back once", async () => {
  const { household } = await family();
  const k = key();
  assert.equal((await reserveChapter(household.id, k)).ok, true);
  assert.equal((await reserveChapter(household.id, k)).ok, true);
  assert.equal((await entitlements(household.id)).allowanceUsed, 1);
  assert.equal(await refundChapter(household.id, k), true);
  assert.equal(await refundChapter(household.id, k), false);
  assert.equal((await entitlements(household.id)).allowanceUsed, 0);
  await assert.rejects(reserveChapter(household.id, k), /already refunded/);
  assert.equal((await reserveChapter(household.id, key())).ok, true);
});

test("a failed or empty chapter is refunded", async () => {
  const { household } = await family();
  await assert.rejects(withChapterAdmission(household.id, key(), async () => { throw new Error("AI down"); }), /AI down/);
  assert.deepEqual(await withChapterAdmission(household.id, key(), async () => null), { ok: true, value: null });
  assert.equal((await entitlements(household.id)).allowanceUsed, 0);
  const made = await withChapterAdmission(household.id, key(), async (plan) => ({ pages: plan.maxPages }));
  assert.deepEqual(made, { ok: true, value: { pages: 12 } });
  assert.deepEqual(await withChapterAdmission(household.id, key(), async () => "never"), { ok: false, why: "paywall" });
});

test("the Family plan makes 5 chapters a month; extra chapters come from credits", async () => {
  const { household } = await family();
  await subscribe(household.id, "active");
  for (let i = 0; i < 5; i++) assert.deepEqual(await reserveChapter(household.id, key()), { ok: true, pool: "allowance" });
  assert.deepEqual(await reserveChapter(household.id, key()), { ok: false, why: "quota" });
  await grantCredits(household.id, { delta: 1, reason: "admin_comp", refType: "AdminRequest", refId: "r1" });
  assert.deepEqual(await reserveChapter(household.id, key()), { ok: true, pool: "credits" });
  assert.deepEqual(await reserveChapter(household.id, key()), { ok: false, why: "quota" });
  const e = await entitlements(household.id);
  assert.equal(e.credits, 0);
  assert.equal(e.allowanceUsed, 5);
  // Next calendar month the allowance starts over.
  const next = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 2));
  assert.deepEqual(await reserveChapter(household.id, key(), next), { ok: true, pool: "allowance" });
});

test("a refund of a credit-paid chapter goes back to credits", async () => {
  const { household } = await family();
  await reserveChapter(household.id, key());
  await grantCredits(household.id, { delta: 2, reason: "topup", refType: "Test", refId: "t" });
  const k = key();
  assert.deepEqual(await reserveChapter(household.id, k), { ok: true, pool: "credits" });
  assert.equal((await entitlements(household.id)).credits, 1);
  await refundChapter(household.id, k);
  assert.equal((await entitlements(household.id)).credits, 2);
});

test("past due: 7 days of grace on the plan, then credits only", async () => {
  const inGrace = await family();
  await subscribe(inGrace.household.id, "past_due", { pastDueSince: new Date(Date.now() - 6 * DAY) });
  assert.equal((await entitlements(inGrace.household.id)).reason, "past_due_grace");
  assert.deepEqual(await reserveChapter(inGrace.household.id, key()), { ok: true, pool: "allowance" });

  const lapsed = await family();
  await subscribe(lapsed.household.id, "past_due", { pastDueSince: new Date(Date.now() - 8 * DAY) });
  assert.equal((await entitlements(lapsed.household.id)).reason, "credits_only");
  assert.deepEqual(await reserveChapter(lapsed.household.id, key()), { ok: false, why: "past_due" });
  await grantCredits(lapsed.household.id, { delta: 1, reason: "admin_comp", refType: "AdminRequest", refId: "r" });
  assert.deepEqual(await reserveChapter(lapsed.household.id, key()), { ok: true, pool: "credits" });
  assert.deepEqual(await reserveChapter(lapsed.household.id, key()), { ok: false, why: "past_due" });
});

test("a canceled subscription falls back to the free plan", async () => {
  const { household } = await family();
  await subscribe(household.id, "canceled");
  assert.equal((await entitlements(household.id)).planId, "free");
  assert.equal((await reserveChapter(household.id, key())).ok, true);
  assert.deepEqual(await reserveChapter(household.id, key()), { ok: false, why: "paywall" });
});

test("the same grant is only written once", async () => {
  const { household } = await family();
  const a = await grantCredits(household.id, { delta: 1, reason: "referral_reward", refType: "Household", refId: "h1" });
  const b = await grantCredits(household.id, { delta: 1, reason: "referral_reward", refType: "Household", refId: "h1" });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(b.entry.id, a.entry.id);
  assert.equal((await entitlements(household.id)).credits, 1);
  await assert.rejects(grantCredits(household.id, { delta: 0, reason: "admin_comp" }));
});

test("the sample family is never stopped", async () => {
  const { household } = await family();
  await prisma.household.update({ where: { id: household.id }, data: { isSample: true } });
  for (let i = 0; i < 3; i++) assert.equal((await reserveChapter(household.id, key())).ok, true);
});
