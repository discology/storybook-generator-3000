-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN "unresolvedPeople" TEXT;

-- AlterTable
ALTER TABLE "PageAsset" ADD COLUMN "fixNote" TEXT;

-- CreateTable
CREATE TABLE "FamilyCharacter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT '',
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "context" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FamilyCharacter_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CharacterDesign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyCharacterId" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'today',
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "identity" TEXT NOT NULL DEFAULT '',
    "usualClothing" TEXT NOT NULL DEFAULT '',
    "changeNote" TEXT NOT NULL DEFAULT '',
    "styleSnapshot" TEXT NOT NULL DEFAULT '',
    "photoPath" TEXT,
    "portraitPath" TEXT,
    "sheetPath" TEXT,
    "sheetStatus" TEXT NOT NULL DEFAULT 'none',
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterDesign_familyCharacterId_fkey" FOREIGN KEY ("familyCharacterId") REFERENCES "FamilyCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DesignProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "designId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesignProposal_designId_fkey" FOREIGN KEY ("designId") REFERENCES "CharacterDesign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageAppearance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "familyCharacterId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "outfit" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "PageAppearance_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "StoryPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PageAppearance_familyCharacterId_fkey" FOREIGN KEY ("familyCharacterId") REFERENCES "FamilyCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PageAppearance_designId_fkey" FOREIGN KEY ("designId") REFERENCES "CharacterDesign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PageAppearance_pageId_familyCharacterId_key" ON "PageAppearance"("pageId", "familyCharacterId");
