-- CreateTable
CREATE TABLE "FunnelEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitorId" TEXT NOT NULL,
    "householdId" TEXT,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "clickId" TEXT,
    "referral" TEXT,
    "props" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "FunnelEvent_name_createdAt_idx" ON "FunnelEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "FunnelEvent_visitorId_idx" ON "FunnelEvent"("visitorId");

-- CreateIndex
CREATE INDEX "FunnelEvent_source_campaign_name_idx" ON "FunnelEvent"("source", "campaign", "name");
