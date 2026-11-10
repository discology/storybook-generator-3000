import { Router } from "express";
import { prisma } from "./db";
import { isAiConfigured, runAiStep } from "./aiService";
import { TEACHER_REPLY_KEY } from "./aiInstructions";
import type { UsageTags } from "./aiUsage";

// Teachers for lesson stories (VSB-147): Esther Perel, Ram Dass, Thich Nhat
// Hanh and others the team adds under Admin, Teachers. Before a lesson story
// is planned, the active teacher whose ideas fit best replies to Baby Vambie
// and names the lesson underneath; the story is planned from that reply.
// Families never see a teacher's name: only the lesson, in plain words, on the
// grown-ups page.

export const TEACHER_STATUSES = ["draft", "active", "retired"] as const;

const CARD_FIELDS = ["name", "ideas", "voice", "never", "bestFor"] as const;

export interface TeacherCard {
  id: string;
  name: string;
  version: number;
  ideas: string;
  voice: string;
  never: string;
  bestFor: string;
}

// What a lesson chapter keeps in its rules snapshot: the teacher's card as it
// was, their reply, and the lesson for the grown-ups.
export interface ChapterLesson {
  teacher: TeacherCard;
  reply: string;
  forGrownUps: string;
}

const card = (t: TeacherCard): TeacherCard => ({ id: t.id, name: t.name, version: t.version, ideas: t.ideas, voice: t.voice, never: t.never, bestFor: t.bestFor });

export const describeTeacher = (t: TeacherCard) =>
  `${t.id}: ${t.name}\nIdeas: ${t.ideas}\nHow they speak to a small child: ${t.voice}${t.never ? `\nNever: ${t.never}` : ""}${t.bestFor ? `\nBest for: ${t.bestFor}` : ""}`;

export const chapterLesson = (snapshotJson: string | null | undefined): ChapterLesson | null => {
  if (!snapshotJson) return null;
  try {
    return JSON.parse(snapshotJson).lesson ?? null;
  } catch {
    return null;
  }
};

// The teacher of this family's last lesson story, so the next one leans elsewhere.
async function recentTeacher(storybookId: string) {
  const chapters = await prisma.chapter.findMany({ where: { storybookId }, orderBy: { createdAt: "desc" }, select: { generationSnapshot: true }, take: 20 });
  for (const c of chapters) {
    const name = chapterLesson(c.generationSnapshot)?.teacher.name;
    if (name) return name;
  }
  return null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Null when there's no AI, no active teacher, or the reply didn't work out: the
// story is then planned from the Lesson stories rules alone.
export async function writeTeacherReply(input: { storybookId: string; lesson: string; readingLevel: string; tags?: UsageTags }): Promise<{ lesson: ChapterLesson; usageId: string | null } | null> {
  if (!isAiConfigured()) return null;
  const teachers = await prisma.teacher.findMany({ where: { status: "active" }, orderBy: { name: "asc" } });
  if (!teachers.length) return null;
  try {
    const { output, usageId } = await runAiStep(
      TEACHER_REPLY_KEY,
      {
        lesson: input.lesson,
        reading_level: input.readingLevel,
        teachers: teachers.map(describeTeacher).join("\n\n"),
        recent_teacher: (await recentTeacher(input.storybookId)) ?? "(none yet)",
      },
      undefined,
      [],
      input.tags
    );
    const teacher = teachers.find((t) => t.id === str(output?.teacher));
    const reply = str(output?.reply);
    const forGrownUps = str(output?.lesson);
    if (!teacher || !reply || !forGrownUps) {
      console.error("Teacher's reply came back incomplete; planning from the lesson alone.");
      return null;
    }
    return { lesson: { teacher: card(teacher), reply, forGrownUps }, usageId };
  } catch (error: any) {
    console.error("Teacher's reply failed; planning from the lesson alone:", error?.message ?? error);
    return null;
  }
}

// --- Admin, Teachers ---

const router = Router();

function readTeacher(body: any): Partial<Record<(typeof CARD_FIELDS)[number], string>> & { status?: string } | string {
  const out: Partial<Record<(typeof CARD_FIELDS)[number], string>> & { status?: string } = {};
  for (const f of CARD_FIELDS) if (body?.[f] !== undefined) out[f] = String(body[f]).trim().slice(0, f === "name" ? 80 : 1200);
  if (out.name !== undefined && !out.name) return "Add the teacher's name.";
  if (out.ideas !== undefined && !out.ideas) return "Add their core ideas.";
  if (out.voice !== undefined && !out.voice) return "Add how they'd speak to a small child.";
  if (body?.status !== undefined) {
    if (!TEACHER_STATUSES.includes(body.status)) return "Pick draft, active or retired.";
    out.status = body.status;
  }
  return out;
}

router.get("/admin/teachers", async (_req, res) => {
  const teachers = await prisma.teacher.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] });
  res.json({ teachers, statuses: TEACHER_STATUSES });
});

router.post("/admin/teachers", async (req, res) => {
  const t = readTeacher({ never: "", bestFor: "", ...req.body, status: "draft" });
  if (typeof t === "string") return res.status(400).json({ error: t });
  if (!t.name || !t.ideas || !t.voice) return res.status(400).json({ error: "Add the name, their core ideas and how they'd speak to a small child." });
  res.status(201).json(await prisma.teacher.create({ data: { name: t.name, ideas: t.ideas, voice: t.voice, never: t.never ?? "", bestFor: t.bestFor ?? "", status: "draft" } }));
});

// A change to the card makes a new version; chapters keep the one they were made with.
router.put("/admin/teachers/:id", async (req, res) => {
  const t = readTeacher(req.body);
  if (typeof t === "string") return res.status(400).json({ error: t });
  const current = await prisma.teacher.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "That teacher is gone." });
  const changed = CARD_FIELDS.some((f) => t[f] !== undefined && t[f] !== current[f]);
  res.json(await prisma.teacher.update({ where: { id: current.id }, data: { ...t, ...(changed ? { version: { increment: 1 } } : {}) } }));
});

export default router;
