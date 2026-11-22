-- STAGE38 ISOLATED STAGING ONLY: ycwuugggqbunlbwuzvbx
-- NEVER APPLY TO PRODUCTION snvzwrexuqavnfvzgxqj.
-- This is an aggregate-READ scaffold from production catalog METADATA only
-- (information_schema.columns, pg_constraint, pg_indexes, pg_trigger).
-- No production rows, secrets, IP hashes, visitor identities or scores are copied.
-- Do not deploy gameplay write endpoints or production ingestion against these tables.
-- In particular arcade_limit_game_record_insert is NOT included: its separate
-- game-scoring/anti-abuse dependencies have not been approved or tested here.
-- Protect every new table by RLS + revoked public access. Service SELECT only.
BEGIN;

CREATE TABLE IF NOT EXISTS beagu_private.participants (
  campaign text NOT NULL,
  visitor_id uuid NOT NULL,
  participant_no bigint NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT participants_pkey PRIMARY KEY (campaign,visitor_id),
  CONSTRAINT participants_campaign_participant_no_key UNIQUE (campaign,participant_no)
);
ALTER TABLE beagu_private.participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.participants FROM PUBLIC,anon,authenticated;
GRANT SELECT ON beagu_private.participants TO service_role;

CREATE TABLE IF NOT EXISTS beagu_private.school_view_admin_exclusions (
  visitor_digest text NOT NULL CHECK (visitor_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_view_admin_exclusions_pkey PRIMARY KEY (visitor_digest)
);
ALTER TABLE beagu_private.school_view_admin_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.school_view_admin_exclusions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON beagu_private.school_view_admin_exclusions TO service_role;

CREATE TABLE IF NOT EXISTS beagu_private.school_view_daily (
  school_id text NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
  visitor_digest text NOT NULL CHECK (visitor_digest ~ '^[a-f0-9]{64}$'),
  view_day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_view_daily_pkey PRIMARY KEY (school_id,visitor_digest,view_day)
);
ALTER TABLE beagu_private.school_view_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.school_view_daily FROM PUBLIC,anon,authenticated;
GRANT SELECT ON beagu_private.school_view_daily TO service_role;
DROP TRIGGER IF EXISTS beagu_skip_admin_school_view_daily ON beagu_private.school_view_daily;
CREATE TRIGGER beagu_skip_admin_school_view_daily BEFORE INSERT ON beagu_private.school_view_daily
  FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_skip_admin_telemetry();

CREATE TABLE IF NOT EXISTS public.school_search_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL,
  school_id text NOT NULL REFERENCES public.schools(school_id),
  event_type text NOT NULL CHECK (event_type IN ('search_confirmed','school_selected','detail_viewed')),
  viewer_level smallint NOT NULL CHECK (viewer_level BETWEEN 0 AND 2),
  source_page text NOT NULL CHECK (source_page IN ('search','search-lv1','search-lv2','school-report','result')),
  searched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_search_events_once_per_action UNIQUE(action_id,event_type)
);
CREATE INDEX IF NOT EXISTS school_search_events_school_time_idx
  ON public.school_search_events(school_id,searched_at DESC);
CREATE INDEX IF NOT EXISTS school_search_events_type_time_idx
  ON public.school_search_events(event_type,searched_at DESC);
ALTER TABLE public.school_search_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_search_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_search_events TO service_role;
DROP TRIGGER IF EXISTS beagu_skip_admin_school_event ON public.school_search_events;
CREATE TRIGGER beagu_skip_admin_school_event BEFORE INSERT ON public.school_search_events
  FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_skip_admin_telemetry();

CREATE TABLE IF NOT EXISTS public.arcade_game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game text NOT NULL CHECK (game IN ('volleyball','teacher_run','volleyball_25','teacher_run_retirement')),
  ip_hash text NOT NULL CHECK (char_length(ip_hash)=64),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  school_id text,
  school_name text,
  difficulty text CHECK (difficulty IN ('easy','normal','hard','very_hard','extreme')),
  percentile_source_year smallint
);
CREATE INDEX IF NOT EXISTS arcade_game_sessions_ip_started
  ON public.arcade_game_sessions(ip_hash,started_at DESC);
ALTER TABLE public.arcade_game_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arcade_game_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.arcade_game_sessions TO service_role;

CREATE TABLE IF NOT EXISTS public.arcade_game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.arcade_game_sessions(id),
  game text NOT NULL CHECK (game IN ('volleyball','teacher_run','volleyball_25','teacher_run_retirement')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 200000),
  created_at timestamptz NOT NULL DEFAULT now(),
  school_id text,
  school_name text,
  difficulty text CHECK (difficulty IN ('easy','normal','hard','very_hard','extreme')),
  win_time_tenths integer CHECK (
    win_time_tenths IS NULL OR
    (game='volleyball_25' AND win_time_tenths BETWEEN 1 AND 36000)
  ),
  public_result jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(public_result)='object' AND pg_column_size(public_result)<=4096)
);
CREATE INDEX IF NOT EXISTS arcade_game_scores_fastest25
  ON public.arcade_game_scores(game,win_time_tenths,created_at)
  WHERE win_time_tenths IS NOT NULL;
CREATE INDEX IF NOT EXISTS arcade_game_scores_history_by_game
  ON public.arcade_game_scores(game,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS arcade_game_scores_history_by_tier
  ON public.arcade_game_scores(game,difficulty,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS arcade_game_scores_rank
  ON public.arcade_game_scores(game,score DESC,created_at);
CREATE INDEX IF NOT EXISTS arcade_score_school_id_idx
  ON public.arcade_game_scores(school_id);
ALTER TABLE public.arcade_game_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arcade_game_scores FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.arcade_game_scores TO service_role;

COMMIT;
