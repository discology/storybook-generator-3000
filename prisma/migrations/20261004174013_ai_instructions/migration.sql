-- CreateTable
CREATE TABLE "AiInstruction" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "model" TEXT,
    "updatedAt" DATETIME NOT NULL
);
