import crypto from "crypto";
import fs from "fs";
import path from "path";
import express, { Request, Response, Router } from "express";
import multer from "multer";
import { prisma } from "./db";
import { getCurrentUser } from "./session";
import { canStartStorybook } from "./admin";
import { ageInYears, stageForAge } from "./readingStages";
import { interpret, processMemory } from "./memoryPipeline";
import { createPagedChapter, illustrateChapter, recordedBy } from "./storyPages";
import { withUsage } from "./aiUsage";
import { acceptInvitation, invitationProblem } from "./familyRoutes";

// Try before you sign up (VSB-75). A visitor's first memory and story live in a
// temporary family tied to this device's cookie: a household with a guest token,
// one child, one storybook (status "guest", never in admin lists or the weekly
// batch) and a placeholder place for them. Verifying a phone number hands it to
// their account. Unsaved drafts are deleted after 7 days. A relative who opens an
// invitation can record first the same way; their memory moves into the family's
// storybook once they verify.

export const GUEST_COOKIE = "sb_guest";
const GUEST_DAYS = 7;
const DAY = 86_400_000;
export const PREVIEW_PAGES = 3;
const PREVIEWS_PER_DAY = 2; // one preview and one retry, per device and per network
export const DEFAULT_DAILY_CAP = 100; // free previews a day across all visitors
const MAX_AUDIO_SECONDS = 5 * 60;
const production = process.env.NODE_ENV === "production";

const router: Router = express.Router();
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
const networkOf = (req: Request) => hash(`net:${req.get("fly-client-ip") || req.ip || "unknown"}`);

const audioDir = path.join(process.cwd(), "uploads", "memories");
fs.mkdirSync(audioDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: audioDir,
    filename: (_req, file, cb) => cb(null, `guest-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${path.extname(file.originalname) || ".webm"}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// --- Settings ---

export async function dailyCap() {
  const row = await prisma.appSetting.findUnique({ where: { key: "visitor_daily_cap" } });
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_CAP;
}

// --- The draft ---

const draftInclude = {
  contributors: true,
  children: {
    include: {
      storybooks: {
        include: {
          memories: { include: { transcripts: { orderBy: { createdAt: "desc" as const }, take: 1 }, interpretation: true } },
          chapters: { include: { pages: { orderBy: { pageNumber: "asc" as const }, include: { assets: { orderBy: { version: "desc" as const }, take: 1 } } } } },
        },
      },
    },
  },
};

async function loadDraft(req: Request) {
  const token = req.cookies?.[GUEST_COOKIE];
  if (!token) return null;
  const household = await prisma.household.findFirst({ where: { guestToken: token, guestExpiresAt: { gt: new Date() } }, include: draftInclude });
  if (!household) return null;
  const child = household.children[0];
  const storybook = child?.storybooks[0];
  if (!child || !storybook) return null;
  return {
    token,
    household,
    child,
    storybook,
    me: household.contributors[0],
    memory: storybook.memories[0] ?? null,
    chapter: storybook.chapters[0] ?? null,
  };
}
type Draft = NonNullable<Awaited<ReturnType<typeof loadDraft>>>;

const setCookie = (res: Response, token: string, expires: Date) =>
  res.cookie(GUEST_COOKIE, token, { httpOnly: true, expires, sameSite: "lax", secure: production });

// Preview work in progress and the last failure, per draft.
const writing = new Set<string>();
const failures = new Map<string, string>();

async function allowance(req: Request) {
  const device = hash(`dev:${req.cookies?.[GUEST_COOKIE] ?? ""}`);
  const network = networkOf(req);
  const since = new Date(Date.now() - DAY);
  const [byDevice, byNetwork, today, cap] = await Promise.all([
    prisma.guestPreview.count({ where: { device, createdAt: { gte: since } } }),
    prisma.guestPreview.count({ where: { network, createdAt: { gte: since } } }),
    prisma.guestPreview.count({ where: { createdAt: { gte: since } } }),
    dailyCap(),
  ]);
  const used = Math.max(byDevice, byNetwork);
  if (today >= cap) return { ok: false as const, reason: "busy" as const, device, network, left: 0 };
  if (used >= PREVIEWS_PER_DAY) return { ok: false as const, reason: "used" as const, device, network, left: 0 };
  return { ok: true as const, reason: null, device, network, left: PREVIEWS_PER_DAY - used };
}

function memoryState(d: Draft) {
  const m = d.memory;
  if (!m) return null;
  const status = ["interpreted", "ready"].includes(m.status) ? "ready" : m.status === "failed" ? "failed" : "processing";
  return { status, kind: m.audioUrl || m.durationSec ? "audio" : "typed", title: m.title, error: m.processingError };
}

function previewState(d: Draft) {
  const id = d.household.id;
  if (writing.has(id) && !d.chapter) return { status: "writing" };
  if (!d.chapter) return failures.has(id) ? { status: "failed", error: failures.get(id) } : { status: "none" };
  const shown = d.chapter.pages.filter((p) => p.pageNumber <= PREVIEW_PAGES);
  const waiting = shown.some((p) => p.pictureSize !== "none" && p.assets[0]?.status === "generating") || d.chapter.pagesStatus === "illustrating";
  return {
    status: waiting ? "drawing" : "ready",
    title: d.chapter.title,
    totalPages: d.chapter.pages.length,
    pages: shown.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
      pictureSize: p.pictureSize,
      visibleAction: p.visibleAction,
      image: p.assets[0]?.status === "ready" ? p.assets[0].imagePath : null,
    })),
  };
}

async function state(req: Request, d: Draft) {
  const limit = await allowance(req);
  let invite = null;
  if (d.household.guestInvite) {
    const invitation = await prisma.invitation.findUnique({ where: { token: d.household.guestInvite } });
    invite = invitation ? { invitedBy: invitation.invitedByName, childName: d.child.displayName } : null;
  }
  return {
    mode: d.household.guestInvite ? "invite" : "try",
    child: { name: d.child.displayName, stage: d.child.stage, birthDate: d.child.birthDate },
    relationship: d.me?.relationship ?? null,
    invite,
    expiresAt: d.household.guestExpiresAt,
    memory: memoryState(d),
    preview: previewState(d),
    limits: { canPreview: limit.ok, reason: limit.reason, left: limit.left },
  };
}

// Removes a draft's recording and pictures from disk.
function draftFiles(d: { storybook: Draft["storybook"] }) {
  return [
    ...d.storybook.memories.map((m) => m.audioUrl),
    ...d.storybook.chapters.flatMap((c) => [c.characterSheetImage, ...c.pages.flatMap((p) => p.assets.map((a) => a.imagePath))]),
  ];
}
const removeFiles = (files: (string | null | undefined)[]) =>
  files.forEach((f) => {
    if (!f) return;
    const abs = path.join(process.cwd(), f.replace(/^\//, ""));
    try {
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (error: any) {
      console.error(`Couldn't remove ${f}:`, error?.message);
    }
  });

// --- Starting ---

interface Details {
  childName: string;
  stage: "born" | "expecting";
  birthDate: Date | null;
  relationship: string;
}

function readDetails(body: any): Details | string {
  const childName = String(body?.childName ?? "").trim().slice(0, 40);
  const relationship = String(body?.relationship ?? "").trim().slice(0, 40);
  const stage = body?.stage === "expecting" ? "expecting" : "born";
  const birthDate = stage === "born" && body?.birthDate ? new Date(`${String(body.birthDate).slice(0, 10)}T00:00:00Z`) : null;
  if (!childName) return "Add your little one's name or nickname.";
  if (!relationship) return "Choose how you're related to them.";
  if (stage === "born" && (!birthDate || Number.isNaN(birthDate.getTime()) || birthDate > new Date())) return "Add their birthday, or choose \"On the way\".";
  return { childName, stage, birthDate, relationship };
}

async function createDraft(res: Response, details: Details, invite: string | null) {
  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + GUEST_DAYS * DAY);
  await prisma.household.create({
    data: {
      guestToken: token,
      guestExpiresAt: expires,
      guestInvite: invite,
      contributors: { create: { name: "", relationship: details.relationship, role: "owner", inviteStatus: "guest" } },
      children: {
        create: {
          displayName: details.childName,
          stage: details.stage,
          birthDate: details.birthDate,
          storybooks: {
            create: {
              title: `${details.childName}'s growing story`,
              status: "guest",
              readerAgeBand: stageForAge(details.stage === "expecting" ? null : ageInYears(details.birthDate)),
              remindersPaused: true, // weekly reminders are a separate choice, after saving
              defaultStoryUse: true,
              lastBatchAt: new Date(),
            },
          },
        },
      },
    },
  });
  setCookie(res, token, expires);
}

router.get("/guest", async (req, res) => {
  const d = await loadDraft(req);
  if (!d) return res.status(404).json({ error: "none" });
  res.json(await state(req, d));
});

// The details the story needs. Changing them later replaces an unsent draft.
router.post("/guest/start", async (req, res) => {
  const details = readDetails(req.body);
  if (typeof details === "string") return res.status(400).json({ error: details });
  const d = await loadDraft(req);
  if (d && !d.memory && !d.household.guestInvite) {
    await prisma.child.update({ where: { id: d.child.id }, data: { displayName: details.childName, stage: details.stage, birthDate: details.birthDate } });
    await prisma.storybook.update({
      where: { id: d.storybook.id },
      data: { title: `${details.childName}'s growing story`, readerAgeBand: stageForAge(details.stage === "expecting" ? null : ageInYears(details.birthDate)) },
    });
    if (d.me) await prisma.contributor.update({ where: { id: d.me.id }, data: { relationship: details.relationship } });
  } else {
    if (d) await discard(d);
    await createDraft(res, details, null);
  }
  res.status(201).json({ ok: true });
});

// A relative opening an invitation records first, for the family's child.
router.post("/guest/invite/:token", async (req, res) => {
  const invitation = await prisma.invitation.findUnique({
    where: { token: req.params.token },
    include: { household: { include: { children: true } } },
  });
  const problem = invitationProblem(invitation);
  if (problem) return res.status(problem === "not_found" ? 404 : 410).json({ error: problem });
  const child = invitation!.household.children[0];
  const d = await loadDraft(req);
  if (d?.household.guestInvite === req.params.token) return res.json({ ok: true });
  if (d) await discard(d);
  await createDraft(
    res,
    { childName: child?.displayName ?? "their child", stage: child?.stage === "expecting" ? "expecting" : "born", birthDate: child?.birthDate ?? null, relationship: invitation!.relationship || "Family" },
    req.params.token
  );
  res.status(201).json({ ok: true });
});

// --- The memory ---

async function replaceMemory(d: Draft) {
  if (!d.memory) return;
  if (d.chapter) await prisma.chapter.deleteMany({ where: { storybookId: d.storybook.id } });
  removeFiles(draftFiles(d));
  await prisma.memory.delete({ where: { id: d.memory.id } });
  failures.delete(d.household.id);
}

router.post("/guest/memory", async (req, res) => {
  const d = await loadDraft(req);
  if (!d || !d.me) return res.status(404).json({ error: "Start again: this draft has expired." });
  const text = String(req.body?.text ?? "").trim().slice(0, 4000);
  if (text.length < 10) return res.status(400).json({ error: "Write a little more: a sentence or two is plenty." });
  await replaceMemory(d);
  const memory = await prisma.memory.create({
    data: {
      storybookId: d.storybook.id,
      contributorId: d.me.id,
      visibility: "contributor_only",
      storyUseConsent: true,
      status: "transcribed",
      promptText: req.body?.promptText ? String(req.body.promptText).slice(0, 200) : null,
      transcripts: { create: { source: "typed", text } },
    },
  });
  void withUsage({ trigger: "visitor" }, () => interpret(memory.id, text, true)).catch((e) => console.error("Guest interpret failed:", e?.message));
  res.status(201).json({ ok: true });
});

router.post("/guest/memory/audio", upload.single("audio"), async (req, res) => {
  const d = await loadDraft(req);
  if (!req.file) return res.status(400).json({ error: "No recording arrived. Try again." });
  if (!d || !d.me) {
    removeFiles([`uploads/memories/${req.file.filename}`]);
    return res.status(404).json({ error: "Start again: this draft has expired." });
  }
  const seconds = Math.round(Number(req.body?.durationSec) || 0);
  if (seconds > MAX_AUDIO_SECONDS + 5) {
    removeFiles([`uploads/memories/${req.file.filename}`]);
    return res.status(400).json({ error: "Keep this first memory under 5 minutes." });
  }
  await replaceMemory(d);
  const memory = await prisma.memory.create({
    data: {
      storybookId: d.storybook.id,
      contributorId: d.me.id,
      visibility: "contributor_only",
      storyUseConsent: true,
      status: "recorded",
      durationSec: seconds || null,
      audioUrl: `/uploads/memories/${req.file.filename}`,
      promptText: req.body?.promptText ? String(req.body.promptText).slice(0, 200) : null,
    },
  });
  void withUsage({ trigger: "visitor" }, () => processMemory(memory.id));
  res.status(201).json({ ok: true });
});

// --- The preview ---

async function writePreview(d: Draft, memory: NonNullable<Draft["memory"]>) {
  const id = d.household.id;
  writing.add(id);
  failures.delete(id);
  try {
    if (d.chapter) {
      removeFiles(d.storybook.chapters.flatMap((c) => [c.characterSheetImage, ...c.pages.flatMap((p) => p.assets.map((a) => a.imagePath))]));
      await prisma.chapter.deleteMany({ where: { storybookId: d.storybook.id } });
    }
    await withUsage({ trigger: "visitor", householdId: id }, () =>
      createPagedChapter({
        storybookId: d.storybook.id,
        castKeys: [],
        firstPages: PREVIEW_PAGES,
        noQuestions: true,
        memories: [
          {
            id: memory.id,
            transcript: memory.transcripts[0]?.text ?? "",
            events: memory.interpretation?.events ?? "",
            emotions: memory.interpretation?.emotions ?? "",
            themes: memory.interpretation?.themes ?? "",
            recordedBy: d.me?.relationship ? `their ${d.me.relationship.toLowerCase()}` : undefined,
          },
        ],
      })
    );
  } catch (error: any) {
    console.error(`Guest preview for ${id} failed:`, error?.message);
    failures.set(id, "We couldn't make the story this time.");
  } finally {
    writing.delete(id);
  }
}

router.post("/guest/preview", async (req, res) => {
  const d = await loadDraft(req);
  if (!d) return res.status(404).json({ error: "Start again: this draft has expired." });
  if (d.household.guestInvite) return res.status(400).json({ error: "Add your memory to the family's storybook instead." });
  const memory = d.memory;
  if (!memory || memoryState(d)?.status !== "ready") return res.status(409).json({ error: "Your memory is still being prepared." });
  if (writing.has(d.household.id)) return res.status(202).json({ ok: true });
  const limit = await allowance(req);
  if (!limit.ok) {
    return res.status(429).json({
      error: limit.reason === "busy" ? "So many families are trying Vambie today that free previews are paused. Save your story and we'll make it right away." : "You've used today's free preview. Save your story to see it when it's ready.",
      reason: limit.reason,
    });
  }
  await prisma.guestPreview.create({ data: { device: limit.device, network: limit.network } });
  void writePreview(d, memory);
  res.status(202).json({ ok: true });
});

// --- Saving ---

// After verifying their phone: the draft becomes their storybook (or, for a
// relative, their memory joins the family's storybook).
router.post("/guest/claim", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Verify your number first." });
  const d = await loadDraft(req);
  if (!d || !d.me) return res.status(404).json({ error: "This draft has expired or was already saved." });
  const name = String(req.body?.name ?? "").trim().slice(0, 60) || user.name || "";
  if (!name) return res.status(400).json({ error: "Add your name so the family knows who's sharing." });

  if (d.household.guestInvite) {
    const invitation = await prisma.invitation.findUnique({ where: { token: d.household.guestInvite } });
    const problem = invitationProblem(invitation);
    if (problem) return res.status(410).json({ error: "This invitation has expired. Ask the family for a new link." });
    const { place, storybook } = await acceptInvitation(invitation!, user, name);
    if (!storybook) return res.status(404).json({ error: "This family's storybook isn't there any more." });
    if (d.memory) {
      // The memory moves into the family's book, as theirs; their recording and words come with it.
      await prisma.memory.update({
        where: { id: d.memory.id },
        data: { storybookId: storybook.id, contributorId: place.id, visibility: storybook.defaultVisibility, storyUseConsent: storybook.defaultStoryUse },
      });
      // What preparing it cost now belongs to that family.
      await prisma.aiUsage.updateMany({ where: { memoryId: d.memory.id }, data: { householdId: invitation!.householdId } });
    }
    await deleteDraft(d.household.id);
    res.clearCookie(GUEST_COOKIE);
    return res.json({ storybookId: storybook.id, chapterId: null, joined: true });
  }

  if (!canStartStorybook(user)) return res.status(403).json({ error: "Vambie is invite-only for now. If someone invited you, open the link they sent." });
  if (!user.name) await prisma.user.update({ where: { id: user.id }, data: { name } });
  await prisma.$transaction([
    prisma.contributor.update({ where: { id: d.me.id }, data: { userId: user.id, inviteStatus: "joined", name, phone: user.phone } }),
    prisma.household.update({ where: { id: d.household.id }, data: { ownerUserId: user.id, guestToken: null, guestExpiresAt: null } }),
    prisma.storybook.update({ where: { id: d.storybook.id }, data: { status: "active" } }),
  ]);
  res.clearCookie(GUEST_COOKIE);

  // Draw the rest of the chapter, or make it now if the preview was skipped.
  if (d.chapter) void illustrateChapter(d.chapter.id, { missingOnly: true });
  else if (d.memory && memoryState(d)?.status === "ready") {
    const memory = d.memory;
    void createPagedChapter({
      storybookId: d.storybook.id,
      castKeys: [],
      memories: [
        {
          id: memory.id,
          transcript: memory.transcripts[0]?.text ?? "",
          events: memory.interpretation?.events ?? "",
          emotions: memory.interpretation?.emotions ?? "",
          themes: memory.interpretation?.themes ?? "",
          recordedBy: recordedBy({ name, relationship: d.me.relationship }),
        },
      ],
    }).catch((e) => console.error("Chapter after saving failed:", e?.message));
  }
  res.json({ storybookId: d.storybook.id, chapterId: d.chapter?.id ?? null, joined: false });
});

// Deletes a draft family. Storybooks go first (with their memories and
// chapters), since a memory keeps its author's place from being deleted. AI
// costs stay in the totals, no longer tied to the draft.
async function deleteDraft(householdId: string) {
  await prisma.storybook.deleteMany({ where: { child: { householdId } } });
  await prisma.household.delete({ where: { id: householdId } });
  await prisma.aiUsage.updateMany({ where: { householdId }, data: { householdId: null, chapterId: null, memoryId: null } });
}

// "Start over": deletes this device's draft.
async function discard(d: Draft) {
  removeFiles(draftFiles(d));
  await deleteDraft(d.household.id);
}

router.delete("/guest", async (req, res) => {
  try {
    const d = await loadDraft(req);
    if (d) await discard(d);
    res.clearCookie(GUEST_COOKIE);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("Discarding a visitor draft failed:", error?.message);
    res.status(500).json({ error: "Couldn't start over. Try again." });
  }
});

// --- Admin ---

// The visitors' daily preview cap, and how it's being used (Admin → Settings → Visitors).
router.get("/admin/visitors", async (_req, res) => {
  const since = new Date(Date.now() - DAY);
  const [cap, previewsToday, drafts] = await Promise.all([
    dailyCap(),
    prisma.guestPreview.count({ where: { createdAt: { gte: since } } }),
    prisma.household.count({ where: { guestToken: { not: null }, guestExpiresAt: { gt: new Date() } } }),
  ]);
  res.json({ cap, previewsToday, drafts, perDevice: PREVIEWS_PER_DAY, keptDays: GUEST_DAYS });
});

router.put("/admin/visitors", async (req, res) => {
  const cap = Math.round(Number(req.body?.cap));
  if (!Number.isFinite(cap) || cap < 0 || cap > 10000) return res.status(400).json({ error: "Enter a number from 0 to 10,000." });
  await prisma.appSetting.upsert({ where: { key: "visitor_daily_cap" }, update: { value: String(cap) }, create: { key: "visitor_daily_cap", value: String(cap) } });
  res.json({ cap });
});

// --- Clean-up ---

// Unsaved drafts older than 7 days are deleted with their files. Their AI costs
// stay in the totals, no longer tied to them.
export async function deleteExpiredDrafts() {
  const expired = await prisma.household.findMany({
    where: { guestToken: { not: null }, guestExpiresAt: { lt: new Date() } },
    include: draftInclude,
  });
  for (const h of expired) {
    const storybook = h.children[0]?.storybooks[0];
    if (storybook) removeFiles(draftFiles({ storybook }));
    await deleteDraft(h.id);
  }
  if (expired.length) console.log(`Deleted ${expired.length} unsaved visitor draft(s).`);
}

export function startGuestCleanup() {
  const run = () => void deleteExpiredDrafts().catch((e) => console.error("Visitor clean-up:", e?.message));
  setTimeout(run, 60_000);
  setInterval(run, 60 * 60 * 1000);
}

export default router;
