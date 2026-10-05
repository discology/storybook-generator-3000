-- CreateTable
CREATE TABLE "GenerationRuleSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "rules" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StoryPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "storyMoment" TEXT NOT NULL,
    "characters" TEXT NOT NULL,
    "setting" TEXT NOT NULL,
    "visibleAction" TEXT NOT NULL,
    "emotionalTone" TEXT NOT NULL,
    "continuity" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "interpretationNote" TEXT NOT NULL,
    "sourceMemoryId" TEXT,
    "sourceQuote" TEXT,
    "checkStatus" TEXT NOT NULL DEFAULT 'unchecked',
    "checkNotes" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoryPage_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "imagePath" TEXT,
    "prompt" TEXT NOT NULL,
    "model" TEXT,
    "error" TEXT,
    "checkStatus" TEXT NOT NULL DEFAULT 'unchecked',
    "checkNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageAsset_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "StoryPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "ruleSetVersion" INTEGER,
    "generationSnapshot" TEXT,
    "characterSheet" TEXT,
    "pagesStatus" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Chapter_storybookId_fkey" FOREIGN KEY ("storybookId") REFERENCES "Storybook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Chapter" ("content", "createdAt", "guardianStatus", "id", "isMock", "revisionRequested", "sequence", "status", "storybookId", "title") SELECT "content", "createdAt", "guardianStatus", "id", "isMock", "revisionRequested", "sequence", "status", "storybookId", "title" FROM "Chapter";
DROP TABLE "Chapter";
ALTER TABLE "new_Chapter" RENAME TO "Chapter";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GenerationRuleSet_version_key" ON "GenerationRuleSet"("version");

-- CreateIndex
CREATE UNIQUE INDEX "StoryPage_chapterId_pageNumber_key" ON "StoryPage"("chapterId", "pageNumber");
