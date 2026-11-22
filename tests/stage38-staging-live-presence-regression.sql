-- Stage38 isolated staging ONLY: ycwuugggqbunlbwuzvbx
-- NEVER run against production snvzwrexuqavnfvzgxqj.
-- Synthetic visitor UUIDs only; full transaction ROLLBACK.
BEGIN;
DO $preflight$
BEGIN
  IF (SELECT count(*) FROM beagu_private.beagu_live_presence_v1) <> 0 THEN
    RAISE EXCEPTION 'Staging presence has pre-existing rows; do not run synthetic empty-table regression';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
          WHERE c.oid='beagu_private.beagu_live_presence_v1'::regclass) THEN
    RAISE EXCEPTION 'Presence table RLS disabled';
  END IF;
  IF has_table_privilege('anon','beagu_private.beagu_live_presence_v1','SELECT') OR
     has_table_privilege('authenticated','beagu_private.beagu_live_presence_v1','SELECT') OR
     has_table_privilege('anon','beagu_private.beagu_live_presence_v1','INSERT') OR
     has_table_privilege('authenticated','beagu_private.beagu_live_presence_v1','INSERT') THEN
    RAISE EXCEPTION 'Private presence table exposes public access';
  END IF;
  IF has_function_privilege('anon','public.beagu_presence_ping_v1(uuid,text)','EXECUTE') OR
     has_function_privilege('authenticated','public.beagu_presence_ping_v1(uuid,text)','EXECUTE') OR
     NOT has_function_privilege('service_role','public.beagu_presence_ping_v1(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Ping RPC execution privileges insecure';
  END IF;
END $preflight$;
SET LOCAL ROLE service_role;
SELECT public.beagu_presence_ping_v1('00000000-0000-4000-8000-000000000038'::uuid,'index');
SELECT public.beagu_presence_ping_v1('00000000-0000-4000-8000-000000000038'::uuid,'challenge');
SELECT public.beagu_presence_ping_v1('00000000-0000-4000-8000-000000000039'::uuid,'not-a-page');
RESET ROLE;
DO $check$
DECLARE
  before_page text;
  initial_count integer;
  active_count integer;
BEGIN
  SELECT page INTO before_page FROM beagu_private.beagu_live_presence_v1
    WHERE visitor_id='00000000-0000-4000-8000-000000000038'::uuid;
  IF before_page <> 'index' THEN RAISE EXCEPTION '30-second page-switch throttling failed: %',before_page; END IF;
  SELECT count(*) INTO initial_count FROM beagu_private.beagu_live_presence_v1;
  IF initial_count <> 2 THEN RAISE EXCEPTION 'Expected two distinct synthetic visitor rows, got %',initial_count; END IF;
  IF (SELECT page FROM beagu_private.beagu_live_presence_v1
      WHERE visitor_id='00000000-0000-4000-8000-000000000039'::uuid) <> 'other'
    THEN RAISE EXCEPTION 'Unknown page was not normalized to other'; END IF;
  SELECT count(*) INTO active_count FROM beagu_private.beagu_live_presence_v1
    WHERE last_seen_at >= now()-interval '5 minutes';
  IF active_count <> 2 THEN RAISE EXCEPTION 'Unexpected 5-minute active count: %',active_count; END IF;
  UPDATE beagu_private.beagu_live_presence_v1 SET last_seen_at=now()-interval '31 seconds'
    WHERE visitor_id='00000000-0000-4000-8000-000000000038'::uuid;
END $check$;
SET LOCAL ROLE service_role;
SELECT public.beagu_presence_ping_v1('00000000-0000-4000-8000-000000000038'::uuid,'challenge');
RESET ROLE;
DO $recheck$
BEGIN
  IF (SELECT page FROM beagu_private.beagu_live_presence_v1
      WHERE visitor_id='00000000-0000-4000-8000-000000000038'::uuid) <> 'challenge'
    THEN RAISE EXCEPTION '31-second page refresh did not update'; END IF;
END $recheck$;
SET LOCAL ROLE anon;
DO $deny$
BEGIN
  BEGIN
    PERFORM public.beagu_presence_ping_v1('00000000-0000-4000-8000-000000000038'::uuid,'index');
    RAISE EXCEPTION 'Anonymous caller executed private presence ping';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $deny$;
RESET ROLE;
ROLLBACK;
-- PASS: no exception; no persistent user data.
