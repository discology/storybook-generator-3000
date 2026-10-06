import type { NextFunction, Request, Response } from "express";
import { getCurrentUser } from "./session";
import { normalizePhone } from "./sms";

// Who can open the admin panel: the phone numbers listed in ADMIN_PHONES
// (comma-separated, in .env). Without that setting, anyone signed in can, but
// only in development (the panel shows a warning); in production it stays closed.

const production = () => process.env.NODE_ENV === "production";

const phoneList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((p) => normalizePhone(p))
    .filter((p): p is string => Boolean(p));

const adminPhones = () => phoneList(process.env.ADMIN_PHONES);

export const adminIsOpen = () => adminPhones().length === 0 && !production();

export const isAdmin = (user: { phone: string | null } | null) =>
  Boolean(user) && (adminIsOpen() || (!!user!.phone && adminPhones().includes(user!.phone)));

// Who can start a new storybook. In production it's invite-only unless
// OPEN_SIGNUP=on: admins and the numbers in ALLOWED_PHONES can start one, and
// everyone else joins a family through an invitation link. This keeps strangers
// from running up AI costs.
export const canStartStorybook = (user: { phone: string | null } | null) => {
  if (!user) return false;
  if (!production() || process.env.OPEN_SIGNUP === "on" || isAdmin(user)) return true;
  return !!user.phone && phoneList(process.env.ALLOWED_PHONES).includes(user.phone);
};

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });
  if (!isAdmin(user)) return res.status(403).json({ error: "access_denied" });
  next();
}
