import crypto from "crypto";
import type { Request } from "express";
import { prisma } from "./db";
import { adminPhones, phoneList } from "./admin";
import { appUrl } from "./messageTemplates";
import { TIMEZONES, zonedParts, zonedToUtc } from "./weeklyChapters";
import type { User } from "../src/generated/prisma/client";

// Texts from the app (VSB-9), sent through a Twilio Messaging Service and logged
// with Twilio's delivery status. A text never breaks the action that sent it.
//
// Who gets them:
//   off   no TWILIO_MESSAGING_SERVICE_SID: nothing is sent, and the app keeps
//         showing messages for people to send themselves.
//   test  the default once a service is set: only admins (ADMIN_PHONES) and
//         TEXT_TEST_PHONES get texts; anyone else is logged as skipped. Used while
//         the Vambie Storybook campaign is in review (VSB-8).
//   live  TEXTS_MODE=live: everyone who hasn't opted out.
//
// Each person also has their own Text messages settings (VSB-138): which kinds of
// text they get, and quiet hours that hold texts until morning.

export type TextsMode = "off" | "test" | "live";

export function textsMode(): TextsMode {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_MESSAGING_SERVICE_SID) return "off";
  return process.env.TEXTS_MODE === "live" ? "live" : "test";
}

export const testPhones = () => [...new Set([...adminPhones(), ...phoneList(process.env.TEXT_TEST_PHONES)])];

// Carriers expect every text to name who it's from.
const BRAND = "Vambie Storybook";
export const branded = (body: string) => (body.startsWith(`${BRAND}:`) ? body : `${BRAND}: ${body}`);

export const maskPhone = (phone: string) => `•••${phone.slice(-4)}`;

// Twilio can only report delivery to a public address.
const statusCallback = () => (/^https:\/\//.test(process.env.APP_URL ?? "") ? appUrl("/api/twilio/status") : null);

// Which switch on the Text messages page covers each text (VSB-138).
export const TEXT_KINDS: Record<string, "textNewChapters" | "textFromFamily" | "textFamilyNews" | "textFixes"> = {
  chapter_ready: "textNewChapters",
  page_added: "textNewChapters",
  chapter_shared: "textFromFamily",
  question_asked: "textFromFamily",
  member_joined: "textFamilyNews",
  new_link_requested: "textFamilyNews",
  pictures_failed: "textFixes",
  transcription_failed: "textFixes",
};
// Things the person asked to be texted about: no switch on the page stops them.
const ASKED_FOR = new Set(["export_ready", "story_ready"]);
// Never held for quiet hours: the reminder keeps the time the parent picked, the
// welcome comes right after they make a storybook, and the rest they asked for.
const NEVER_HELD = new Set(["reminder", "welcome", ...ASKED_FOR]);
const isTest = (event: string) => event.startsWith("test:");

type TextPrefs = Pick<User, "textsPaused" | "textNewChapters" | "textFromFamily" | "textFamilyNews" | "textFixes" | "quietHours" | "quietStart" | "quietEnd" | "textTimezone">;

// Whether the person turned this text off on their Text messages page.
export function turnedOff(prefs: TextPrefs, event: string) {
  if (isTest(event) || ASKED_FOR.has(event)) return false;
  if (prefs.textsPaused) return true;
  const kind = TEXT_KINDS[event];
  return kind ? !prefs[kind] : false;
}

const minutesOf = (time: string, fallback: number) => {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
};

// When the person's quiet hours end, if this text would arrive during them;
// otherwise null.
export function quietUntil(prefs: TextPrefs, event: string, now = new Date()): Date | null {
  if (!prefs.quietHours || NEVER_HELD.has(event) || isTest(event)) return null;
  const start = minutesOf(prefs.quietStart, 21 * 60);
  const end = minutesOf(prefs.quietEnd, 8 * 60);
  if (start === end) return null;
  const tz = TIMEZONES[prefs.textTimezone] ?? TIMEZONES["Pacific Time"];
  const local = zonedParts(now, tz);
  const minute = local.hour * 60 + local.minute;
  const quiet = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (!quiet) return null;
  // Late evening: they end tomorrow morning. Early morning: later today.
  const day = new Date(Date.UTC(local.year, local.month - 1, local.day + (minute >= end ? 1 : 0)));
  return zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Math.floor(end / 60), tz, end % 60);
}

// The private link to someone's Text messages page (no sign-in needed), made the
// first time a text needs it.
export async function textSettingsLink(user: Pick<User, "id" | "textSettingsKey">) {
  let key = user.textSettingsKey;
  if (!key) {
    await prisma.user.updateMany({ where: { id: user.id, textSettingsKey: null }, data: { textSettingsKey: crypto.randomBytes(9).toString("base64url") } });
    key = (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { textSettingsKey: true } })).textSettingsKey;
  }
  return appUrl(`/t/${key}`);
}

// <subscription_preferences> is left in the wording by renderMessage, because the
// same wording goes to several people: each gets their own link here.
export const SETTINGS_LINK = "<subscription_preferences>";
async function withSettingsLink(body: string, user: Pick<User, "id" | "textSettingsKey"> | null) {
  if (!body.includes(SETTINGS_LINK)) return body;
  const link = user ? await textSettingsLink(user) : appUrl("/storybooks");
  return body.split(SETTINGS_LINK).join(link);
}

export interface TextRequest {
  event: string;
  to: { userId?: string | null; phone: string | null };
  body: string;
  householdId?: string | null;
}

export type TextResult =
  | { sent: true }
  | { sent: false; reason: "off" | "no_phone" | "opted_out" | "turned_off" | "test_mode" | "failed" | "held" };

type TextRow = { event: string; userId: string | null; householdId: string | null; toMasked: string; body: string };

// Posts the text to Twilio and records the outcome on the log row.
async function deliver(phone: string, user: User | null, row: TextRow, save: (data: Record<string, unknown>) => Promise<unknown>): Promise<TextResult> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID } = process.env;
  const params = new URLSearchParams({ MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID!, To: phone, Body: row.body });
  const callback = statusCallback();
  if (callback) params.set("StatusCallback", callback);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    // 21610: the person replied STOP to this sender.
    if (data?.code === 21610 && user) await optOut(user.id, true);
    await save({ ...row, status: "failed", errorCode: String(data?.code ?? response.status), errorMessage: String(data?.message ?? "").slice(0, 300) });
    return { sent: false, reason: "failed" };
  }
  await save({ ...row, status: data.status ?? "queued", twilioSid: data.sid });
  return { sent: true };
}

// The checks every text goes through, in order: texting set up, a number, STOP,
// the person's own settings, test mode, then quiet hours. A held text comes back
// through here (with `heldId`) when quiet hours end, so it's checked again then.
async function route(request: TextRequest, heldId?: string): Promise<TextResult> {
  const save = (data: Record<string, unknown>) =>
    heldId ? prisma.textMessage.update({ where: { id: heldId }, data }) : prisma.textMessage.create({ data: data as any });
  const mode = textsMode();
  if (mode === "off") {
    if (heldId) await save({ status: "failed", errorMessage: "Texting was turned off before it could send." });
    return { sent: false, reason: "off" };
  }
  const user = request.to.userId ? await prisma.user.findUnique({ where: { id: request.to.userId } }) : null;
  const phone = heldId ? user?.phone ?? null : request.to.phone;
  if (!phone) {
    if (heldId) await save({ status: "failed", errorMessage: "No phone number any more." });
    return { sent: false, reason: "no_phone" };
  }
  const row: TextRow = {
    event: request.event,
    userId: user?.id ?? null,
    householdId: request.householdId ?? null,
    toMasked: maskPhone(phone),
    body: branded(await withSettingsLink(request.body, user)),
  };
  if (user?.textsOptedOut) {
    await save({ ...row, status: "skipped", skipReason: "opted_out" });
    return { sent: false, reason: "opted_out" };
  }
  if (user && turnedOff(user, request.event)) {
    await save({ ...row, status: "skipped", skipReason: "turned_off" });
    return { sent: false, reason: "turned_off" };
  }
  if (mode === "test" && !testPhones().includes(phone)) {
    await save({ ...row, status: "skipped", skipReason: "test_mode" });
    return { sent: false, reason: "test_mode" };
  }
  const until = user && !heldId ? quietUntil(user, request.event) : null;
  if (until) {
    await save({ ...row, status: "held", sendAfter: until });
    return { sent: false, reason: "held" };
  }
  return deliver(phone, user, row, save);
}

export async function sendText(request: TextRequest): Promise<TextResult> {
  if (textsMode() === "off") return { sent: false, reason: "off" };
  if (!request.to.phone) return { sent: false, reason: "no_phone" };
  try {
    return await route(request);
  } catch (error: any) {
    console.error(`Text "${request.event}" failed:`, error?.message);
    return { sent: false, reason: "failed" };
  }
}

// Sends texts whose quiet hours have ended, checking the person's settings again.
export async function sendHeldTexts() {
  // A send cut off by a restart goes back in line.
  await prisma.textMessage.updateMany({ where: { status: "sending", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: "held" } });
  const due = await prisma.textMessage.findMany({ where: { status: "held", sendAfter: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: 50 });
  for (const text of due) {
    // Claimed first, so two ticks can't send it twice.
    const claimed = await prisma.textMessage.updateMany({ where: { id: text.id, status: "held" }, data: { status: "sending" } });
    if (!claimed.count || !text.body || !text.userId) continue;
    try {
      await route({ event: text.event, to: { userId: text.userId, phone: null }, body: text.body, householdId: text.householdId }, text.id);
    } catch (error: any) {
      console.error(`Held text "${text.event}" failed:`, error?.message);
      await prisma.textMessage.update({ where: { id: text.id }, data: { status: "failed", errorMessage: String(error?.message ?? "").slice(0, 300) } }).catch(() => undefined);
    }
  }
}

export function startHeldTexts() {
  const run = () => void sendHeldTexts().catch((e) => console.error("Held texts:", e?.message));
  setTimeout(run, 30_000);
  setInterval(run, 60_000);
}

// The storybook's owner (the parent) with their number, for texts about events in
// their family, plus the child's and storybook's names for the wording.
export async function storybookOwner(storybookId: string) {
  const storybook = await prisma.storybook.findUnique({
    where: { id: storybookId },
    include: { child: { include: { household: { include: { contributors: { where: { role: "owner", inviteStatus: "joined" }, include: { user: true } } } } } } },
  });
  if (!storybook) return null;
  const owner = storybook.child.household.contributors[0];
  return {
    storybook,
    child: storybook.child,
    householdId: storybook.child.householdId,
    ownerName: owner?.name ?? "",
    to: { userId: owner?.user?.id ?? null, phone: owner?.user?.phone ?? null },
  };
}

// Someone's first storybook in a household (what family links point at).
export const householdStorybook = async (householdId: string) =>
  prisma.storybook.findFirst({ where: { child: { householdId } }, include: { child: true }, orderBy: { createdAt: "asc" } });

export const optOut = (userId: string, out: boolean) =>
  prisma.user.update({ where: { id: userId }, data: { textsOptedOut: out, textsOptedOutAt: out ? new Date() : null } });

// Twilio signs its webhooks with the account's auth token: an HMAC-SHA1 of the
// public URL it called plus the sorted form fields.
export function fromTwilio(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.get("X-Twilio-Signature");
  if (!token || !signature) return false;
  const fields = (req.body ?? {}) as Record<string, string>;
  const payload = Object.keys(fields)
    .sort()
    .reduce((acc, key) => acc + key + fields[key], appUrl(req.originalUrl));
  const expected = crypto.createHmac("sha1", token).update(Buffer.from(payload, "utf-8")).digest("base64");
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// The wording of a text is kept for 30 days; after that only the event and status.
const KEEP_WORDING_MS = 30 * 24 * 60 * 60 * 1000;
export function startTextCleanup() {
  const run = () =>
    prisma.textMessage
      .updateMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_WORDING_MS) }, body: { not: null }, status: { notIn: ["held", "sending"] } }, data: { body: null } })
      .catch((e) => console.error("Text cleanup:", e?.message));
  setTimeout(run, 60_000);
  setInterval(run, 60 * 60 * 1000);
}
