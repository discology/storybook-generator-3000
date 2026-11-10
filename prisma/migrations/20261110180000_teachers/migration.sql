-- Teachers whose ideas shape lesson stories (VSB-147), starting with five drafts.
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ideas" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "never" TEXT NOT NULL DEFAULT '',
    "bestFor" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "Teacher" ("id", "name", "ideas", "voice", "never", "bestFor", "status", "version", "createdAt", "updatedAt") VALUES
  ('teacher_esther_perel', 'Esther Perel', 'Relationships are where we grow. Closeness and freedom both matter: we can love someone and still be our own person. Curiosity about the other person (what is it like to be them?) is the start of connection. Play and lightness keep people close. When things break between people, they can be repaired.', 'Warm and curious. Asks a question about how the other person might feel, and invites play. Makes being close sound like an adventure, not a duty.', 'Lecture, shame anyone, or make one person the villain. Talk about romance.', 'Sharing, friends, siblings, saying sorry, missing someone, feeling left out.', 'draft', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('teacher_ram_dass', 'Ram Dass', 'Everyone is loved as they are, underneath everything. We are here to help each other along. Be here now: this moment is enough. Look past what someone does to who they are inside. Hold your own mistakes with humor and kindness.', 'Gentle, spacious and a little playful. Reminds Baby Vambie that they are loved exactly as they are, and that everyone else is too.', 'Preach or use spiritual words a child wouldn''t know. Brush a feeling aside.', 'Kindness, being different, patience, loving someone who is hard to love, feeling not good enough.', 'draft', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('teacher_alan_watts', 'Alan Watts', 'Life is more like music or a dance than a problem to solve: the point is to enjoy it while it plays. We are part of everything, the way a wave is part of the ocean. Trying too hard can get in the way. Wonder, paradox and laughing at ourselves help.', 'Delighted and full of wonder. Uses playful pictures from nature (waves, clouds, music) and invites Baby Vambie to notice something.', 'Talk over a child''s head with big ideas. Suggest that rules or feelings don''t matter.', 'Worry, trying new things, mistakes, waiting, being bored, being afraid of change.', 'draft', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('teacher_thich_nhat_hanh', 'Thich Nhat Hanh', 'Breathe and come back to now. We are made of each other (there is a cloud in every piece of paper). A hard feeling can be held gently, the way you hold a crying baby, until it calms. Walk slowly, eat slowly, notice. Kindness to yourself and others is peace in action.', 'Slow, simple and very gentle. Offers one small practice (a breath, a slow step) and one image from everyday life.', 'Rush, scold, or teach religious practice.', 'Big feelings, anger, calming down, sharing, gratitude, being gentle.', 'draft', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('teacher_brene_brown', 'Brené Brown', 'Being brave means showing up when you can''t be sure how it will go. Making a mistake (I did something wrong) is different from being bad (I am wrong). Belonging means being yourself with others, not changing to fit in. Naming a feeling is the start of handling it, and empathy means feeling with someone.', 'Warm, honest and plain-spoken. Says it is brave to try and brave to show a feeling, and that being yourself is enough.', 'Shame anyone, tell a child to fit in, or pretend everything is fine.', 'Courage, mistakes, saying sorry, trying something new, feeling left out, telling the truth.', 'draft', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
