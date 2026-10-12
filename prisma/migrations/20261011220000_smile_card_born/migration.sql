-- One more born-only starter card (VSB-117). 20261010230000 looked for "made you
-- smile today", but the live card was reworded to "What did <child_name> do today
-- that made you smile?", so it stayed Both and showed to expecting families
-- ("What did Lilith do today that made you smile?"). Cards someone has already
-- set by hand are left alone.
UPDATE "Prompt" SET "childStage" = 'Born'
WHERE "childStage" = 'All stages'
  AND "question" LIKE '%made you smile%';
