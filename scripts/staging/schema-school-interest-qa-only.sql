-- QA STAGING ONLY: ycwuugggqbunlbwuzvbx
-- Reconstructed from production *schema and function definition only*.
-- Never copy activity logs, visitor digests or production school data.
CREATE TABLE IF NOT EXISTS public.beagu_school_interest_daily (
  school_id text NOT NULL REFERENCES public.schools(school_id) ON DELETE CASCADE,
  visitor_digest text NOT NULL CHECK (visitor_digest ~ '^[a-f0-9]{64}$'),
  visit_date date NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beagu_school_interest_daily_pkey
    PRIMARY KEY (school_id, visitor_digest, visit_date)
);
ALTER TABLE public.beagu_school_interest_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beagu_school_interest_daily
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.beagu_school_interest_daily TO service_role;

-- Restrict execute to server role only: browser must pass through the
-- Edge Function's Lv.1 session check before obtaining ranked results.
CREATE OR REPLACE FUNCTION public.beagu_school_interest_rankings()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $fn$
WITH activity AS (
  SELECT school_id, visitor_digest, seen_at
  FROM public.beagu_school_interest_daily
  WHERE seen_at >= now() - interval '144 hours'
),
counts AS (
  SELECT school_id,
    COUNT(DISTINCT visitor_digest) FILTER (
      WHERE seen_at >= now() - interval '72 hours'
    ) AS current_visitors,
    COUNT(DISTINCT visitor_digest) FILTER (
      WHERE seen_at >= now() - interval '144 hours'
        AND seen_at < now() - interval '72 hours'
    ) AS previous_visitors
  FROM activity GROUP BY school_id
),
rising AS (
  SELECT s.school_id, s.school_name,
    COALESCE(s.sido_standard, s.sido) AS region,
    c.current_visitors, c.previous_visitors,
    (c.current_visitors - c.previous_visitors) AS growth
  FROM counts c
  JOIN public.schools s ON s.school_id = c.school_id
  WHERE s.status = '운영'
    AND c.current_visitors >= 5
    AND c.current_visitors - c.previous_visitors >= 3
  ORDER BY growth DESC, current_visitors DESC, s.school_name ASC, s.school_id ASC
  LIMIT 10
)
SELECT pg_catalog.jsonb_build_object(
  'rising', COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'school_id', r.school_id,
        'school_name', r.school_name,
        'region', r.region,
        'visitors', r.current_visitors,
        'growth', r.growth
      ) ORDER BY r.growth DESC, r.current_visitors DESC, r.school_name, r.school_id
    ) FROM rising r
  ), '[]'::jsonb),
  'window_hours', 72
);
$fn$;
REVOKE ALL ON FUNCTION public.beagu_school_interest_rankings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_school_interest_rankings() TO service_role;
