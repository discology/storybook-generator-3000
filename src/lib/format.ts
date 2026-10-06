export function formatDuration(totalSeconds: number | null | undefined) {
  const s = Math.max(0, Math.round(totalSeconds ?? 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const formatDate = (value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) =>
  value ? new Date(value).toLocaleDateString("en-US", options) : "";

export const formatMonth = (value: string | Date) => new Date(value).toLocaleDateString("en-US", { month: "long", year: "numeric" });

// "Chapter 03"
export const chapterLabel = (sequence: number) => `Chapter ${String(sequence).padStart(2, "0")}`;

// "Mia's" — and "James'" for names ending in s.
export const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

// "19:00" → "7:00 PM"
export function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2000, 0, 1, h || 0, m || 0);
  return TIME_FORMAT.format(d).replace(":00 ", " ");
}
