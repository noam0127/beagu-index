-- Staging-only unique one-use claim for real post/comment ownership E2E.
DO $$ BEGIN IF to_regclass('stage_private.fake_schools') IS NULL
 THEN RAISE EXCEPTION 'STOP: not isolated staging'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.stage35_claim_postit_once()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $fn$
DECLARE n integer;
BEGIN
 INSERT INTO stage_private.stage35_auth_once(run_id)
 VALUES('stage35-postit-ab-20261122')
 ON CONFLICT(run_id) DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n = 1;
END
$fn$;
REVOKE ALL ON FUNCTION public.stage35_claim_postit_once() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stage35_claim_postit_once() TO service_role;
SELECT (SELECT count(*) FROM stage_private.stage35_auth_once
 WHERE run_id='stage35-postit-ab-20261122') AS prior_qa_invocations,
 has_function_privilege('anon','public.stage35_claim_postit_once()','EXECUTE') AS anon_can_invoke,
 has_function_privilege('service_role','public.stage35_claim_postit_once()','EXECUTE') AS service_can_invoke,
 (SELECT count(*) FROM auth.users) AS existing_auth_users,
 (SELECT count(*) FROM public.beagu_postit_posts) AS existing_posts;