ALTER TABLE public.beagu_postit_posts
 ADD COLUMN IF NOT EXISTS comparison_selection text;
ALTER TABLE public.beagu_postit_posts
 DROP CONSTRAINT IF EXISTS beagu_postit_subject_valid;
ALTER TABLE public.beagu_postit_posts
 ADD CONSTRAINT beagu_postit_subject_valid CHECK (
  (subject_type='school' AND school_id IS NOT NULL AND game_slug IS NULL AND comparison_selection IS NULL)
  OR
  (subject_type='game' AND school_id IS NULL AND game_slug IN
   ('teacher-volleyball','teacher-run','teacher-class-diary-play') AND comparison_selection IS NULL)
  OR
  (subject_type='comparison' AND school_id IS NULL AND game_slug IS NULL AND
   comparison_selection IS NOT NULL AND length(comparison_selection) BETWEEN 12 AND 120)
 );