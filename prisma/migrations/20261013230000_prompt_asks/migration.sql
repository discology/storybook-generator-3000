-- VSB-131: one family member asks another to answer a card they've answered.
CREATE TABLE "PromptAsk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storybookId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptAsk_storybookId_fkey" FOREIGN KEY ("storybookId") REFERENCES "Storybook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromptAsk_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Contributor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromptAsk_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Contributor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PromptAsk_storybookId_toId_idx" ON "PromptAsk"("storybookId", "toId");

CREATE UNIQUE INDEX "PromptAsk_storybookId_promptId_fromId_toId_key" ON "PromptAsk"("storybookId", "promptId", "fromId", "toId");
