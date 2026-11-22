-- v1.1.0 stage35: isolated mock publication gateway ONLY.
-- STOP on non-staging DBs. NEVER run under supabase/migrations or production.
DO $$ BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL THEN
  RAISE EXCEPTION 'STAGING ONLY: synthetic fixture marker missing';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.beagu_metric_catalog(
 survey_year smallint NOT NULL,
 question_id text NOT NULL,
 access_level smallint NOT NULL,
 verified boolean NOT NULL DEFAULT false,
 label text NOT NULL,
 meaning text NOT NULL,
 interpretation text NOT NULL,
 direction text NOT NULL,
 unit text NOT NULL,
 spatial_scope text NOT NULL,
 value_type text NOT NULL,
 minimum numeric NOT NULL,
 maximum numeric NOT NULL,
 PRIMARY KEY(survey_year,question_id)
);
CREATE TABLE IF NOT EXISTS public.beagu_release_metrics_v2(
 school_id text NOT NULL CHECK(school_id ~ '^TST[0-9]{4}$'),
 survey_year smallint NOT NULL CHECK(survey_year=2026),
 question_id text NOT NULL,
 access_level smallint NOT NULL,
 value text NOT NULL,
 release_version text NOT NULL,
 approval_status text NOT NULL,
 privacy_status text NOT NULL,
 identity_reviewed boolean NOT NULL,
 question_reviewed boolean NOT NULL,
 small_cell_reviewed boolean NOT NULL,
 differencing_reviewed boolean NOT NULL,
 approved_at timestamptz,
 approved_by text,
 approval_evidence text,
 PRIMARY KEY(school_id,question_id)
);
CREATE TABLE IF NOT EXISTS public.beagu_2026_results_snapshot(
 school_id text PRIMARY KEY CHECK(school_id ~ '^TST[0-9]{4}$'),
 approved_at timestamptz,
 approval_status text NOT NULL,
 privacy_reviewed boolean NOT NULL DEFAULT false,
 questions jsonb NOT NULL DEFAULT '[]'::jsonb
);
ALTER TABLE public.beagu_metric_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_release_metrics_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_2026_results_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beagu_metric_catalog,public.beagu_release_metrics_v2,
 public.beagu_2026_results_snapshot FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.beagu_metric_catalog,
 public.beagu_release_metrics_v2,public.beagu_2026_results_snapshot TO service_role;

-- This is NOT the production function. It is a staging-only security fixture:
-- return nonempty reviewed sample data even before 6h, to detect accidental
-- early calls made by the real Edge Function.
CREATE OR REPLACE FUNCTION public.beagu_2026_lv2_released_question_results(p_school_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $fn$
 SELECT r.questions
 FROM public.beagu_2026_results_snapshot r
 WHERE r.school_id=p_school_id AND r.approval_status='APPROVED'
   AND r.privacy_reviewed=true
$fn$;
REVOKE ALL ON FUNCTION public.beagu_2026_lv2_released_question_results(text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_lv2_released_question_results(text)
 TO service_role;
