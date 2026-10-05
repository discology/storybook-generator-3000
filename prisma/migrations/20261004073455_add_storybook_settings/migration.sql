-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "defaultVisibility" TEXT NOT NULL DEFAULT 'contributor_only',
    "defaultStoryUse" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Storybook_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Storybook" ("childId", "createdAt", "id", "readerAgeBand", "status", "title") SELECT "childId", "createdAt", "id", "readerAgeBand", "status", "title" FROM "Storybook";
DROP TABLE "Storybook";
ALTER TABLE "new_Storybook" RENAME TO "Storybook";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
