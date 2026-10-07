-- AlterTable
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "smsConsentAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "smsConsentSource" TEXT;
