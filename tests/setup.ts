import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Every test file gets its own scratch SQLite database, migrated from the real
// migrations. Import this before anything that touches server/db.ts: the
// Prisma client reads DATABASE_URL when it's created.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vambie-test-"));
export const dbFile = path.join(dir, "test.db");
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.OPENAI_API_KEY = "";
process.env.GEMINI_API_KEY = "";
execFileSync("npx", ["prisma", "migrate", "deploy"], { env: process.env, stdio: "ignore" });
// Like the server at boot: WAL, so concurrency tests match production.
const { useWriteAheadLog } = await import("../server/db");
await useWriteAheadLog();
