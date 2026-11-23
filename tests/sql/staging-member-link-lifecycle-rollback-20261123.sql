-- Isolated stage; every synthetic actor, visitor, membership, audit and
-- failing trigger is rolled back. Never use production Auth or data.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.qa_fail_member_audit()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN RAISE EXCEPTION 'QA_MEMBER_AUDIT_FAILURE' USING ERRCODE='P0001'; END;
$f$;
DO $qa$
DECLARE
 actor_a CONSTANT uuid := 'd2000000-0000-4000-8000-000000000001';
 actor_b CONSTANT uuid := 'd2000000-0000-4000-8000-000000000002';
 session_a CONSTANT uuid := 'd2000000-0000-4000-8000-000000000003';
 session_b CONSTANT uuid := 'd2000000-0000-4000-8000-000000000004';
 visitor CONSTANT uuid := 'd2000000-0000-4000-8000-000000000005';
 author CONSTANT uuid := 'd2000000-0000-4000-8000-000000000006';
 secret_hash CONSTANT text := repeat('f',64);
 response jsonb;
 errors boolean;
 audit_count bigint;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint c
  WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
  AND c.conname='beagu_2026_results_snapshot_school_id_check'
  AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%'
 ) THEN RAISE EXCEPTION 'REFUSE_NON_ISOLATED_STAGE'; END IF;
 IF (SELECT count(*) FROM auth.users)<>0
 OR (SELECT count(*) FROM auth.sessions)<>0
 OR (SELECT count(*) FROM public.beagu_postit_member_accounts)<>0
 OR (SELECT count(*) FROM beagu_private.beagu_postit_member_link_audit)<>0
 OR (SELECT count(*) FROM beagu_private.challenge_referral_profiles)<>0
 OR (SELECT count(*) FROM beagu_private.challenge_identity_codes)<>0
 OR (SELECT count(*) FROM beagu_private.challenge_device_claims)<>0
 THEN RAISE EXCEPTION 'REFUSE_NONEMPTY_STAGE_QA'; END IF;
 IF has_function_privilege('anon',
   'public.beagu_stage_postit_member_transition(uuid,uuid,uuid,uuid,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.beagu_stage_postit_member_transition(uuid,uuid,uuid,uuid,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.beagu_stage_postit_member_transition(uuid,uuid,uuid,uuid,text,text)','EXECUTE')
 OR has_table_privilege('anon','beagu_private.beagu_postit_member_link_audit','SELECT')
 THEN RAISE EXCEPTION 'UNSAFE_MEMBER_AUDIT_OR_RPC_GRANTS'; END IF;

 response:=public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'LINK',secret_hash);
 IF response->>'reason'<>'AUTH_SESSION_INACTIVE' THEN RAISE EXCEPTION 'NO_AUTH_LINK_ACCEPTED'; END IF;

 INSERT INTO auth.users(id,instance_id,aud,role,raw_app_meta_data,
   raw_user_meta_data,created_at,updated_at)
 VALUES (actor_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','{}'::jsonb,'{}'::jsonb,now(),now()),
 (actor_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','{}'::jsonb,'{}'::jsonb,now(),now());
 INSERT INTO auth.sessions(id,user_id,aal,created_at,updated_at,not_after)
 VALUES(session_a,actor_a,'aal1'::auth.aal_level,now(),now(),now()+interval '1 hour'),
       (session_b,actor_b,'aal1'::auth.aal_level,now(),now(),now()+interval '1 hour');
 INSERT INTO beagu_private.challenge_identity_codes(
  campaign,visitor_id,participant_no,identity_code)
 VALUES('2026',visitor,987654321,'QA-STAGE-TEST-INVITE-987654321');
 INSERT INTO beagu_private.challenge_referral_profiles(
  campaign,visitor_id,identity_code_sha256,referral_token_sha256,
  access_level,valid_referrals,upgraded_at,disabled)
 VALUES('2026',visitor,repeat('a',64),repeat('b',64),2,1,now(),false);
 INSERT INTO beagu_private.challenge_device_claims(campaign,visitor_id,device_secret_sha256)
 VALUES('2026',visitor,secret_hash);
 response:=public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'LINK',repeat('e',64));
 IF response->>'reason'<>'DEVICE_OR_EARNED_LV2_UNVERIFIED'
 THEN RAISE EXCEPTION 'WRONG_DEVICE_LINK_ACCEPTED'; END IF;

 response:=public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'LINK',secret_hash);
 IF response->>'state'<>'active' OR (response->>'changed')::boolean IS NOT TRUE
 THEN RAISE EXCEPTION 'VALID_NEW_LINK_FAILED'; END IF;
 IF (SELECT count(*) FROM beagu_private.beagu_postit_member_link_audit WHERE operation='LINK')<>1
 THEN RAISE EXCEPTION 'INITIAL_LINK_NOT_AUDITED'; END IF;
 SELECT count(*) INTO audit_count FROM beagu_private.beagu_postit_member_link_audit;

 response:=public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'LINK',secret_hash);
 IF (response->>'changed')::boolean IS DISTINCT FROM false OR
  (SELECT count(*) FROM beagu_private.beagu_postit_member_link_audit)<>audit_count
 THEN RAISE EXCEPTION 'DUPLICATE_LINK_RECORDED'; END IF;

 response:=public.beagu_stage_postit_member_transition(actor_b,session_b,visitor,author,'SUSPEND',null);
 IF response->>'reason'<>'MEMBERSHIP_RESERVED'
 THEN RAISE EXCEPTION 'OTHER_MEMBER_SUSPEND_ACCEPTED'; END IF;

 response:=public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'SUSPEND',null);
 IF response->>'state'<>'suspended' OR (response->>'changed')::boolean IS NOT TRUE
 THEN RAISE EXCEPTION 'SELF_SUSPEND_FAILED'; END IF;
 IF (SELECT count(*) FROM beagu_private.beagu_postit_member_link_audit)<>audit_count+1
 THEN RAISE EXCEPTION 'SUSPEND_AUDIT_MISSING'; END IF;

 response:=public.beagu_stage_postit_member_transition(actor_b,session_b,visitor,author,'LINK',secret_hash);
 IF response->>'reason'<>'MEMBERSHIP_RESERVED'
 THEN RAISE EXCEPTION 'SUSPENDED_VISITOR_TRANSFER_ACCEPTED'; END IF;
 response:=public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'LINK',secret_hash);
 IF response->>'reason'<>'EXPLICIT_REACTIVATION_REQUIRED'
 THEN RAISE EXCEPTION 'IMPLICIT_REACTIVATION_ACCEPTED'; END IF;
 response:=public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'REACTIVATE',repeat('e',64));
 IF response->>'reason'<>'DEVICE_OR_EARNED_LV2_UNVERIFIED'
 THEN RAISE EXCEPTION 'WRONG_DEVICE_REACTIVATED'; END IF;
 UPDATE beagu_private.challenge_referral_profiles SET disabled=true
 WHERE visitor_id=visitor AND campaign='2026';
 response:=public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'REACTIVATE',secret_hash);
 IF response->>'reason'<>'DEVICE_OR_EARNED_LV2_UNVERIFIED'
 THEN RAISE EXCEPTION 'DISABLED_REFERRAL_REACTIVATED'; END IF;
 UPDATE beagu_private.challenge_referral_profiles SET disabled=false
 WHERE visitor_id=visitor AND campaign='2026';
 response:=public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'REACTIVATE',secret_hash);
 IF response->>'state'<>'active' OR (response->>'changed')::boolean IS NOT TRUE
 THEN RAISE EXCEPTION 'SAME_OWNER_REACTIVATION_FAILED'; END IF;
 IF (SELECT count(*) FROM beagu_private.beagu_postit_member_link_audit)<>audit_count+2
 THEN RAISE EXCEPTION 'REACTIVATION_AUDIT_MISSING'; END IF;

 -- Force failure of the LAST audit INSERT after status update.
 EXECUTE 'CREATE TRIGGER qa_member_link_audit_fail
 BEFORE INSERT ON beagu_private.beagu_postit_member_link_audit
 FOR EACH ROW EXECUTE FUNCTION pg_temp.qa_fail_member_audit()';
 errors:=false;
 BEGIN
  PERFORM public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'SUSPEND',null);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN errors:=true;
 END;
 IF NOT errors OR (SELECT status FROM public.beagu_postit_member_accounts WHERE auth_user_id=actor_a)<>'active'
 OR (SELECT count(*) FROM beagu_private.beagu_postit_member_link_audit)<>audit_count+2
 THEN RAISE EXCEPTION 'FAILED_AUDIT_PARTIALLY_COMMITTED'; END IF;

 DELETE FROM auth.sessions WHERE id=session_a;
 response:=public.beagu_stage_postit_member_transition(actor_a,session_a,visitor,author,'SUSPEND',null);
 IF response->>'reason'<>'AUTH_SESSION_INACTIVE'
 THEN RAISE EXCEPTION 'REVOKED_SESSION_SUSPEND_ACCEPTED'; END IF;

 RAISE NOTICE 'QA PASS: link/suspend/reactivate audited atomically; other account, stale session, revoked referral, wrong device rejected; audit failure rolls back state';
END $qa$;
ROLLBACK;
SELECT
 (SELECT count(*) FROM auth.users) AS qa_auth_users_after,
 (SELECT count(*) FROM auth.sessions) AS qa_auth_sessions_after,
 (SELECT count(*) FROM public.beagu_postit_member_accounts) AS qa_members_after,
 (SELECT count(*) FROM beagu_private.beagu_postit_member_link_audit) AS qa_member_audits_after,
 (SELECT count(*) FROM beagu_private.challenge_identity_codes) AS qa_identity_rows_after,
 (SELECT count(*) FROM beagu_private.challenge_referral_profiles) AS qa_referral_rows_after,
 (SELECT count(*) FROM beagu_private.challenge_device_claims) AS qa_device_rows_after,
 (SELECT count(*) FROM pg_trigger WHERE tgname='qa_member_link_audit_fail') AS qa_failure_triggers_after;
