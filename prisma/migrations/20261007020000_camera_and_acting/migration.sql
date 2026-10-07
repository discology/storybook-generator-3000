-- A new Page Rules version (VSB-90): adds "Camera and acting" for page pictures,
-- and swaps the art direction's "simple faces, central 80%" sentence for
-- expressive faces. Runs once (only while the newest version has no camera and
-- acting yet); the rest of the art direction stays as the admin wrote it.
-- Existing chapters keep the rules they were made with.
INSERT INTO "GenerationRuleSet" ("id", "version", "rules", "createdAt")
SELECT 'vsb90_camera_and_acting', "version" + 1,
       json_set(
         json_set("rules", '$.pictureDirection', 'Direct every picture like a still from a warm, beautifully shot picture-book film. Frame it exactly as the camera says: a close-up fills the frame with a face, hands or a small object and crops boldly; a wide shot makes the characters small in their world; a low angle looks up at its subject and a bird''s-eye view looks straight down. Place the subject off-center, with something in the foreground, depth behind, and open space where the feeling needs room; never line the characters up in the middle facing the viewer. Not every picture centers on the characters: the focus can be a hand, an object or the place. Catch the moment mid-movement (leaning, reaching, turning, mid-step) and show the feeling on every face and in every body: eyes, brows and mouth change with the mood, and shoulders and posture follow. Keep it gentle and warm: quiet moments can be still, but never stiff or posed.'),
         '$.illustrationStyle',
         replace(json_extract("rules", '$.illustrationStyle'), 'Simple faces; feelings show through posture and small gestures. Keep faces and the key action inside the central 80% of the frame.', 'Expressive faces drawn simply: feelings show in the eyes, brows and mouth as well as in posture and gesture.')
       ),
       CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM "GenerationRuleSet"
WHERE "version" = (SELECT MAX("version") FROM "GenerationRuleSet")
  AND json_extract("rules", '$.pictureDirection') IS NULL;
