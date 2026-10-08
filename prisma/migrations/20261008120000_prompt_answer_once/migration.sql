-- Prompt cards answered once per person (VSB-113)
ALTER TABLE "Prompt" ADD COLUMN "answerOnce" BOOLEAN NOT NULL DEFAULT false;
