DO $$ BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL
 THEN RAISE EXCEPTION 'Not isolated staging'; END IF;
 IF (SELECT count(*) FROM auth.users)<>0 OR
    (SELECT count(*) FROM public.beagu_postit_posts)<>0 OR
    (SELECT count(*) FROM public.beagu_postit_comments)<>0
 THEN RAISE EXCEPTION 'Pre-existing data; stop'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.stage35_claim_crud_once()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path TO ''
AS $fn$
DECLARE rows_added integer;
BEGIN
 INSERT INTO stage_private.stage35_auth_once(run_id)
 VALUES('stage35-real-postit-crud-20261122')
 ON CONFLICT (run_id) DO NOTHING;
 GET DIAGNOSTICS rows_added = ROW_COUNT;
 RETURN rows_added=1;
END
$fn$;
REVOKE ALL ON FUNCTION public.stage35_claim_crud_once() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stage35_claim_crud_once() TO service_role;
SELECT has_function_privilege('anon','public.stage35_claim_crud_once()','EXECUTE') AS anon_exec,
       has_function_privilege('service_role','public.stage35_claim_crud_once()','EXECUTE') AS service_exec;