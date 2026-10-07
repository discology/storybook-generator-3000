import crypto from "crypto";
import type { Request } from "express";
import { prisma } from "./db";
import { adminPhones, phoneList } from "./admin";
import { appUrl } from "./messageTemplates";

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

export interface TextRequest {
  event: string;
  to: { userId?: string | null; phone: string | null };
  body: string;
  householdId?: string | null;
}

export type TextResult = { sent: true } | { sent: false; reason: "off" | "no_phone" | "opted_out" | "test_mode" | "failed" };

export async function sendText(request: TextRequest): Promise<TextResult> {
  const mode = textsMode();
  if (mode === "off") return { sent: false, reason: "off" };
  const phone = request.to.phone;
  if (!phone) return { sent: false, reason: "no_phone" };
  const body = branded(request.body);
  try {
    const user = request.to.userId ? await prisma.user.findUnique({ where: { id: request.to.userId } }) : null;
    const base = { event: request.event, userId: user?.id ?? null, householdId: request.householdId ?? null, toMasked: maskPhone(phone), body };
    if (user?.textsOptedOut) {
      await prisma.textMessage.create({ data: { ...base, status: "skipped", skipReason: "opted_out" } });
      return { sent: false, reason: "opted_out" };
    }
    if (mode === "test" && !testPhones().includes(phone)) {
      await prisma.textMessage.create({ data: { ...base, status: "skipped", skipReason: "test_mode" } });
      return { sent: false, reason: "test_mode" };
    }

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID } = process.env;
    const params = new URLSearchParams({ MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID!, To: phone, Body: body });
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
      await prisma.textMessage.create({
        data: { ...base, status: "failed", errorCode: String(data?.code ?? response.status), errorMessage: String(data?.message ?? "").slice(0, 300) },
      });
      return { sent: false, reason: "failed" };
    }
    await prisma.textMessage.create({ data: { ...base, status: data.status ?? "queued", twilioSid: data.sid } });
    return { sent: true };
  } catch (error: any) {
    console.error(`Text "${request.event}" failed:`, error?.message);
    return { sent: false, reason: "failed" };
  }
}

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
      .updateMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_WORDING_MS) }, body: { not: null } }, data: { body: null } })
      .catch((e) => console.error("Text cleanup:", e?.message));
  setTimeout(run, 60_000);
  setInterval(run, 60 * 60 * 1000);
}
