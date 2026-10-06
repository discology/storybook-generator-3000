-- AlterTable
ALTER TABLE "Household" ADD COLUMN "guestExpiresAt" DATETIME;
ALTER TABLE "Household" ADD COLUMN "guestInvite" TEXT;
ALTER TABLE "Household" ADD COLUMN "guestToken" TEXT;

-- CreateTable
CREATE TABLE "GuestPreview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "GuestPreview_createdAt_idx" ON "GuestPreview"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Household_guestToken_key" ON "Household"("guestToken");

