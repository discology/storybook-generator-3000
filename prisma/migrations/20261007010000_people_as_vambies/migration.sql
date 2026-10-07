-- AlterTable
ALTER TABLE "CharacterDesign" ADD COLUMN "look" TEXT NOT NULL DEFAULT 'vambie';
ALTER TABLE "DesignProposal" ADD COLUMN "look" TEXT NOT NULL DEFAULT 'vambie';

-- Looks drawn before VSB-86 are people, except the Vambie Family stored by hand
-- on 2026-10-06, whose notes start "A Vambie". Drafts keep "vambie": that's what
-- their next proposals will be.
UPDATE "CharacterDesign" SET "look" = 'person' WHERE "status" <> 'draft' AND "identity" NOT LIKE 'A Vambie%';
UPDATE "DesignProposal" SET "look" = 'person'
WHERE "designId" IN (SELECT "id" FROM "CharacterDesign" WHERE "identity" NOT LIKE 'A Vambie%');

-- A new Page Rules version that draws everyone as a Vambie, only while the old
-- default people rule is in use (an admin's own wording is left alone).
-- Existing chapters keep the rules they were made with.
INSERT INTO "GenerationRuleSet" ("id", "version", "rules", "createdAt")
SELECT 'vsb86_people_as_vambies', "version" + 1,
       json_set("rules", '$.peopleStyle', 'Everyone in this world is a Vambie, never a human. Draw every person with the same creature design as Baby Vambie: an oversized round head on a small simple body with short arms and legs (about two and a half heads tall), huge round eyes with dark shadowy rings and small dark pupils, and two tiny fangs. Keep those Vambie proportions for everyone: grown-ups are only a little taller than children, and words like tall or broad change their size a little, never into human proportions. Each keeps their own skin tone, the same shade, and who they are shows through their skin tone, hair, glasses, clothes and accessories. Anyone whose skin tone isn''t given has the classic Vambie pale gray-white skin. Teal-blue belongs to Baby Vambie alone: no one else is teal, blue or aqua. A description that says man, woman, child or person still means a Vambie of that age. Pets and other animals keep their own body, coat and markings and stand the way that animal does, with the Vambie eyes and tiny fangs. Never photorealistic.'),
       CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM "GenerationRuleSet"
WHERE "version" = (SELECT MAX("version") FROM "GenerationRuleSet")
  AND json_extract("rules", '$.peopleStyle') = 'Draw family members as warm, simple storybook figures. Do not try to resemble real people, and never make them photorealistic.';
