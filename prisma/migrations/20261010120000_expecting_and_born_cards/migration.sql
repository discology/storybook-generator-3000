-- Expecting families get their own prompt cards (VSB-117, VSB-122). Prompt.childStage
-- now reads Both ("All stages"), Expecting, Born, Newborn or Toddler (server/promptStages.ts).
-- Cards changed by hand in the admin (no longer "All stages") are left alone.

-- Starter cards that only make sense once the child is born.
UPDATE "Prompt" SET "childStage" = 'Born'
WHERE "childStage" = 'All stages'
  AND ("question" IN ('What made you smile today?', 'What did they try for the first time?', 'When did you feel close to them today?')
       OR "question" LIKE '%first word%');

-- The 16 reflective cards (VSB-110) look back on a child who's here, so they move
-- to Born; the Words of Wisdom cards below are their before-the-birth versions.
UPDATE "Prompt" SET "childStage" = 'Born'
WHERE "childStage" = 'All stages' AND (
        "question" LIKE 'What is something about the person I was before you arrived%'
     OR "question" LIKE 'What did my family call%love%when I was little%'
     OR "question" LIKE 'What part of myself did I once hide to fit in%'
     OR "question" LIKE 'Tell me about a moment when you showed me who you are%'
     OR "question" LIKE 'What am I learning alongside you%'
     OR "question" LIKE 'When did I first choose something for myself%'
     OR "question" LIKE 'Who made me feel welcome when I felt different%'
     OR "question" LIKE 'Who loved me in a way I didn%'
     OR "question" LIKE 'What do I hope you inherit from our family%'
     OR "question" LIKE 'What family habit do I hope we keep%'
     OR "question" LIKE 'Tell me about a time I hurt someone%'
     OR "question" LIKE 'What ordinary-looking moment required more courage%'
     OR "question" LIKE 'What did I once need permission to be%'
     OR "question" LIKE 'What small moment with you would I keep%'
     OR "question" LIKE 'What do I hope stays true between us%'
     OR "question" LIKE 'What am I excited to discover about you%'
);

-- Genesis's Words of Wisdom cards, in her order (VSB-122). Each is added once; a
-- card with the same question is left alone.

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What would you like <child_name> to know they can bring to you—even when they don’t know how to say it?', 'You can come to me when…', 'Words of wisdom', 'Everyone', 'Expecting', 'purple', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What would you like <child_name> to know they can bring to you—even when they don’t know how to say it?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What did you grow up believing you had to earn? What would you like <child_name> to receive freely?', 'You don’t have to earn…', 'Words of wisdom', 'Everyone', 'Expecting', 'gold', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What did you grow up believing you had to earn? What would you like <child_name> to receive freely?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'Before <child_name> knows you as Mom, Uncle, or Grandma, what story would help them know you as a person?', 'Before you know me as…', 'Words of wisdom', 'Everyone', 'Expecting', 'pink', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'Before <child_name> knows you as Mom, Uncle, or Grandma, what story would help them know you as a person?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What part of yourself took you a long time to welcome? What would you tell a child discovering that same part?', 'There’s room for this part of you…', 'Words of wisdom', 'Everyone', 'Expecting', 'green', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What part of yourself took you a long time to welcome? What would you tell a child discovering that same part?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'Tell <child_name> about a mistake you made—and what happened after it. What would you want them to remember when they make their own?', 'When you get it wrong…', 'Words of wisdom', 'Everyone', 'Expecting', 'purple', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'Tell <child_name> about a mistake you made—and what happened after it. What would you want them to remember when they make their own?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What is something beautiful about this family you hope <child_name> carries forward? What would you give them permission to do differently?', 'In our family, we…', 'Words of wisdom', 'Everyone', 'Expecting', 'gold', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What is something beautiful about this family you hope <child_name> carries forward? What would you give them permission to do differently?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'When did you choose a different path from the one others expected? What helped you take that step?', 'You’re allowed to change your mind…', 'Words of wisdom', 'Everyone', 'Expecting', 'pink', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'When did you choose a different path from the one others expected? What helped you take that step?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'Tell <child_name> about a small, ordinary act that made you feel deeply loved.', 'Love sometimes looks like…', 'Words of wisdom', 'Everyone', 'Expecting', 'green', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'Tell <child_name> about a small, ordinary act that made you feel deeply loved.');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'Who made room for you when you felt you didn’t belong? What did they do that you hope to do for <child_name>?', 'When you feel out of place…', 'Words of wisdom', 'Everyone', 'Expecting', 'purple', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'Who made room for you when you felt you didn’t belong? What did they do that you hope to do for <child_name>?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What are you still figuring out that you’d be willing to learn alongside <child_name>?', 'Something I’m still learning…', 'Words of wisdom', 'Everyone', 'Expecting', 'gold', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What are you still figuring out that you’d be willing to learn alongside <child_name>?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What simple pleasure would you love to introduce <child_name> to? Tell them why it matters to you.', 'Something we could do together…', 'Words of wisdom', 'Everyone', 'Expecting', 'pink', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What simple pleasure would you love to introduce <child_name> to? Tell them why it matters to you.');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What can you offer <child_name> that is within your power—even when life doesn’t go as planned?', 'A promise I can keep…', 'Words of wisdom', 'Everyone', 'Expecting', 'green', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What can you offer <child_name> that is within your power—even when life doesn’t go as planned?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What do you hope <child_name> will trust about your relationship, even when you don’t understand each other?', 'When we disagree…', 'Words of wisdom', 'Everyone', 'Expecting', 'purple', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What do you hope <child_name> will trust about your relationship, even when you don’t understand each other?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What are you looking forward to discovering about <child_name>, without deciding in advance who they should become?', 'You get to surprise us…', 'Words of wisdom', 'Everyone', 'Expecting', 'gold', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What are you looking forward to discovering about <child_name>, without deciding in advance who they should become?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'If <child_name> could carry just one sentence from you into their life, what would it be—and what experience taught it to you?', 'Before we meet, I want you to know…', 'Words of wisdom', 'Everyone', 'Expecting', 'pink', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'If <child_name> could carry just one sentence from you into their life, what would it be—and what experience taught it to you?');

-- More expecting cards: the moments around the pregnancy itself (VSB-117).

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What would you like <child_name> to call you, and why that name?', 'Call me…', 'Before you arrive', 'Everyone', 'Expecting', 'green', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What would you like <child_name> to call you, and why that name?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'Where were you when you heard <child_name> was on the way? What did you feel?', 'The news', 'Before you arrive', 'Everyone', 'Expecting', 'purple', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'Where were you when you heard <child_name> was on the way? What did you feel?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'When did <child_name> start to feel real to you?', 'It''s real', 'Before you arrive', 'Everyone', 'Expecting', 'gold', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'When did <child_name> start to feel real to you?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What will you teach <child_name> that someone once taught you?', 'Passed down', 'Before you arrive', 'Everyone', 'Expecting', 'pink', 0, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What will you teach <child_name> that someone once taught you?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What do you want to show <child_name> first, once they''re here?', 'First things first', 'Before you arrive', 'Everyone', 'Expecting', 'green', 0, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What do you want to show <child_name> first, once they''re here?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What do you imagine holding <child_name> for the first time will be like?', 'The first hold', 'Before you arrive', 'Everyone', 'Expecting', 'purple', 1, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What do you imagine holding <child_name> for the first time will be like?');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'When did you notice <child_name> today? A kick, a hiccup, a quiet moment.', 'Today, inside', 'Before you arrive', 'Parents', 'Expecting', 'gold', 0, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'When did you notice <child_name> today? A kick, a hiccup, a quiet moment.');

INSERT INTO "Prompt" ("id", "question", "supportingText", "category", "audience", "childStage", "cardColor", "answerOnce", "status", "sortOrder", "createdAt")
SELECT 'exp' || lower(hex(randomblob(11))), 'What did you do to get ready for <child_name> this week?', 'Getting ready', 'Before you arrive', 'Parents', 'Expecting', 'pink', 0, 'published', (SELECT COALESCE(MAX("sortOrder"), -1) + 1 FROM "Prompt"), CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "question" = 'What did you do to get ready for <child_name> this week?');
