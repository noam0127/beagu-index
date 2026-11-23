-- STAGING ONLY: simulate member-link suspension and deletion, rollback fully.
BEGIN;
DO $qa$
DECLARE
  actor CONSTANT uuid := 'd1000000-0000-4000-8000-000000000031';
  visitor CONSTANT uuid := 'd1000000-0000-4000-8000-000000000032';
  author CONSTANT uuid := 'd1000000-0000-4000-8000-000000000033';
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint c
  WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
    AND c.conname='beagu_2026_results_snapshot_school_id_check'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%'
 ) THEN RAISE EXCEPTION 'REFUSE_NON_STAGE_DB'; END IF;
 IF (SELECT count(*) FROM auth.users)<>0
   OR (SELECT count(*) FROM public.beagu_postit_member_accounts)<>0
 THEN RAISE EXCEPTION 'ABORT_MEMBER_DB_NOT_EMPTY'; END IF;
 INSERT INTO auth.users(id,instance_id,aud,role,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 VALUES(actor,'00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','{}'::jsonb,'{}'::jsonb,now(),now());
 INSERT INTO public.beagu_postit_member_accounts(
   auth_user_id,identity_visitor_id,author_uid,status)
 VALUES(actor,visitor,author,'active');
 IF NOT EXISTS(SELECT 1 FROM public.beagu_postit_member_accounts
   WHERE auth_user_id=actor AND identity_visitor_id=visitor
     AND author_uid=author AND status='active')
 THEN RAISE EXCEPTION 'ACTIVE_MEMBER_NOT_QUERYABLE'; END IF;

 -- Suspension is the supported checked state; "revoked" is not a valid enum.
 UPDATE public.beagu_postit_member_accounts SET status='suspended'
   WHERE auth_user_id=actor AND identity_visitor_id=visitor;
 IF EXISTS(SELECT 1 FROM public.beagu_postit_member_accounts
   WHERE auth_user_id=actor AND identity_visitor_id=visitor AND status='active')
 THEN RAISE EXCEPTION 'SUSPENDED_MEMBER_STILL_ACTIVE'; END IF;

 -- Full removal cancels the visitor account linkage as well.
 DELETE FROM public.beagu_postit_member_accounts WHERE auth_user_id=actor;
 IF EXISTS(SELECT 1 FROM public.beagu_postit_member_accounts
   WHERE auth_user_id=actor)
 THEN RAISE EXCEPTION 'DELETED_LINK_STILL_QUERYABLE'; END IF;
 RAISE NOTICE 'PASS: active member link visible, suspended hidden, deleted link absent';
END $qa$;
ROLLBACK;
SELECT
 (SELECT count(*) FROM auth.users) users_after,
 (SELECT count(*) FROM public.beagu_postit_member_accounts) member_links_after;
