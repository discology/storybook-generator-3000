-- VSB-138: each person's Text messages settings, and texts held for quiet hours.
ALTER TABLE "User" ADD COLUMN "textsPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "textNewChapters" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "textFromFamily" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "textFamilyNews" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "textFixes" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "quietHours" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "quietStart" TEXT NOT NULL DEFAULT '21:00';
ALTER TABLE "User" ADD COLUMN "quietEnd" TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE "User" ADD COLUMN "textTimezone" TEXT NOT NULL DEFAULT 'Pacific Time';
ALTER TABLE "User" ADD COLUMN "textSettingsKey" TEXT;
CREATE UNIQUE INDEX "User_textSettingsKey_key" ON "User"("textSettingsKey");
ALTER TABLE "TextMessage" ADD COLUMN "sendAfter" DATETIME;
