-- STAGE38 ONLY: isolated staging ycwuugggqbunlbwuzvbx.
-- NEVER RUN against production snvzwrexuqavnfvzgxqj.
-- All synthetic samples and changes are rolled back.
BEGIN;
DO $tests$
DECLARE
  response jsonb;
  measurement jsonb;
BEGIN
  IF pg_catalog.has_function_privilege('anon','public.beagu_admin_page_perf_v1(text)','EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated','public.beagu_admin_page_perf_v1(text)','EXECUTE')
      OR NOT pg_catalog.has_function_privilege('service_role','public.beagu_admin_page_perf_v1(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Page perf RPC role grant boundary breached';
  END IF;
  IF (SELECT count(*) FROM beagu_private.beagu_page_perf_samples_v1) <> 0 THEN
    RAISE EXCEPTION 'Nonempty staging performance samples. Refuse unqualified synthetic regression';
  END IF;
  INSERT INTO beagu_private.beagu_page_perf_samples_v1
    (page,operation,duration_ms,succeeded)
  VALUES ('index','navigation',120,true),
         ('index','navigation',150,false),
         ('index','navigation',300,true);
  response := public.beagu_admin_page_perf_v1('7d');
  SELECT v INTO measurement
  FROM pg_catalog.jsonb_array_elements(response->'rows') AS v
  WHERE v->>'page' = 'index' AND v->>'operation' = 'navigation';
  IF measurement IS NULL THEN RAISE EXCEPTION 'Synthetic measurement missing'; END IF;
  IF (measurement->>'samples')::int <> 3 OR (measurement->>'failures')::int <> 1
     OR (measurement->>'failure_rate')::numeric <> 33.3
     OR (measurement->>'p50_ms')::int <> 120
     OR (measurement->>'p90_ms')::int <> 300
     OR (measurement->>'p99_ms')::int <> 300 THEN
    RAISE EXCEPTION 'Wrong performance aggregation: %', measurement;
  END IF;
  BEGIN
    PERFORM public.beagu_admin_page_perf_v1('invalid-period');
    RAISE EXCEPTION 'Invalid dashboard period unexpectedly accepted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
END
$tests$;
SET LOCAL ROLE anon;
DO $deny$
BEGIN
  BEGIN
    PERFORM public.beagu_admin_page_perf_v1('7d');
    RAISE EXCEPTION 'Anon unexpectedly called private aggregation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$deny$;
RESET ROLE;
ROLLBACK;
-- Transaction must roll back: staging performance data remains empty.
