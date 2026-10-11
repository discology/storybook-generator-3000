-- The born-only starter cards, matched by meaning rather than exact wording (VSB-117).
-- 20261010120000 matched the seed text ("…close to them today?"), so a card edited
-- in the admin to use the child's name ("…close to <child_name> today?") stayed Both
-- and showed to expecting families. Cards someone has already set by hand are left alone.
UPDATE "Prompt" SET "childStage" = 'Born'
WHERE "childStage" = 'All stages'
  AND ("question" LIKE '%feel close to%today%'
       OR "question" LIKE '%try for the first time%'
       OR "question" LIKE '%made you smile today%'
       OR "question" LIKE '%first word%');
