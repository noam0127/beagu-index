-- ISOLATED STAGING ONLY; NEVER RUN IN PRODUCTION.
-- Reconstruct production arcade_fastest25_records SCHEMA, with ZERO copied rows.
-- Add the production-equivalent score pruning trigger absent from staging.
CREATE TABLE IF NOT EXISTS public.arcade_fastest25_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.arcade_game_sessions(id) ON DELETE CASCADE,
  school_name text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('easy','normal','hard','very_hard','extreme')),
  win_time_tenths integer NOT NULL CHECK (win_time_tenths BETWEEN 1 AND 36000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arcade_fastest25_records_pkey PRIMARY KEY (id),
  CONSTRAINT arcade_fastest25_records_session_id_key UNIQUE (session_id)
);
CREATE INDEX IF NOT EXISTS arcade_fastest25_time_rank
  ON public.arcade_fastest25_records (win_time_tenths,created_at,id);
ALTER TABLE public.arcade_fastest25_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arcade_fastest25_records FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.arcade_fastest25_records TO service_role;
-- Only the server may read/maintain game rankings. Preserve anon isolation.
CREATE OR REPLACE FUNCTION public.arcade_enforce_game_record_limits()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('arcade-game-rank:'||NEW.game, 0));
 IF NEW.game='volleyball_25' AND NEW.win_time_tenths IS NOT NULL THEN
   INSERT INTO public.arcade_fastest25_records
     (session_id,school_name,difficulty,win_time_tenths,created_at)
   VALUES (NEW.session_id,NEW.school_name,NEW.difficulty,NEW.win_time_tenths,NEW.created_at)
   ON CONFLICT (session_id) DO NOTHING;
   DELETE FROM public.arcade_fastest25_records
    WHERE id IN (
      SELECT id FROM public.arcade_fastest25_records
      ORDER BY win_time_tenths ASC,created_at ASC,id ASC OFFSET 10
    );
 END IF;
 DELETE FROM public.arcade_game_scores
 WHERE id IN (
   SELECT id FROM public.arcade_game_scores
   WHERE game=NEW.game
   ORDER BY score DESC,created_at ASC,id ASC OFFSET 100
 );
 RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.arcade_enforce_game_record_limits() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS arcade_limit_game_record_insert ON public.arcade_game_scores;
CREATE TRIGGER arcade_limit_game_record_insert
AFTER INSERT ON public.arcade_game_scores FOR EACH ROW
EXECUTE FUNCTION public.arcade_enforce_game_record_limits();
NOTIFY pgrst, 'reload schema';
