
-- CreateTable
CREATE TABLE "GuideBook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "rules" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuideBook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedbackAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error" TEXT,
    "filters" TEXT NOT NULL DEFAULT '{}',
    "flagIds" TEXT NOT NULL DEFAULT '[]',
    "guideVersion" INTEGER,
    "ruleSetVersion" INTEGER,
    "summary" TEXT NOT NULL DEFAULT '',
    "patterns" TEXT NOT NULL DEFAULT '[]',
    "costUsd" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AnalysisSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "before" TEXT NOT NULL DEFAULT '',
    "after" TEXT NOT NULL DEFAULT '',
    "why" TEXT NOT NULL DEFAULT '',
    "verify" TEXT NOT NULL DEFAULT '',
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "flagIds" TEXT NOT NULL DEFAULT '[]',
    "ruleIds" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "actionItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalysisSuggestion_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "FeedbackAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FlagRedraw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flagId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'today',
    "suggestionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'drawing',
    "imagePath" TEXT,
    "prompt" TEXT NOT NULL DEFAULT '',
    "model" TEXT,
    "ruleSetVersion" INTEGER,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlagRedraw_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "Flag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FlagRedraw_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "AnalysisSuggestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FlagRedraw" ("createdAt", "error", "flagId", "id", "imagePath", "model", "prompt", "ruleSetVersion", "status") SELECT "createdAt", "error", "flagId", "id", "imagePath", "model", "prompt", "ruleSetVersion", "status" FROM "FlagRedraw";
DROP TABLE "FlagRedraw";
ALTER TABLE "new_FlagRedraw" RENAME TO "FlagRedraw";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GuideBook_version_key" ON "GuideBook"("version");

