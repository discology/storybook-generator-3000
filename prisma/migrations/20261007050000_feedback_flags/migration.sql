
-- CreateTable
CREATE TABLE "Flag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "pageId" TEXT,
    "assetId" TEXT,
    "target" TEXT NOT NULL,
    "categories" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT NOT NULL DEFAULT '',
    "shouldBe" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "feedbackId" TEXT,
    "createdById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "actionItemId" TEXT,
    "snapshot" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Flag_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Flag_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "StoryPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Flag_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Flag_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "jiraKey" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActionItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlagRedraw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flagId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'drawing',
    "imagePath" TEXT,
    "prompt" TEXT NOT NULL DEFAULT '',
    "model" TEXT,
    "ruleSetVersion" INTEGER,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlagRedraw_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "Flag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Flag_feedbackId_key" ON "Flag"("feedbackId");

-- CreateIndex
CREATE INDEX "Flag_createdAt_idx" ON "Flag"("createdAt");


-- Parents' chapter feedback given before flags existed joins the queue, labeled
-- by relationship (no names). Resolved feedback counts as reviewed.
INSERT INTO "Flag" ("id", "chapterId", "target", "categories", "note", "source", "feedbackId", "status", "snapshot", "createdAt", "updatedAt")
SELECT 'fb_' || f."id", f."chapterId", 'chapter', json_array(f."reason"), f."note", 'family', f."id",
       CASE f."status" WHEN 'resolved' THEN 'reviewed' ELSE 'new' END,
       json_object(
         'chapterTitle', c."title",
         'ruleSetVersion', c."ruleSetVersion",
         'stage', json_extract(c."generationSnapshot", '$.readerAgeBand'),
         'from', COALESCE(NULLIF(ct."relationship", ''), 'Family member')
       ),
       f."createdAt", f."createdAt"
FROM "StoryFeedback" f
JOIN "Chapter" c ON c."id" = f."chapterId"
LEFT JOIN "Contributor" ct ON ct."id" = f."contributorId";
