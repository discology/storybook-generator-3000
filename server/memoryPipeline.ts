import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { interpretMemory, transcribeAudio } from "./aiService";

// After a recording is uploaded, the memory is transcribed and interpreted in
// the background, so the parent never has to press "Transcribe". When the
// family chose not to keep recordings, the audio is deleted once transcribed.

const running = new Set<string>();

const mimeFor = (file: string) => {
  const ext = path.extname(file).toLowerCase();
  return ext === ".mp4" || ext === ".m4a" ? "audio/mp4" : ext === ".ogg" ? "audio/ogg" : ext === ".wav" ? "audio/wav" : "audio/webm";
};

export async function processMemory(memoryId: string) {
  if (running.has(memoryId)) return;
  running.add(memoryId);
  try {
    let memory = await prisma.memory.findUniqueOrThrow({
      where: { id: memoryId },
      include: { storybook: true, contributor: true, transcripts: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const tags = { memoryId, userId: memory.contributor.userId };

    if (!memory.transcripts[0]) {
      if (!memory.audioUrl) return;
      await prisma.memory.update({ where: { id: memoryId }, data: { status: "transcribing", processingError: null } });
      const filePath = path.join(process.cwd(), memory.audioUrl.replace(/^\//, ""));
      const result = await transcribeAudio(filePath, mimeFor(filePath), memory.durationSec, tags);
      if (!result.text) {
        await prisma.memory.update({ where: { id: memoryId }, data: { status: "failed", processingError: result.reason ?? "We couldn't make out the words." } });
        return;
      }
      await prisma.transcriptVersion.create({ data: { memoryId, source: "machine", text: result.text } });
      await prisma.memory.update({ where: { id: memoryId }, data: { status: "transcribed" } });
      if (!memory.storybook.keepRecordings) await removeAudio(memoryId, memory.audioUrl);
      memory = await prisma.memory.findUniqueOrThrow({
        where: { id: memoryId },
        include: { storybook: true, contributor: true, transcripts: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
    }

    await interpret(memoryId, memory.transcripts[0].text, !memory.title);
  } catch (error: any) {
    console.error(`Processing memory ${memoryId} failed:`, error?.message ?? error);
    await prisma.memory
      .update({ where: { id: memoryId }, data: { status: "failed", processingError: "Something went wrong while preparing this memory." } })
      .catch(() => undefined);
  } finally {
    running.delete(memoryId);
  }
}

// (Re)interprets after a transcript is saved or corrected.
export async function interpret(memoryId: string, transcript: string, setTitle: boolean) {
  const result = await interpretMemory(transcript, { memoryId });
  await prisma.memoryInterpretation.upsert({
    where: { memoryId },
    update: { events: result.events, emotions: result.emotions, themes: result.themes, isMock: result.isMock },
    create: { memoryId, events: result.events, emotions: result.emotions, themes: result.themes, isMock: result.isMock },
  });
  const memory = await prisma.memory.findUniqueOrThrow({ where: { id: memoryId }, include: { chapterSources: true } });
  await prisma.memory.update({
    where: { id: memoryId },
    data: {
      status: memory.chapterSources.length ? "ready" : "interpreted",
      processingError: null,
      ...(setTitle && result.title ? { title: result.title.slice(0, 80) } : {}),
    },
  });
}

async function removeAudio(memoryId: string, audioUrl: string) {
  const filePath = path.join(process.cwd(), audioUrl.replace(/^\//, ""));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await prisma.memory.update({ where: { id: memoryId }, data: { audioUrl: null } });
}

// Memories left mid-way by a server restart pick up where they stopped.
export async function resumeUnfinishedMemories() {
  const stuck = await prisma.memory.findMany({
    where: { OR: [{ status: { in: ["recorded", "transcribing"] }, audioUrl: { not: null } }, { status: "transcribed" }] },
    select: { id: true },
  });
  for (const m of stuck) void processMemory(m.id);
}
