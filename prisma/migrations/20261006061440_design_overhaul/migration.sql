-- AlterTable
ALTER TABLE "GuardianFinding" ADD COLUMN "quote" TEXT;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "renewRequestedAt" DATETIME;

-- AlterTable
ALTER TABLE "Memory" ADD COLUMN "processingError" TEXT;
ALTER TABLE "Memory" ADD COLUMN "promptId" TEXT;
ALTER TABLE "Memory" ADD COLUMN "promptText" TEXT;

-- AlterTable
ALTER TABLE "Prompt" ADD COLUMN "artworkPath" TEXT;

-- CreateTable
CREATE TABLE "ChapterMark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "lastPage" INTEGER NOT NULL DEFAULT 0,
    "readAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "ChapterMark_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChapterMark_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoryFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryFeedback_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoryFeedback_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChapterShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "sentBy" TEXT NOT NULL,
    "recipientIds" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChapterShare_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storybookId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "guardianStatus" TEXT NOT NULL DEFAULT 'not_reviewed',
    "revisionRequested" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "shareMode" TEXT NOT NULL DEFAULT 'family',
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "ruleSetVersion" INTEGER,
    "generationSnapshot" TEXT,
    "characterSheet" TEXT,
    "characterSheetImage" TEXT,
    "pagesStatus" TEXT NOT NULL DEFAULT 'none',
    "unresolvedPeople" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Chapter_storybookId_fkey" FOREIGN KEY ("storybookId") REFERENCES "Storybook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Chapter" ("characterSheet", "characterSheetImage", "content", "createdAt", "generationSnapshot", "guardianStatus", "id", "isMock", "pagesStatus", "revisionRequested", "ruleSetVersion", "sequence", "status", "storybookId", "title", "unresolvedPeople") SELECT "characterSheet", "characterSheetImage", "content", "createdAt", "generationSnapshot", "guardianStatus", "id", "isMock", "pagesStatus", "revisionRequested", "ruleSetVersion", "sequence", "status", "storybookId", "title", "unresolvedPeople" FROM "Chapter";
DROP TABLE "Chapter";
ALTER TABLE "new_Chapter" RENAME TO "Chapter";
CREATE TABLE "new_ExportRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storybookId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "filePath" TEXT,
    "contributorId" TEXT,
    "options" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    CONSTRAINT "ExportRequest_storybookId_fkey" FOREIGN KEY ("storybookId") REFERENCES "Storybook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExportRequest" ("createdAt", "expiresAt", "filePath", "id", "status", "storybookId") SELECT "createdAt", "expiresAt", "filePath", "id", "status", "storybookId" FROM "ExportRequest";
DROP TABLE "ExportRequest";
ALTER TABLE "new_ExportRequest" RENAME TO "ExportRequest";
CREATE TABLE "new_Storybook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "readerAgeBand" TEXT NOT NULL DEFAULT '0-3',
    "growWithChild" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'English',
    "status" TEXT NOT NULL DEFAULT 'active',
    "reminderFrequency" TEXT NOT NULL DEFAULT 'weekly',
    "reminderDay" TEXT NOT NULL DEFAULT 'Sunday',
    "reminderTime" TEXT NOT NULL DEFAULT '19:00',
    "reminderTimezone" TEXT NOT NULL DEFAULT 'Pacific Time',
    "reminderChannel" TEXT NOT NULL DEFAULT 'SMS',
    "remindersPaused" BOOLEAN NOT NULL DEFAULT false,
    "remindersPausedUntil" DATETIME,
    "defaultVisibility" TEXT NOT NULL DEFAULT 'contributor_only',
    "defaultStoryUse" BOOLEAN NOT NULL DEFAULT true,
    "keepRecordings" BOOLEAN NOT NULL DEFAULT true,
    "vambieNameAge" INTEGER NOT NULL DEFAULT 4,
    "lastBatchAt" DATETIME,
    "pendingCastKeys" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Storybook_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Storybook" ("childId", "createdAt", "defaultStoryUse", "defaultVisibility", "growWithChild", "id", "language", "readerAgeBand", "reminderChannel", "reminderDay", "reminderFrequency", "reminderTime", "reminderTimezone", "remindersPaused", "status", "title") SELECT "childId", "createdAt", "defaultStoryUse", "defaultVisibility", "growWithChild", "id", "language", "readerAgeBand", "reminderChannel", "reminderDay", "reminderFrequency", "reminderTime", "reminderTimezone", "remindersPaused", "status", "title" FROM "Storybook";
DROP TABLE "Storybook";
ALTER TABLE "new_Storybook" RENAME TO "Storybook";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ChapterMark_chapterId_contributorId_key" ON "ChapterMark"("chapterId", "contributorId");
