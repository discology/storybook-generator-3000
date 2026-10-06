-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CharacterArt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "prompt" TEXT,
    "view" TEXT,
    "expression" TEXT,
    "artSet" TEXT NOT NULL DEFAULT '',
    "fileHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterArt_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CharacterArt" ("characterId", "createdAt", "id", "imagePath", "prompt", "source") SELECT "characterId", "createdAt", "id", "imagePath", "prompt", "source" FROM "CharacterArt";
DROP TABLE "CharacterArt";
ALTER TABLE "new_CharacterArt" RENAME TO "CharacterArt";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
