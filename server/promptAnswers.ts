import express, { Router } from "express";
import { prisma } from "./db";
import { canSeeMemory, requireMember } from "./access";
import { ageInYears } from "./readingStages";

// Question of the week and who has answered each card (VSB-113).
// - The week's card is one published "answer once" card for everyone in the
//   family, rotating every seven days from when the storybook started.
// - Who answered: names only, never what they said, and only for answers the
//   viewer may see: their own, and others' that are shared with the family. A
//   private answer shows as "You" on its author's phone and nowhere else.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function childStageOf(child: { stage: string; birthDate: Date | null }) {
  if (child.stage === "expecting") return "Expecting";
  const age = ageInYears(child.birthDate);
  if (age === null) return null;
  return age < 1 ? "Newborn" : age < 4 ? "Toddler" : null;
}

export async function weekPromptId(storybook: { createdAt: Date; child: { stage: string; birthDate: Date | null } }, now = new Date()) {
  const stage = childStageOf(storybook.child);
  const candidates = await prisma.prompt.findMany({
    where: {
      status: "published",
      answerOnce: true,
      audience: "Everyone",
      OR: [{ childStage: "All stages" }, ...(stage ? [{ childStage: stage }] : [])],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (candidates.length === 0) return null;
  const week = Math.max(0, Math.floor((now.getTime() - storybook.createdAt.getTime()) / WEEK_MS));
  return candidates[week % candidates.length].id;
}

export interface CardAnswers {
  you: boolean;
  others: string[];
}

export async function promptAnswers(storybookId: string, me: { id: string }) {
  const memories = await prisma.memory.findMany({
    where: { storybookId, promptId: { not: null } },
    select: { promptId: true, contributorId: true, visibility: true, contributor: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const answers: Record<string, CardAnswers> = {};
  for (const m of memories) {
    const entry = (answers[m.promptId as string] ??= { you: false, others: [] });
    if (m.contributorId === me.id) entry.you = true;
    else if (canSeeMemory(m, me) && m.contributor?.name && !entry.others.includes(m.contributor.name)) entry.others.push(m.contributor.name);
  }
  return answers;
}

const router: Router = express.Router();

router.get("/storybooks/:id/prompt-answers", async (req, res) => {
  const access = await requireMember(req, res, req.params.id);
  if (!access) return;
  const storybook = await prisma.storybook.findUnique({
    where: { id: req.params.id },
    select: { createdAt: true, child: { select: { stage: true, birthDate: true } } },
  });
  res.json({
    weekPromptId: storybook ? await weekPromptId(storybook) : null,
    answers: await promptAnswers(req.params.id, access.me),
  });
});

export default router;
