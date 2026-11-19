-- Optional game-related Post-its while retaining validated school links.
ALTER TABLE public.beagu_postit_posts
 ADD COLUMN IF NOT EXISTS subject_type text NOT NULL DEFAULT 'school',
 ADD COLUMN IF NOT EXISTS game_slug text;
ALTER TABLE public.beagu_postit_posts ALTER COLUMN school_id DROP NOT NULL;
ALTER TABLE public.beagu_postit_posts DROP CONSTRAINT IF EXISTS beagu_postit_subject_valid;
ALTER TABLE public.beagu_postit_posts
 ADD CONSTRAINT beagu_postit_subject_valid CHECK (
   (subject_type='school' AND school_id IS NOT NULL AND game_slug IS NULL)
   OR
   (subject_type='game' AND game_slug IN ('teacher-volleyball','teacher-run','teacher-class-diary-play'))
 );
CREATE INDEX IF NOT EXISTS beagu_postit_posts_game_idx
 ON public.beagu_postit_posts(game_slug, status, created_at DESC);
UPDATE public.beagu_postit_settings SET minimum_write_level=2,updated_at=now() WHERE id=1;