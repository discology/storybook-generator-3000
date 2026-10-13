import express, { Router } from "express";
import { prisma } from "./db";
import { canSeeMemory, requireMember, type Member } from "./access";
import { childLabel } from "./childName";
import { appUrl, renderMessage } from "./messageTemplates";
import { cardStagesFor } from "./promptStages";
import { fillPrompt, firstName, promptValues } from "./promptVariables";
import { sendText } from "./texts";

// Question of the week and who has answered each card (VSB-113).
// - The week's card is one published "answer once" card for everyone in the
//   family, rotating every seven days from when the storybook started.
// - Who answered: names only, never what they said, and only for answers the
//   viewer may see: their own, and others' that are shared with the family. A
//   private answer shows as "You" on its author's phone and nowhere else.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function weekPromptId(storybook: { createdAt: Date; child: { stage: string; birthDate: Date | null } }, now = new Date()) {
  const candidates = await prisma.prompt.findMany({
    where: {
      status: "published",
      answerOnce: true,
      audience: "Everyone",
      childStage: { in: cardStagesFor(storybook.child, now) },
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

// Passing a question on (VSB-131). After answering a card, a family member can ask
// others who have joined to answer it too.
// - An ask is open until the person asked records an answer to that card; for an
//   answer-once card, any answer of theirs closes it.
// - Nothing about the asker's own answer is shared, and an answer the asker can't
//   see never shows as "answered" to them.

// The asks still waiting on this person: one per card, newest first.
export async function openAsks(storybookId: string, me: { id: string }) {
  const asks = await prisma.promptAsk.findMany({ where: { storybookId, toId: me.id }, include: { from: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  if (asks.length === 0) return [];
  const promptIds = [...new Set(asks.map((a) => a.promptId))];
  const [prompts, mine] = await Promise.all([
    prisma.prompt.findMany({ where: { id: { in: promptIds }, status: "published" }, select: { id: true, answerOnce: true } }),
    prisma.memory.findMany({ where: { storybookId, contributorId: me.id, promptId: { in: promptIds } }, select: { promptId: true, createdAt: true } }),
  ]);
  const answerOnce = new Map(prompts.map((p) => [p.id, p.answerOnce]));
  const byCard = new Map<string, { promptId: string; from: string[]; note: string }>();
  for (const a of asks) {
    if (!answerOnce.has(a.promptId)) continue; // the card was unpublished
    if (mine.some((m) => m.promptId === a.promptId && (answerOnce.get(a.promptId) || m.createdAt >= a.createdAt))) continue;
    const entry = byCard.get(a.promptId) ?? { promptId: a.promptId, from: [], note: a.note };
    const name = firstName(a.from.name) || a.from.name;
    if (!entry.from.includes(name)) entry.from.push(name);
    byCard.set(a.promptId, entry);
  }
  return [...byCard.values()];
}

type Person = { name: string; relationship: string | null; role: string };
const valuesFor = (storybook: Member["storybook"], person: Person) =>
  promptValues({
    child: storybook.child,
    me: person,
    parentName: storybook.child.household.contributors.find((c) => c.role === "owner")?.name ?? null,
  });

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
    // The week's question still loads if the asks can't be read.
    asked: await openAsks(req.params.id, access.me).catch((error) => {
      console.error("Couldn't read the questions passed on:", error);
      return [];
    }),
  });
});

// The "Ask someone else" screen: the question, and who in the family can be asked.
router.get("/storybooks/:id/prompts/:promptId/ask", async (req, res) => {
  const access = await requireMember(req, res, req.params.id);
  if (!access) return;
  const { storybook, me } = access;
  const prompt = await prisma.prompt.findFirst({ where: { id: req.params.promptId, status: "published" } });
  if (!prompt) return res.status(404).json({ error: "That question isn't here anymore." });
  const [memories, asks] = await Promise.all([
    prisma.memory.findMany({ where: { storybookId: storybook.id, promptId: prompt.id }, select: { contributorId: true, visibility: true, createdAt: true } }),
    prisma.promptAsk.findMany({ where: { storybookId: storybook.id, promptId: prompt.id, fromId: me.id } }),
  ]);
  const visible = (contributorId: string, since?: Date) => memories.some((m) => m.contributorId === contributorId && canSeeMemory(m, me) && (!since || m.createdAt >= since));
  res.json({
    question: fillPrompt(prompt.question, valuesFor(storybook, me)),
    category: prompt.category,
    answered: memories.some((m) => m.contributorId === me.id),
    family: storybook.child.household.contributors
      .filter((c) => c.id !== me.id && c.inviteStatus === "joined")
      .map((c) => {
        const ask = asks.find((a) => a.toId === c.id);
        return {
          id: c.id,
          name: c.name,
          relationship: c.relationship,
          answered: prompt.answerOnce && visible(c.id),
          asked: Boolean(ask) && !visible(c.id, ask?.createdAt),
        };
      }),
  });
});

// Ask: each chosen family member gets the request (it shows on their home and in
// their deck) and a text when they can be texted; the message comes back for the
// sender to pass on to anyone who couldn't be.
router.post("/storybooks/:id/prompts/:promptId/ask", async (req, res) => {
  const access = await requireMember(req, res, req.params.id);
  if (!access) return;
  const { storybook, me } = access;
  const prompt = await prisma.prompt.findFirst({ where: { id: req.params.promptId, status: "published" } });
  if (!prompt) return res.status(404).json({ error: "That question isn't here anymore." });
  const memories = await prisma.memory.findMany({ where: { storybookId: storybook.id, promptId: prompt.id }, select: { contributorId: true, visibility: true } });
  if (!memories.some((m) => m.contributorId === me.id)) return res.status(400).json({ error: "Answer this question yourself first, then pass it on." });

  const wanted = new Set<string>((Array.isArray(req.body?.recipientIds) ? req.body.recipientIds : []).map(String));
  const recipients = await prisma.contributor.findMany({
    where: { householdId: storybook.child.householdId, inviteStatus: "joined", id: { in: [...wanted].filter((id) => id !== me.id) } },
    include: { user: true },
  });
  // Someone whose answer to an answer-once card the sender can see has nothing left to add.
  const asking = recipients.filter((r) => !(prompt.answerOnce && memories.some((m) => m.contributorId === r.id && canSeeMemory(m, me))));
  if (asking.length === 0) return res.status(400).json({ error: "Choose who to ask." });

  const note = String(req.body?.message ?? "").trim().slice(0, 200);
  const now = new Date();
  for (const r of asking) {
    await prisma.promptAsk.upsert({
      where: { storybookId_promptId_fromId_toId: { storybookId: storybook.id, promptId: prompt.id, fromId: me.id, toId: r.id } },
      create: { storybookId: storybook.id, promptId: prompt.id, fromId: me.id, toId: r.id, note, createdAt: now },
      update: { note, createdAt: now },
    });
  }

  const link = appUrl(`/storybooks/${storybook.id}/record?card=${prompt.id}`);
  const messageFor = async (person: Person) => {
    const body = await renderMessage("question_asked", {
      sender_name: firstName(me.name) || me.name,
      child_name: childLabel(storybook.child.displayName, person.role === "owner"),
      storybook_title: storybook.title,
      question: fillPrompt(prompt.question, valuesFor(storybook, person)),
      note,
      answer_url: link,
    });
    return body?.replace(/\s{2,}/g, " ") ?? null;
  };
  const texted: string[] = [];
  const notTexted: { name: string; reason: string }[] = [];
  for (const r of asking) {
    const body = await messageFor(r);
    const result = body
      ? await sendText({ event: "question_asked", to: { userId: r.user?.id, phone: r.user?.phone ?? null }, body, householdId: storybook.child.householdId })
      : ({ sent: false, reason: "off" } as const);
    if (result.sent) texted.push(r.name);
    else notTexted.push({ name: r.name, reason: result.reason === "no_phone" ? "no number yet" : result.reason === "opted_out" ? "asked not to get texts" : result.reason === "off" ? "texting isn't on" : "couldn't be texted" });
  }
  const unreached = asking.find((r) => notTexted.some((n) => n.name === r.name));
  const text = (unreached && (await messageFor(unreached))) || `${fillPrompt(prompt.question, valuesFor(storybook, asking[0]))} ${link}`;
  res.json({ ok: true, link, text, asked: asking.map((r) => r.name), texted, notTexted });
});

export default router;
