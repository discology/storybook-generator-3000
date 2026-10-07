import express, { Router } from "express";
import { prisma } from "./db";
import { getCurrentUser } from "./session";
import { appUrl, getMessageType, getTemplate, fillTemplate } from "./messageTemplates";
import { fromTwilio, optOut, sendText, testPhones, textsMode } from "./texts";

// Twilio's webhooks (delivery status, and STOP/START replies) and the admin's
// view of texts: the mode, a test send, and the log (VSB-9).

const router: Router = express.Router();

const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const START_WORDS = ["START", "UNSTOP", "YES"];

// Twilio reports each text's progress: queued, sent, delivered, undelivered, failed.
router.post("/twilio/status", async (req, res) => {
  if (!fromTwilio(req)) return res.status(403).end();
  const { MessageSid, MessageStatus, ErrorCode } = req.body ?? {};
  if (MessageSid && MessageStatus) {
    const text = await prisma.textMessage.findUnique({ where: { twilioSid: String(MessageSid) } });
    if (text) {
      await prisma.textMessage.update({
        where: { id: text.id },
        data: { status: String(MessageStatus), ...(ErrorCode ? { errorCode: String(ErrorCode) } : {}) },
      });
      if (String(ErrorCode) === "21610" && text.userId) await optOut(text.userId, true);
    }
  }
  res.status(204).end();
});

// Replies to the app's number. Twilio answers STOP, START and HELP itself; the app
// records STOP and START so it stops (or resumes) sending.
router.post("/twilio/inbound", async (req, res) => {
  if (!fromTwilio(req)) return res.status(403).end();
  const word = String(req.body?.Body ?? "").trim().toUpperCase();
  const user = await prisma.user.findUnique({ where: { phone: String(req.body?.From ?? "") } });
  if (user && STOP_WORDS.includes(word)) await optOut(user.id, true);
  if (user && START_WORDS.includes(word)) await optOut(user.id, false);
  res.type("text/xml").send("<Response/>");
});

// --- Admin ---

router.get("/admin/texts", async (_req, res) => {
  const texts = await prisma.textMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true } } },
  });
  res.json({
    mode: textsMode(),
    testRecipients: testPhones().length,
    texts: texts.map(({ user, ...t }) => ({ ...t, recipient: user?.name ?? null })),
  });
});

// Sends one message type, with sample values, to the admin's own phone.
router.post("/admin/messages/:key/test", async (req, res) => {
  const user = await getCurrentUser(req);
  const type = getMessageType(req.params.key);
  if (!user || !type) return res.status(404).json({ error: "Not found" });
  if (textsMode() === "off") return res.status(400).json({ error: "Texting isn't set up on this copy of the app (no Twilio messaging service)." });
  const template = await getTemplate(type.key);
  const samples = Object.fromEntries(type.variables.map((v) => [v.name, v.name.endsWith("_url") ? appUrl("/") : v.sample]));
  const result = await sendText({ event: `test:${type.key}`, to: { userId: user.id, phone: user.phone }, body: fillTemplate(template.body, samples) });
  if (!result.sent) {
    const why: Record<string, string> = {
      opted_out: "Your number replied STOP. Text START to the sending number to get texts again.",
      test_mode: "Your number isn't on the test list.",
      no_phone: "Your account has no phone number.",
      failed: "Twilio didn't accept it. See the log below.",
      off: "Texting isn't set up.",
    };
    return res.status(400).json({ error: why[result.reason] ?? "It didn't send." });
  }
  res.json({ ok: true });
});

export default router;
