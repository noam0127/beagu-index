-- Beagu 8th priority: challenge progress and school-interest events.
-- Run in Supabase SQL Editor as project admin; NEVER expose service_role in browsers.
-- Compatible with the existing beagu_join_challenge() and visitor RPC.
-- Install only AFTER checking that beagu_private.participants stores
-- the existing "N번째" sequence in participant_no for campaign='2026'.
-- Does not change old tables, visits, permissions, or publication gates.

CREATE OR REPLACE FUNCTION public.beagu_get_challenge_progress()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(max(p.participant_no),0)::bigint
  FROM beagu_private.participants AS p
  WHERE p.campaign='2026';
$$;
REVOKE ALL ON FUNCTION public.beagu_get_challenge_progress() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_get_challenge_progress() TO anon,authenticated;

CREATE TABLE IF NOT EXISTS public.school_search_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL,
  school_id text NOT NULL REFERENCES public.schools(school_id),
  event_type text NOT NULL CHECK(event_type IN ('search_confirmed','school_selected','detail_viewed')),
  viewer_level smallint NOT NULL CHECK(viewer_level BETWEEN 0 AND 2),
  source_page text NOT NULL CHECK(source_page IN ('search','search-lv1','search-lv2','school-report')),
  searched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_search_events_once_per_action UNIQUE(action_id,event_type)
);
-- Support a prior un-deployed 2026-10-28 schema that allowed 'result' but
-- not today's canonical 'school-report' detail page.
ALTER TABLE public.school_search_events
  DROP CONSTRAINT IF EXISTS school_search_events_source_page_check;
ALTER TABLE public.school_search_events
  ADD CONSTRAINT school_search_events_source_page_check
  CHECK(source_page IN ('search','search-lv1','search-lv2','school-report','result'));
ALTER TABLE public.school_search_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_search_events FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS school_search_events_school_time_idx
  ON public.school_search_events(school_id,searched_at DESC);
CREATE INDEX IF NOT EXISTS school_search_events_type_time_idx
  ON public.school_search_events(event_type,searched_at DESC);

CREATE TABLE IF NOT EXISTS beagu_private.school_search_limits(
  bucket timestamptz NOT NULL,
  visitor_hash text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY(bucket,visitor_hash)
);
ALTER TABLE beagu_private.school_search_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.school_search_limits FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS beagu_private.school_search_settings(
  name text PRIMARY KEY,
  salt uuid NOT NULL DEFAULT gen_random_uuid()
);
ALTER TABLE beagu_private.school_search_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.school_search_settings FROM PUBLIC,anon,authenticated;
INSERT INTO beagu_private.school_search_settings(name) VALUES('salt')
  ON CONFLICT(name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.beagu_log_school_search(
  p_school_id text, p_event_type text, p_viewer_level smallint,
  p_source_page text, p_action_id uuid, p_visitor uuid
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_bucket timestamptz := pg_catalog.date_trunc('hour',pg_catalog.clock_timestamp());
  v_salt uuid;
  v_hash text;
  v_used integer;
BEGIN
  IF p_visitor IS NULL OR p_action_id IS NULL OR p_school_id IS NULL
     OR p_school_id !~ '^[0-9]{7}$'
     OR p_event_type IS NULL OR p_event_type NOT IN ('search_confirmed','school_selected','detail_viewed')
     OR p_source_page IS NULL OR p_source_page NOT IN ('search','search-lv1','search-lv2','school-report')
     OR p_viewer_level IS NULL
     OR p_viewer_level <> CASE p_source_page WHEN 'search-lv1' THEN 1 WHEN 'search-lv2' THEN 2 ELSE 0 END
  THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.schools WHERE school_id=p_school_id AND status='운영')
  THEN RETURN false; END IF;
  -- A single action belongs to one school and one page.
  IF EXISTS(SELECT 1 FROM public.school_search_events
    WHERE action_id=p_action_id AND (school_id<>p_school_id OR source_page<>p_source_page))
  THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.school_search_events
    WHERE action_id=p_action_id AND event_type=p_event_type)
  THEN RETURN true; END IF;

  SELECT salt INTO v_salt FROM beagu_private.school_search_settings WHERE name='salt';
  IF v_salt IS NULL THEN RETURN false; END IF;
  v_hash := pg_catalog.md5(p_visitor::text || v_salt::text || v_bucket::text);
  INSERT INTO beagu_private.school_search_limits(bucket,visitor_hash,used)
    VALUES(v_bucket,v_hash,1)
    ON CONFLICT(bucket,visitor_hash) DO UPDATE
    SET used=beagu_private.school_search_limits.used+1
    RETURNING used INTO v_used;
  IF v_used>90 THEN RETURN false; END IF;
  INSERT INTO public.school_search_events(action_id,school_id,event_type,viewer_level,source_page)
    VALUES(p_action_id,p_school_id,p_event_type,p_viewer_level,p_source_page)
    ON CONFLICT(action_id,event_type) DO NOTHING;
  IF v_used%20=0 THEN
    DELETE FROM beagu_private.school_search_limits WHERE bucket<v_bucket-interval '48 hours';
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.beagu_log_school_search(text,text,smallint,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_log_school_search(text,text,smallint,text,uuid,uuid) TO anon,authenticated;
-- No SELECT policy on public.school_search_events. Viewer levels are client-reported,
-- not authenticated privileges. Do not publish popularity rankings from raw event counts.
