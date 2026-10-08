-- AlterTable
ALTER TABLE "FlagRedraw" ADD COLUMN "shot" TEXT;

-- AlterTable
ALTER TABLE "StoryPage" ADD COLUMN "shotReplan" TEXT;

-- CreateTable
CREATE TABLE "ShotReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "blockedId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShotReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShotReview_signature_key" ON "ShotReview"("signature");
