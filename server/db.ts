import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

export const prisma = new PrismaClient();

// SQLite's default journal mode lets a steady stream of readers starve writers
// (measured: one commit in 10 s under 50 concurrent readers, against 125 with
// WAL). WAL keeps readers and the one writer out of each other's way. It is
// stored in the database file, so after the first run this is a no-op.
// (Prisma's SQLite driver already waits up to 5 s on a locked database.)
//
// Switching modes needs the database to itself, so it has to finish before the
// server starts taking requests: server.ts awaits this first. Fired without
// waiting, it lost the race to other queries and failed with "database is
// locked" in 2 of 5 test boots, leaving the file in the old mode.
export async function useWriteAheadLog() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
      return;
    } catch (error: any) {
      if (attempt === 5) return console.error("SQLite WAL not enabled:", error?.message);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}
