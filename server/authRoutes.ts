import express, { Router } from "express";
import { prisma } from "./db";
import { SESSION_COOKIE, generateOtp, generateToken, getCurrentUser } from "./session";
import { adminIsOpen, canStartStorybook, isAdmin } from "./admin";
import { isSmsConfigured, normalizePhone, sendVerificationCode, checkVerificationCode } from "./sms";

const router: Router = express.Router();

const INVALID_PHONE = "Enter a full mobile number, like +1 555 123 4567.";
const ACCEPT_SOURCES = ["sign-in", "text-when-ready"];

// With Twilio configured, Twilio Verify texts and checks the code. Otherwise
// dev mode: the code is stored locally and returned in the response instead.
// Dev mode never runs in production, where it would let anyone sign in as anyone.
const production = process.env.NODE_ENV === "production";
router.post("/auth/send-code", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  if (!phone) return res.status(400).json({ error: INVALID_PHONE });

  if (isSmsConfigured()) {
    const result = await sendVerificationCode(phone);
    if (!result.ok) return res.status(502).json({ error: result.error });
    return res.json({ sent: true, devMode: false });
  }

  if (production) return res.status(503).json({ error: "Sign-in isn't available right now. Try again later." });

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.otpCode.create({ data: { phone, code, expiresAt } });
  res.json({ sent: true, devMode: true, devCode: code });
});

router.post("/auth/verify", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  const code = String(req.body?.code ?? "").trim();
  if (!phone) return res.status(400).json({ error: INVALID_PHONE });
  if (!code) return res.status(400).json({ error: "Enter the code we texted you." });
  const mismatch = "That code didn't match. Check it and try again.";

  if (isSmsConfigured()) {
    if (!(await checkVerificationCode(phone, code))) return res.status(400).json({ error: mismatch });
  } else {
    const otp = await prisma.otpCode.findFirst({
      where: { phone, code, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) return res.status(400).json({ error: mismatch });
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  }

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) user = await prisma.user.create({ data: { phone } });

  // The consent note and Terms were shown where the number was entered.
  const accepted = req.body?.accepted;
  if (typeof accepted?.terms === "string" && ACCEPT_SOURCES.includes(accepted?.source)) {
    const now = new Date();
    user = await prisma.user.update({
      where: { id: user.id },
      data: { termsVersion: accepted.terms.slice(0, 20), termsAcceptedAt: now, smsConsentAt: now, smsConsentSource: accepted.source },
    });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId: user.id, token, expiresAt } });

  res.cookie(SESSION_COOKIE, token, { httpOnly: true, expires: expiresAt, sameSite: "lax", secure: production });
  res.json({ user });
});

router.get("/auth/me", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in" });
  res.json({
    user: { id: user.id, phone: user.phone, name: user.name, isAdmin: isAdmin(user), canStart: canStartStorybook(user) },
    adminOpen: adminIsOpen(),
  });
});

router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { token } });
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

export default router;
