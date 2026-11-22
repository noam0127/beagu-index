-- Stage35 one-time Lv3 Auth HTTP verification fixture.
-- Never apply to production: requires the staging-private marker.
DO $$ BEGIN IF to_regclass('stage_private.fake_schools') IS NULL
 THEN RAISE EXCEPTION 'STAGING ONLY'; END IF; END $$;

-- Production RPC is not copied. A staging-only earned-visitor stub is used
-- to exercise the actual Edge Function's second-factor authorization path.
CREATE OR REPLACE FUNCTION public.beagu_has_earned_challenge_visitor(p_visitor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT EXISTS(
  SELECT 1 FROM public.beagu_level_sessions
  WHERE identity_visitor_id=p_visitor
    AND identity_campaign='2026'
    AND access_level=2 AND expires_at>pg_catalog.now()
 )
$fn$;
REVOKE ALL ON FUNCTION public.beagu_has_earned_challenge_visitor(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_has_earned_challenge_visitor(uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.stage35_claim_lv3_once()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE inserted integer;
BEGIN
 INSERT INTO stage_private.stage35_auth_once(run_id)
 VALUES('stage35-lv3-auth-http-20261122') ON CONFLICT(run_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN inserted=1;
END $fn$;
REVOKE ALL ON FUNCTION public.stage35_claim_lv3_once() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stage35_claim_lv3_once() TO service_role;
SELECT
 has_function_privilege('anon','public.beagu_has_earned_challenge_visitor(uuid)','EXECUTE') AS anon_earned_rpc,
 has_function_privilege('authenticated','public.beagu_has_earned_challenge_visitor(uuid)','EXECUTE') AS auth_earned_rpc,
 has_function_privilege('anon','public.stage35_claim_lv3_once()','EXECUTE') AS anon_claim,
 (SELECT COUNT(*) FROM auth.users) AS auth_users_before,
 (SELECT COUNT(*) FROM stage_private.stage35_auth_once WHERE run_id='stage35-lv3-auth-http-20261122') AS previous_runs;
