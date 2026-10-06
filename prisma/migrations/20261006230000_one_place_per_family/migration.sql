-- One place per person per family (VSB-72). Anyone with more than one place in
-- a family keeps one (the parent's place first, then a joined one, then the
-- oldest), and everything that pointed at their other places moves to it.

CREATE TEMP TABLE "_merge" AS
SELECT c."id" AS "dup",
  (SELECT k."id" FROM "Contributor" k
    WHERE k."householdId" = c."householdId" AND k."userId" = c."userId"
    ORDER BY (k."role" = 'owner') DESC, (k."inviteStatus" = 'joined') DESC, k."createdAt" ASC, k."id" ASC
    LIMIT 1) AS "keep"
FROM "Contributor" c
WHERE c."userId" IS NOT NULL;
DELETE FROM "_merge" WHERE "dup" = "keep";

-- Memories, feedback and export requests move to the kept place.
UPDATE "Memory" SET "contributorId" = (SELECT "keep" FROM "_merge" WHERE "dup" = "Memory"."contributorId")
WHERE "contributorId" IN (SELECT "dup" FROM "_merge");
UPDATE "StoryFeedback" SET "contributorId" = (SELECT "keep" FROM "_merge" WHERE "dup" = "StoryFeedback"."contributorId")
WHERE "contributorId" IN (SELECT "dup" FROM "_merge");
UPDATE "ExportRequest" SET "contributorId" = (SELECT "keep" FROM "_merge" WHERE "dup" = "ExportRequest"."contributorId")
WHERE "contributorId" IN (SELECT "dup" FROM "_merge");

-- Chapter access: the kept place gets every chapter either place could see.
INSERT OR IGNORE INTO "ChapterAccess" ("chapterId", "contributorId")
SELECT a."chapterId", m."keep" FROM "ChapterAccess" a JOIN "_merge" m ON m."dup" = a."contributorId";
DELETE FROM "ChapterAccess" WHERE "contributorId" IN (SELECT "dup" FROM "_merge");

-- Bookmarks and reading progress: where both places marked a chapter, the kept one stays.
DELETE FROM "ChapterMark"
WHERE "contributorId" IN (SELECT "dup" FROM "_merge")
  AND EXISTS (
    SELECT 1 FROM "ChapterMark" k JOIN "_merge" m ON m."keep" = k."contributorId"
    WHERE m."dup" = "ChapterMark"."contributorId" AND k."chapterId" = "ChapterMark"."chapterId"
  );
UPDATE "ChapterMark" SET "contributorId" = (SELECT "keep" FROM "_merge" WHERE "dup" = "ChapterMark"."contributorId")
WHERE "contributorId" IN (SELECT "dup" FROM "_merge");

-- Ids kept as JSON lists: favorites on memories, and who a chapter was shared with.
UPDATE "Memory" SET "favoritedBy" = (
  SELECT json_group_array(DISTINCT COALESCE(m."keep", j.value))
  FROM json_each("Memory"."favoritedBy") j LEFT JOIN "_merge" m ON m."dup" = j.value
)
WHERE json_valid("favoritedBy")
  AND EXISTS (SELECT 1 FROM json_each("Memory"."favoritedBy") j JOIN "_merge" m ON m."dup" = j.value);
UPDATE "ChapterShare" SET "recipientIds" = (
  SELECT json_group_array(DISTINCT COALESCE(m."keep", j.value))
  FROM json_each("ChapterShare"."recipientIds") j LEFT JOIN "_merge" m ON m."dup" = j.value
)
WHERE json_valid("recipientIds")
  AND EXISTS (SELECT 1 FROM json_each("ChapterShare"."recipientIds") j JOIN "_merge" m ON m."dup" = j.value);
UPDATE "ChapterShare" SET "sentBy" = (SELECT "keep" FROM "_merge" WHERE "dup" = "ChapterShare"."sentBy")
WHERE "sentBy" IN (SELECT "dup" FROM "_merge");

-- The extra places, and the invitations that created them, go.
DELETE FROM "Invitation" WHERE "contributorId" IN (SELECT "dup" FROM "_merge");
DELETE FROM "Contributor" WHERE "id" IN (SELECT "dup" FROM "_merge");
DROP TABLE "_merge";

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_householdId_userId_key" ON "Contributor"("householdId", "userId");
