import type { NextFunction, Request, Response } from "express";
import { getCurrentUser } from "./session";
import { normalizePhone } from "./sms";

// Who can open the admin panel: the phone numbers listed in ADMIN_PHONES
// (comma-separated, in .env). Without that setting, anyone signed in can,
// which is only meant for local development; the panel shows a warning.

const adminPhones = () =>
  (process.env.ADMIN_PHONES ?? "")
    .split(",")
    .map((p) => normalizePhone(p))
    .filter((p): p is string => Boolean(p));

export const adminIsOpen = () => adminPhones().length === 0;

export const isAdmin = (user: { phone: string | null } | null) =>
  Boolean(user) && (adminIsOpen() || (!!user!.phone && adminPhones().includes(user!.phone)));

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });
  if (!isAdmin(user)) return res.status(403).json({ error: "access_denied" });
  next();
}
