-- STAGING-ONLY PROTOTYPE. This SQL deliberately refuses to execute on
-- production because `stage_private.fake_schools` exists ONLY in staging.
-- Prepare a reviewed production migration separately after full CI/approval.
DO $$ BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL THEN
  RAISE EXCEPTION 'STOP: staging-only performance throttle prototype';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS beagu_private.beagu_perf_global_budget_v1(
 bucket timestamptz PRIMARY KEY,
 used integer NOT NULL CHECK(used BETWEEN 0 AND 10000)
);
ALTER TABLE beagu_private.beagu_perf_global_budget_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_perf_global_budget_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON beagu_private.beagu_perf_global_budget_v1 TO service_role;

-- Atomic shared quota across all user-provided UUIDs. This deliberately
-- limits low-priority telemetry, not participation/submission actions.
CREATE OR REPLACE FUNCTION beagu_private.beagu_consume_perf_global_budget_v1()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE v_used integer;
BEGIN
 INSERT INTO beagu_private.beagu_perf_global_budget_v1(bucket,used)
 VALUES(pg_catalog.date_trunc('hour',pg_catalog.now()),1)
 ON CONFLICT(bucket) DO UPDATE
   SET used=beagu_private.beagu_perf_global_budget_v1.used+1
   WHERE beagu_private.beagu_perf_global_budget_v1.used<10000
 RETURNING used INTO v_used;
 RETURN v_used IS NOT NULL;
END
$function$;
REVOKE ALL ON FUNCTION beagu_private.beagu_consume_perf_global_budget_v1()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beagu_private.beagu_consume_perf_global_budget_v1()
 TO service_role;

-- Existing production function body with an added global guard.
-- The quota MUST be checked before writing a visitor-specific rate row;
-- otherwise arbitrarily many fake UUIDs could still create rows.
CREATE OR REPLACE FUNCTION public.beagu_perf_record_v1(
 p_visitor uuid,p_page text,p_operation text,p_duration_ms integer,p_ok boolean
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_accepted boolean:=false;
BEGIN
 IF p_visitor IS NULL OR substring(p_visitor::text from 15 for 1)<>'4'
    OR p_page NOT IN ('index','search','search-lv1','statistics',
       'school-report','result','challenge','volleyball','teacher-run')
    OR p_operation NOT IN ('navigation','school_search','school_selection','compare_directory')
    OR p_duration_ms IS NULL OR p_duration_ms<1 OR p_duration_ms>120000
    OR p_ok IS NULL THEN RETURN false; END IF;
 IF (p_operation='school_selection' AND p_page NOT IN ('volleyball','teacher-run'))
    OR (p_operation='compare_directory' AND p_page<>'statistics')
    OR (p_operation='school_search' AND p_page NOT IN
       ('search','search-lv1','volleyball','teacher-run')) THEN RETURN false; END IF;
 IF exists(SELECT 1 FROM public.beagu_admin_accounts a
           WHERE a.user_id=auth.uid() AND a.enabled=true) THEN RETURN false; END IF;

 -- Former protection only limited a *caller-chosen visitor ID*. A hostile
 -- caller could rotate UUIDv4 values. This limit is atomic across all IDs.
 IF NOT beagu_private.beagu_consume_perf_global_budget_v1() THEN RETURN false; END IF;
 INSERT INTO beagu_private.beagu_page_perf_rate_v1(visitor_id,page,operation,last_sample_at)
 VALUES(p_visitor,p_page,p_operation,now())
 ON CONFLICT(visitor_id,page,operation) DO UPDATE
  SET last_sample_at=excluded.last_sample_at
  WHERE beagu_private.beagu_page_perf_rate_v1.last_sample_at
    < now()-interval '20 seconds'
 RETURNING true INTO v_accepted;
 IF v_accepted IS NOT true THEN RETURN false; END IF;
 INSERT INTO beagu_private.beagu_page_perf_samples_v1(page,operation,duration_ms,succeeded)
 VALUES(p_page,p_operation,p_duration_ms,p_ok);
 RETURN true;
END
$function$;
REVOKE ALL ON FUNCTION public.beagu_perf_record_v1(uuid,text,text,integer,boolean)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.beagu_perf_record_v1(uuid,text,text,integer,boolean)
 TO anon,authenticated,service_role;
