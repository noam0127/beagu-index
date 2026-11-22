-- Test-only one-time claim for staging Auth security harness.
DO $$ BEGIN IF to_regclass('stage_private.fake_schools') IS NULL THEN
 RAISE EXCEPTION 'STOP: NOT STAGING';
END IF; END $$;
CREATE OR REPLACE FUNCTION public.stage35_claim_auth_once()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path TO ''
AS $fn$
DECLARE n integer;
BEGIN
 INSERT INTO stage_private.stage35_auth_once(run_id)
 VALUES('stage35-auth-real-ab-20261122')
 ON CONFLICT(run_id) DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n = 1;
END
$fn$;
REVOKE ALL ON FUNCTION public.stage35_claim_auth_once() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage35_claim_auth_once() TO service_role;
SELECT
 has_function_privilege('anon','public.stage35_claim_auth_once()','EXECUTE') AS anonymous_execute,
 has_function_privilege('service_role','public.stage35_claim_auth_once()','EXECUTE') AS service_execute,
 (SELECT count(*) FROM stage_private.stage35_auth_once
  WHERE run_id='stage35-auth-real-ab-20261122') AS prior_runs;
