-- Isolated test Supabase ycwuugggqbunlbwuzvbx only.
-- No real member account exists. The device-binding RPC is server-only and
-- must refuse a fabricated visitor, no valid referral credit, no device proof.
-- Transaction is ROLLBACK and must never create accounts.
BEGIN;
DO $check$
DECLARE
 v_user CONSTANT uuid:='d0000000-0000-4000-8000-00000000a001';
 v_visitor CONSTANT uuid:='d0000000-0000-4000-8000-00000000a002';
 v_author CONSTANT uuid:='d0000000-0000-4000-8000-00000000a003';
 v_bound uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c
   WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
   AND c.conname='beagu_2026_results_snapshot_school_id_check'
   AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%')
 THEN RAISE EXCEPTION 'ABORT_NON_STAGING_DATABASE'; END IF;
 IF (SELECT count(*) FROM auth.users)<>0
   OR (SELECT count(*) FROM public.beagu_postit_member_accounts)<>0
   OR (SELECT count(*) FROM beagu_private.challenge_referral_profiles)<>0
   OR (SELECT count(*) FROM beagu_private.challenge_device_claims)<>0
 THEN RAISE EXCEPTION 'ABORT_STAGE_NOT_EMPTY'; END IF;
 v_bound:=public.beagu_postit_bind_verified_member(
     v_user,v_visitor,repeat('a',64),v_author);
 IF v_bound IS NOT NULL
 THEN RAISE EXCEPTION 'UNVERIFIED_DEVICE_BOUND_MEMBER'; END IF;
 IF (SELECT count(*) FROM public.beagu_postit_member_accounts)<>0
 THEN RAISE EXCEPTION 'UNEXPECTED_MEMBER_ROW_CREATED'; END IF;
 IF has_function_privilege('anon',
   'public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid)','EXECUTE')
   OR has_function_privilege('authenticated',
   'public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid)','EXECUTE')
   OR NOT has_function_privilege('service_role',
   'public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'MEMBER_BINDING_RPC_PRIVILEGE_INCORRECT'; END IF;
 RAISE NOTICE 'PASS: synthetic unverified device rejected; no link created; RPC service_role only';
END;
$check$;
ROLLBACK;
SELECT
 (SELECT count(*) FROM public.beagu_postit_member_accounts) member_rows,
 (SELECT count(*) FROM auth.users) auth_users,
 (SELECT count(*) FROM public.beagu_level_sessions) level_sessions,
 (SELECT count(*) FROM beagu_private.challenge_referral_profiles) referral_profiles;
