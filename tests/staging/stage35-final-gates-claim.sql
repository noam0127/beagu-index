-- One-use staging-only Lv1/Lv2/Lv3 2026 release + AAL1 MFA gate test.
DO $$ BEGIN IF to_regclass('stage_private.fake_schools') IS NULL
 THEN RAISE EXCEPTION 'STAGING ONLY'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.stage35_claim_final_gates_once()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $fn$
DECLARE inserted integer;
BEGIN
 INSERT INTO stage_private.stage35_auth_once(run_id)
 VALUES('stage35-final-release-and-mfa-20261122')
 ON CONFLICT(run_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN inserted=1;
END $fn$;
REVOKE ALL ON FUNCTION public.stage35_claim_final_gates_once()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stage35_claim_final_gates_once() TO service_role;
SELECT has_function_privilege('anon','public.stage35_claim_final_gates_once()','EXECUTE') AS anon,
 (SELECT count(*) FROM stage_private.stage35_auth_once WHERE run_id='stage35-final-release-and-mfa-20261122') AS prior_runs,
 (SELECT count(*) FROM auth.users) AS users,
 (SELECT count(*) FROM public.beagu_release_metrics_v2) AS metrics;