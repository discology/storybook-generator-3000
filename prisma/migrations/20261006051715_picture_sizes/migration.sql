-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoryPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "storyMoment" TEXT NOT NULL,
    "characters" TEXT NOT NULL,
    "setting" TEXT NOT NULL,
    "visibleAction" TEXT NOT NULL,
    "emotionalTone" TEXT NOT NULL,
    "continuity" TEXT NOT NULL,
    "shot" TEXT,
    "pictureSize" TEXT NOT NULL DEFAULT '',
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
INSERT INTO "new_StoryPage" ("approvedAt", "chapterId", "characters", "checkNotes", "checkStatus", "continuity", "createdAt", "emotionalTone", "id", "interpretationNote", "pageNumber", "setting", "shot", "sourceMemoryId", "sourceQuote", "storyMoment", "text", "updatedAt", "visibleAction") SELECT "approvedAt", "chapterId", "characters", "checkNotes", "checkStatus", "continuity", "createdAt", "emotionalTone", "id", "interpretationNote", "pageNumber", "setting", "shot", "sourceMemoryId", "sourceQuote", "storyMoment", "text", "updatedAt", "visibleAction" FROM "StoryPage";
DROP TABLE "StoryPage";
ALTER TABLE "new_StoryPage" RENAME TO "StoryPage";
CREATE UNIQUE INDEX "StoryPage_chapterId_pageNumber_key" ON "StoryPage"("chapterId", "pageNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
