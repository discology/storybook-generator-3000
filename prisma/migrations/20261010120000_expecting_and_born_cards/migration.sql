-- Expecting families get their own prompt cards (VSB-117). Prompt.childStage now
-- reads Both ("All stages"), Expecting, Born, Newborn or Toddler (server/promptStages.ts).

-- Starter cards that only make sense once the child is born.
UPDATE "Prompt" SET "childStage" = 'Born'
WHERE "childStage" = 'All stages'
  AND ("question" IN ('What made you smile today?', 'What did they try for the first time?', 'When did you feel close to them today?')
       OR "question" LIKE '%first word%');

-- The first expecting cards, from the Words of Wisdom sentence starters. Each is
-- added once; a card with the same question is left alone.
INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What would you like <child_name> to call you, and why that name?', 'Call me…', 'Before you arrive', 'Everyone', 'Expecting', 'purple', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What would you like <child_name> to call you, and why that name?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'Finish this for <child_name>: Come to me when…', 'Come to me when…', 'Before you arrive', 'Everyone', 'Expecting', 'gold', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'Finish this for <child_name>: Come to me when…');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'Finish this for <child_name>: I promise you…', 'I promise…', 'Before you arrive', 'Everyone', 'Expecting', 'pink', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'Finish this for <child_name>: I promise you…');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'Where were you when you heard <child_name> was on the way? What did you feel?', 'The news', 'Before you arrive', 'Everyone', 'Expecting', 'green', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'Where were you when you heard <child_name> was on the way? What did you feel?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'When did <child_name> start to feel real to you?', 'It''s real', 'Before you arrive', 'Everyone', 'Expecting', 'purple', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'When did <child_name> start to feel real to you?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What do you hope <child_name> gets from our family?', 'From our family', 'Before you arrive', 'Everyone', 'Expecting', 'gold', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What do you hope <child_name> gets from our family?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What''s a song, a story or a recipe you can''t wait to share with <child_name>?', 'Saving it for you', 'Before you arrive', 'Everyone', 'Expecting', 'pink', 0, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What''s a song, a story or a recipe you can''t wait to share with <child_name>?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What will you teach <child_name> that someone once taught you?', 'Passed down', 'Before you arrive', 'Everyone', 'Expecting', 'green', 0, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What will you teach <child_name> that someone once taught you?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What do you want to show <child_name> first, once they''re here?', 'First things first', 'Before you arrive', 'Everyone', 'Expecting', 'purple', 0, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What do you want to show <child_name> first, once they''re here?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What do you imagine holding <child_name> for the first time will be like?', 'The first hold', 'Before you arrive', 'Everyone', 'Expecting', 'gold', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What do you imagine holding <child_name> for the first time will be like?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'When did you notice <child_name> today? A kick, a hiccup, a quiet moment.', 'Today, inside', 'Before you arrive', 'Parents', 'Expecting', 'pink', 0, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'When did you notice <child_name> today? A kick, a hiccup, a quiet moment.');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What did you do to get ready for <child_name> this week?', 'Getting ready', 'Before you arrive', 'Parents', 'Expecting', 'green', 0, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What did you do to get ready for <child_name> this week?');
