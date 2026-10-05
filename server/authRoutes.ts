import express, { Router } from "express";
import { prisma } from "./db";
import { SESSION_COOKIE, generateOtp, generateToken, getCurrentUser } from "./session";
import { isSmsConfigured, normalizePhone, sendVerificationCode, checkVerificationCode } from "./sms";

const router: Router = express.Router();

const INVALID_PHONE = "Enter a full mobile number, like +1 555 123 4567.";

// With Twilio configured, Twilio Verify texts and checks the code. Otherwise
// dev mode: the code is stored locally and returned in the response instead.
router.post("/auth/send-code", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  if (!phone) return res.status(400).json({ error: INVALID_PHONE });

  if (isSmsConfigured()) {
    const result = await sendVerificationCode(phone);
    if (!result.ok) return res.status(502).json({ error: result.error });
    return res.json({ sent: true, devMode: false });
  }

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

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId: user.id, token, expiresAt } });

  res.cookie(SESSION_COOKIE, token, { httpOnly: true, expires: expiresAt, sameSite: "lax" });
  res.json({ user });
});

router.get("/auth/me", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in" });
  res.json({ user });
});

router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { token } });
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

export default router;
