import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

export const prisma = new PrismaClient();

// SQLite's default journal mode lets a steady stream of readers starve writers
// (measured: one commit in 10 s under 50 concurrent readers, against 125 with
// WAL). WAL keeps readers and the one writer out of each other's way. It is
// stored in the database file, so this is a no-op after the first run.
// (Prisma's SQLite driver already waits up to 5 s on a locked database.)
void prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL").catch((error) => console.error("SQLite WAL:", error?.message));
