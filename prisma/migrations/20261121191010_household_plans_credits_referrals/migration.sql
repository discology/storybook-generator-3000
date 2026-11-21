-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "stripePriceId" TEXT,
    "chapterAllowance" INTEGER,
    "allowancePeriod" TEXT NOT NULL DEFAULT 'month',
    "maxPagesPerChapter" INTEGER,
    "maxReadingStage" INTEGER,
    "familySeats" INTEGER,
    "maxChildren" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "pastDueSince" DATETIME,
    "paidAt" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "pool" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditEntry_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Added in place rather than rebuilding Household, so existing rows and the
-- tables that point at them are untouched.
ALTER TABLE "Household" ADD COLUMN "grandfathered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Household" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "Household" ADD COLUMN "referredByHouseholdId" TEXT;
ALTER TABLE "Household" ADD COLUMN "referredByUserId" TEXT;
CREATE UNIQUE INDEX "Household_referralCode_key" ON "Household"("referralCode");
CREATE INDEX "Household_referredByHouseholdId_idx" ON "Household"("referredByHouseholdId");

-- Families already saved keep making chapters as before; unsaved visitor
-- drafts get the new free-first-chapter rule when they're saved.
UPDATE "Household" SET "grandfathered" = true WHERE "ownerUserId" IS NOT NULL;

-- The two plans. Free: the first full chapter. Family: $20/month, 5 chapters a
-- calendar month, 12 pages, every reading stage, unlimited seats and children.
INSERT INTO "Plan" ("id", "name", "priceCents", "chapterAllowance", "allowancePeriod", "maxPagesPerChapter", "active")
VALUES ('free', 'Free', 0, 1, 'lifetime', 12, true),
       ('family', 'Family', 2000, 5, 'month', 12, true);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_stripePriceId_key" ON "Plan"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_householdId_key" ON "Subscription"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "CreditEntry_householdId_createdAt_idx" ON "CreditEntry"("householdId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditEntry_householdId_reason_refType_refId_key" ON "CreditEntry"("householdId", "reason", "refType", "refId");
