-- Stage38 isolated staging ONLY: ycwuugggqbunlbwuzvbx.
-- Never run against production Supabase snvzwrexuqavnfvzgxqj.
-- All source hashes and UUIDs here are fictional test values, NOT real IP hashes.
-- A single ROLLBACK removes every sample, visit, rate counter and decision.
BEGIN;

DO $preflight$
DECLARE baseline jsonb;
BEGIN
  IF (SELECT count(*) FROM beagu_private.visits) <> 0
    OR (SELECT count(*) FROM beagu_private.beagu_telemetry_source_windows_v2) <> 0
    OR (SELECT count(*) FROM beagu_private.beagu_telemetry_source_visitors_v2) <> 0
    OR (SELECT count(*) FROM beagu_private.beagu_telemetry_guard_decisions_v2) <> 0
  THEN RAISE EXCEPTION 'Staging telemetry baseline is not empty; refuse synthetic fixture test'; END IF;
  IF has_table_privilege('anon','beagu_private.beagu_telemetry_guard_decisions_v2','SELECT')
    OR has_table_privilege('authenticated','beagu_private.beagu_telemetry_guard_decisions_v2','SELECT')
    OR has_function_privilege('anon','public.beagu_admin_telemetry_health_v2()','EXECUTE')
    OR has_function_privilege('authenticated','public.beagu_admin_telemetry_health_v2()','EXECUTE')
    OR has_function_privilege('anon','public.beagu_telemetry_guard_v2(text,uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.beagu_admin_telemetry_health_v2()','EXECUTE')
  THEN RAISE EXCEPTION 'Service-only telemetry privileges broken'; END IF;
  baseline := public.beagu_admin_telemetry_health_v2();
  IF (baseline->>'guard_attempts')::int<>0
    OR (baseline->>'saved_visits_24h')::int<>0
    OR baseline->>'decisions_since' IS NOT NULL
    OR (baseline->>'http_error_rate_measured')::boolean IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'Empty baseline falsely presented as observed telemetry: %',baseline; END IF;
END $preflight$;

-- Pre-seed a minute budget at 240. The next legitimate call must be limited.
INSERT INTO beagu_private.beagu_telemetry_source_windows_v2
  (source_hash,action,window_kind,window_start,hits)
VALUES (repeat('b',64),'visit','minute',date_trunc('minute',now()),240);

-- Simulate 100 distinct synthetic visitors behind one source.
-- UUIDs are version-4-shaped fictional values, not actual visitor identifiers.
INSERT INTO beagu_private.beagu_telemetry_source_visitors_v2
  (source_hash,visitor_id,first_seen_at,last_seen_at)
SELECT repeat('c',64),
  ('00000000-0000-4000-8000-'||lpad(to_hex(i),12,'0'))::uuid,
  now(),now()
FROM generate_series(1,100) AS i;

SET LOCAL ROLE service_role;
DO $guard_paths$
BEGIN
  IF public.beagu_telemetry_guard_v2(repeat('a',64),
       '00000000-0000-4000-8000-000000000038'::uuid,'visit') IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'Valid synthetic telemetry was denied'; END IF;
  IF public.beagu_telemetry_guard_v2(repeat('b',64),
       '00000000-0000-4000-8000-000000000039'::uuid,'visit') IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'Minute rate limit was bypassed'; END IF;
  IF public.beagu_telemetry_guard_v2(repeat('c',64),
       '00000000-0000-4000-8000-000000000101'::uuid,'visit') IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'Synthetic ID-rotation limit was bypassed'; END IF;
  BEGIN
    PERFORM public.beagu_telemetry_guard_v2(repeat('d',64),
      '00000000-0000-4000-8000-000000000038'::uuid,'delete');
    RAISE EXCEPTION 'Invalid telemetry action accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $guard_paths$;
RESET ROLE;

-- Guard logging is not a visit record: add separate synthetic, rolled-back rows
-- so the health function can distinguish attempts from saved traffic.
INSERT INTO beagu_private.visits (event_id,visitor_id,page) VALUES
  ('00000000-0000-4000-8000-000000000181',
   '00000000-0000-4000-8000-000000000038','index'),
  ('00000000-0000-4000-8000-000000000182',
   '00000000-0000-4000-8000-000000000039','challenge');

DO $aggregate$
DECLARE result jsonb;
BEGIN
  result := public.beagu_admin_telemetry_health_v2();
  IF (result->>'guard_attempts')::int<>3
     OR (result->>'guard_allowed')::int<>1
     OR (result->>'guard_source_limited')::int<>1
     OR (result->>'guard_id_rotation_limited')::int<>1
     OR (result->>'saved_visits_24h')::int<>2
     OR result->>'decisions_since' IS NULL
     OR result->>'latest_saved_visit' IS NULL
  THEN RAISE EXCEPTION 'Telemetry aggregate is wrong: %',result; END IF;
  IF result ? 'source_hash' OR result ? 'visitor_id' OR result ? 'event_id'
     OR (result::text LIKE '%00000000-0000-4000%')
  THEN RAISE EXCEPTION 'Telemetry aggregate exposed synthetic identifiers'; END IF;
  IF (result->>'http_error_rate_measured')::boolean IS DISTINCT FROM false
     OR (result->>'human_false_positive_rate_measured')::boolean IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'Unmeasured health metric reported as measured'; END IF;
  IF (SELECT count(*) FROM beagu_private.beagu_telemetry_guard_decisions_v2) <> 3
  THEN RAISE EXCEPTION 'Decision categories not logged separately'; END IF;
END $aggregate$;

SET LOCAL ROLE anon;
DO $deny$
BEGIN
  BEGIN
    PERFORM public.beagu_admin_telemetry_health_v2();
    RAISE EXCEPTION 'Anonymous caller invoked private health aggregate';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.beagu_telemetry_guard_v2(repeat('f',64),
      '00000000-0000-4000-8000-000000000038'::uuid,'visit');
    RAISE EXCEPTION 'Anonymous caller invoked private source guard';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $deny$;
RESET ROLE;
ROLLBACK;
-- PASS when no exception. The environment must still contain zero test rows.
