-- AlterTable
ALTER TABLE "User" ADD COLUMN "textsOptedOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "textsOptedOutAt" DATETIME;
ALTER TABLE "Storybook" ADD COLUMN "lastReminderAt" DATETIME;

-- CreateTable
CREATE TABLE "TextMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event" TEXT NOT NULL,
    "userId" TEXT,
    "householdId" TEXT,
    "toMasked" TEXT NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL,
    "skipReason" TEXT,
    "twilioSid" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TextMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TextMessage_twilioSid_key" ON "TextMessage"("twilioSid");
CREATE INDEX "TextMessage_createdAt_idx" ON "TextMessage"("createdAt");
