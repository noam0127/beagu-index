-- Staging-only cleanup: unused temporary Post-it claim endpoint was never called.
-- Keep durable SQL test scripts, remove its unnecessary callable RPC.
DO $$ BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL THEN
  RAISE EXCEPTION 'STOP: non-staging environment';
 END IF;
 IF EXISTS(SELECT 1 FROM stage_private.stage35_auth_once
           WHERE run_id='stage35-postit-ab-20261122') THEN
  RAISE EXCEPTION 'STOP: test attempt exists; inspect before changing';
 END IF;
END $$;
DROP FUNCTION IF EXISTS public.stage35_claim_postit_once();
SELECT
 to_regprocedure('public.stage35_claim_postit_once()') IS NULL AS claim_rpc_removed,
 (SELECT count(*) FROM auth.users) AS auth_accounts_remaining,
 (SELECT count(*) FROM public.beagu_postit_member_accounts) AS member_links_remaining,
 (SELECT count(*) FROM public.beagu_postit_posts) AS posts_remaining,
 (SELECT count(*) FROM public.beagu_postit_comments) AS comments_remaining;