-- Stage38: read-only/rolled-back isolated staging security regression.
-- ONLY run against project ycwuugggqbunlbwuzvbx.
-- NEVER run against production ref snvzwrexuqavnfvzgxqj.
-- An INFO "RLS enabled no policy" finding is deliberate *only* if public roles
-- also lack direct table privileges. Re-evaluate if public API architecture changes.
BEGIN;

DO $checks$
DECLARE exposed_tables integer;
BEGIN
  WITH policyless_rls AS (
    SELECT c.oid
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND n.nspname IN ('public', 'beagu_private', 'stage_private')
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = c.oid
      )
  )
  SELECT count(*) INTO exposed_tables
  FROM policyless_rls
  WHERE pg_catalog.has_table_privilege('anon', oid, 'SELECT')
     OR pg_catalog.has_table_privilege('anon', oid, 'INSERT')
     OR pg_catalog.has_table_privilege('anon', oid, 'UPDATE')
     OR pg_catalog.has_table_privilege('anon', oid, 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', oid, 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', oid, 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', oid, 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', oid, 'DELETE');
  IF exposed_tables > 0 THEN
    RAISE EXCEPTION 'Stage38 policyless RLS tables have public grants: %', exposed_tables;
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon', 'beagu_private.beagu_consume_perf_global_budget_v1()', 'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated', 'beagu_private.beagu_consume_perf_global_budget_v1()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Stage38 private global telemetry budget unexpectedly executable';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'anon', 'public.beagu_perf_record_v1(uuid,text,text,integer,boolean)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Stage38 documented public telemetry entrypoint lost EXECUTE';
  END IF;
END
$checks$;

SET LOCAL ROLE anon;

DO $negative$
DECLARE visitor uuid := '00000000-0000-4000-8000-000000000038';
BEGIN
  IF public.beagu_perf_record_v1(visitor, 'private-admin', 'navigation', 100, true) THEN
    RAISE EXCEPTION 'Stage38 anonymous invalid page was accepted';
  END IF;
  IF public.beagu_perf_record_v1(visitor, 'index', 'navigation', 0, true) THEN
    RAISE EXCEPTION 'Stage38 anonymous invalid duration was accepted';
  END IF;
  IF public.beagu_perf_record_v1(visitor, 'index', 'school_search', 100, true) THEN
    RAISE EXCEPTION 'Stage38 anonymous incompatible page/operation was accepted';
  END IF;
END
$negative$;

RESET ROLE;
ROLLBACK;
-- PASS if no exception. This script does not test a valid telemetry write.
