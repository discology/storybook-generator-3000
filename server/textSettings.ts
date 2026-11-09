import express, { Router, type Request, type Response } from "express";
import { prisma } from "./db";
import { getCurrentUser } from "./session";
import { maskPhone } from "./texts";
import { TIMEZONES } from "./weeklyChapters";
import { childLabel } from "./beforeBirth";
import type { User } from "../src/generated/prisma/client";

// Each person's Text messages settings (VSB-138): which texts they get, quiet
// hours, and (for parents) their memory reminders. Reached signed in from
// Settings, or without signing in from the private link texts carry
// (<subscription_preferences>), which opens these settings and nothing else.

const router: Router = express.Router();

const SWITCHES = ["textsPaused", "textNewChapters", "textFromFamily", "textFamilyNews", "textFixes", "quietHours"] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Storybooks this person runs: their memory reminders are theirs to change.
const ownedStorybooks = (userId: string) =>
  prisma.storybook.findMany({
    where: { status: { notIn: ["guest", "archived"] }, child: { household: { contributors: { some: { userId, role: "owner", inviteStatus: "joined" } } } } },
    include: { child: true },
    orderBy: { createdAt: "asc" },
  });

// By private link the page names no child unless it must tell two storybooks apart.
async function view(user: User, viaLink = false) {
  const owned = await ownedStorybooks(user.id);
  return {
    phone: user.phone ? maskPhone(user.phone) : null,
    optedOut: user.textsOptedOut,
    parent: owned.length > 0,
    prefs: Object.fromEntries([...SWITCHES, "quietStart", "quietEnd", "textTimezone"].map((k) => [k, user[k as keyof User]])),
    timezones: Object.keys(TIMEZONES),
    reminders: owned.map((sb) => ({
      storybookId: sb.id,
      childName: !viaLink || owned.length > 1 ? childLabel(sb.child.displayName, true) : null,
      remindersPaused: sb.remindersPaused,
      remindersPausedUntil: sb.remindersPausedUntil,
      reminderFrequency: sb.reminderFrequency,
      reminderDay: sb.reminderDay,
      reminderTime: sb.reminderTime,
    })),
  };
}

async function update(user: User, body: any, res: Response, viaLink = false) {
  const data: Record<string, boolean | string> = {};
  for (const key of SWITCHES) if (typeof body?.[key] === "boolean") data[key] = body[key];
  for (const key of ["quietStart", "quietEnd"] as const) {
    if (body?.[key] === undefined) continue;
    if (!TIME.test(String(body[key]))) return res.status(400).json({ error: "Pick a time from the list." });
    data[key] = String(body[key]);
  }
  if (body?.textTimezone !== undefined) {
    if (!TIMEZONES[String(body.textTimezone)]) return res.status(400).json({ error: "Pick a time zone from the list." });
    data.textTimezone = String(body.textTimezone);
  }
  const fresh = Object.keys(data).length ? await prisma.user.update({ where: { id: user.id }, data }) : user;

  // { reminders: { storybookId, on } }: only for a storybook they run.
  const reminder = body?.reminders;
  if (reminder && typeof reminder.on === "boolean") {
    const owned = await ownedStorybooks(user.id);
    if (!owned.some((sb) => sb.id === String(reminder.storybookId))) return res.status(403).json({ error: "Only the parent who runs this storybook can change its reminders." });
    await prisma.storybook.update({ where: { id: String(reminder.storybookId) }, data: { remindersPaused: !reminder.on } });
  }
  res.json(await view(fresh, viaLink));
}

const signedIn = async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) res.status(401).json({ error: "Sign in to change your texts." });
  return user;
};

// The private link's key is checked on every call; a wrong one learns nothing.
const byLink = async (req: Request, res: Response) => {
  const key = String(req.params.key ?? "");
  const user = /^[A-Za-z0-9_-]{8,40}$/.test(key) ? await prisma.user.findUnique({ where: { textSettingsKey: key } }) : null;
  if (!user) res.status(404).json({ error: "This link doesn't work any more. Sign in to change your texts." });
  return user;
};

router.get("/me/texts", async (req, res) => {
  const user = await signedIn(req, res);
  if (user) res.json(await view(user));
});

router.put("/me/texts", async (req, res) => {
  const user = await signedIn(req, res);
  if (user) await update(user, req.body, res);
});

router.get("/texts/:key", async (req, res) => {
  const user = await byLink(req, res);
  if (user) res.json(await view(user, true));
});

router.put("/texts/:key", async (req, res) => {
  const user = await byLink(req, res);
  if (user) await update(user, req.body, res, true);
});

export default router;
