import { prisma } from "./db";
import { appUrl, renderMessage } from "./messageTemplates";
import { sendText, textsMode } from "./texts";
import { DAYS, TIMEZONES, zonedParts, zonedToUtc } from "./weeklyChapters";

// The memory reminder text (VSB-9), on the storybook's schedule: weekly on the
// chosen day, or daily, at the chosen time in the family's time zone. It goes to
// the storybook's owner; VSB-69 gives each family member their own schedule.

const TICK_MS = 5 * 60 * 1000;
// After downtime, a reminder more than this late is skipped rather than sent.
const TOO_LATE_MS = 3 * 60 * 60 * 1000;

type Schedule = { reminderFrequency: string; reminderDay: string; reminderTime: string; reminderTimezone: string };

// The most recent scheduled reminder at or before `now`.
export function lastScheduledReminder(schedule: Schedule, now = new Date()) {
  const tz = TIMEZONES[schedule.reminderTimezone] ?? TIMEZONES["Pacific Time"];
  const [hour, minute] = (/^\d{2}:\d{2}$/.test(schedule.reminderTime) ? schedule.reminderTime : "19:00").split(":").map(Number);
  const local = zonedParts(now, tz);
  const reachedToday = local.hour > hour || (local.hour === hour && local.minute >= minute);
  let daysBack: number;
  if (schedule.reminderFrequency === "daily") {
    daysBack = reachedToday ? 0 : 1;
  } else {
    daysBack = (local.weekday - Math.max(0, DAYS.indexOf(schedule.reminderDay)) + 7) % 7;
    if (daysBack === 0 && !reachedToday) daysBack = 7;
  }
  const d = new Date(Date.UTC(local.year, local.month - 1, local.day - daysBack));
  return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, tz, minute);
}

async function tick() {
  if (textsMode() === "off") return;
  const now = new Date();
  const storybooks = await prisma.storybook.findMany({
    where: { status: "active", remindersPaused: false, reminderChannel: "SMS" },
    include: { child: { include: { household: { include: { contributors: { where: { role: "owner", inviteStatus: "joined" }, include: { user: true } } } } } } },
  });
  for (const sb of storybooks) {
    const due = lastScheduledReminder(sb, now);
    if (due <= (sb.lastReminderAt ?? sb.createdAt)) continue;
    // Claimed before sending, so a slow send can't go out twice.
    await prisma.storybook.update({ where: { id: sb.id }, data: { lastReminderAt: now } });
    if (now.getTime() - due.getTime() > TOO_LATE_MS) continue;
    for (const owner of sb.child.household.contributors) {
      if (!owner.user?.phone) continue;
      const body = await renderMessage("reminder", {
        parent_name: owner.name,
        child_name: sb.child.displayName,
        storybook_title: sb.title,
        storybook_url: appUrl(`/storybooks/${sb.id}`),
        record_url: appUrl(`/storybooks/${sb.id}/record`),
      });
      if (body) await sendText({ event: "reminder", to: { userId: owner.user.id, phone: owner.user.phone }, body, householdId: sb.child.householdId });
    }
  }
}

export function startReminders() {
  setTimeout(() => void tick().catch((e) => console.error("Reminders:", e?.message)), 45_000);
  setInterval(() => void tick().catch((e) => console.error("Reminders:", e?.message)), TICK_MS);
}
