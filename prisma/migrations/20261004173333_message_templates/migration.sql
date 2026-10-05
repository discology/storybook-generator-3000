-- CreateTable
CREATE TABLE "MessageTemplate" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
