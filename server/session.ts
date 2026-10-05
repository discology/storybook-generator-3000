import crypto from "crypto";
import type { Request } from "express";
import { prisma } from "./db";

export const SESSION_COOKIE = "sb_session";

export function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function getCurrentUser(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}
