-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN "publishedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storybookId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "title" TEXT,
    "eventDate" DATETIME,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "audioUrl" TEXT,
    "durationSec" INTEGER,
    "visibility" TEXT NOT NULL DEFAULT 'contributor_only',
    "storyUseConsent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "processingError" TEXT,
    "promptId" TEXT,
    "promptText" TEXT,
    "favoritedBy" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Memory_storybookId_fkey" FOREIGN KEY ("storybookId") REFERENCES "Storybook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Memory_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Memory" ("audioUrl", "contributorId", "createdAt", "durationSec", "eventDate", "id", "processingError", "promptId", "promptText", "recordedAt", "status", "storyUseConsent", "storybookId", "title", "visibility") SELECT "audioUrl", "contributorId", "createdAt", "durationSec", "eventDate", "id", "processingError", "promptId", "promptText", "recordedAt", "status", "storyUseConsent", "storybookId", "title", "visibility" FROM "Memory";
DROP TABLE "Memory";
ALTER TABLE "new_Memory" RENAME TO "Memory";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
