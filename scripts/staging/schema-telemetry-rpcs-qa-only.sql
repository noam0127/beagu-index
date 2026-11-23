-- ISOLATED STAGING ONLY: ycwuugggqbunlbwuzvbx
-- Reconstructed from production PostgreSQL function definitions, never data.
-- Existing beagu_private tables remain fully private and RLS-enabled.
CREATE OR REPLACE FUNCTION public.beagu_telemetry_totals_v2()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'today', count(distinct visitor_id) FILTER (
      WHERE visit_day=(now() AT TIME ZONE 'Asia/Seoul')::date),
    'month', count(distinct visitor_id) FILTER (
      WHERE visit_day>=pg_catalog.date_trunc('month',now() AT TIME ZONE 'Asia/Seoul')::date),
    'total', count(distinct visitor_id),
    'as_of',(now() AT TIME ZONE 'Asia/Seoul')::date,
    'rate_limited',true
  )
  FROM beagu_private.visits;
$fn$;

CREATE OR REPLACE FUNCTION public.beagu_record_visit(
  p_visitor uuid, p_event uuid, p_page text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  d date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  result jsonb;
  normalized_page text;
  v_throttled boolean := false;
BEGIN
  normalized_page := CASE
    WHEN p_page IN ('index','search','result','survey','challenge') THEN p_page
    WHEN p_page IN ('search-lv1','search-lv2','school-report','statistics') THEN 'search'
    ELSE NULL END;
  IF p_visitor IS NULL OR p_event IS NULL OR normalized_page IS NULL
    OR p_visitor::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR p_event::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN RAISE EXCEPTION 'Invalid visit' USING errcode='22023'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_visitor::text,873122::bigint)
  );

  IF NOT EXISTS (SELECT 1 FROM beagu_private.visits WHERE event_id=p_event) THEN
    IF (SELECT count(*) FROM beagu_private.visits WHERE visitor_id=p_visitor
      AND visited_at>=now()-interval '1 minute')>=30
       OR (SELECT count(*) FROM beagu_private.visits WHERE visitor_id=p_visitor
      AND visited_at>=now()-interval '1 hour')>=120
    THEN v_throttled:=true;
    ELSE
      INSERT INTO beagu_private.visits(event_id,visitor_id,page)
        VALUES(p_event,p_visitor,normalized_page)
        ON CONFLICT(event_id) DO NOTHING;
      -- The original BEFORE INSERT admin-exclusion trigger remains active.
    END IF;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'today',count(distinct visitor_id) FILTER (WHERE visit_day=d),
    'month',count(distinct visitor_id) FILTER (
      WHERE visit_day>=pg_catalog.date_trunc('month',d::timestamp)::date),
    'total',count(distinct visitor_id),'as_of',d,
    'rate_limited',v_throttled
  ) INTO result FROM beagu_private.visits;
  RETURN result;
END;
$fn$;

-- SECURITY DEFINER has extra privileges: never leave PUBLIC EXECUTE.
REVOKE ALL ON FUNCTION public.beagu_telemetry_totals_v2() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_record_visit(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_telemetry_totals_v2() TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_record_visit(uuid,uuid,text) TO service_role;
NOTIFY pgrst, 'reload schema';
