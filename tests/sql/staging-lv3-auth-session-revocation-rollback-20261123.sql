-- Stage-only atomic simulation, no Auth emails or JWTs created.
-- Tests that revoked/expired Auth sessions cannot keep Lv3/member rights.
BEGIN;
DO $qa$
DECLARE
 user_a constant uuid := 'd1000000-0000-4000-8000-000000000001';
 user_b constant uuid := 'd1000000-0000-4000-8000-000000000002';
 sess constant uuid := 'd1000000-0000-4000-8000-000000000003';
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
 THEN RAISE EXCEPTION 'STAGE_HAS_REAL_AUTH_OR_LINKED_MEMBERS'; END IF;
 IF public.beagu_stage_active_member_auth_session(user_a,sess)
 THEN RAISE EXCEPTION 'NONEXISTENT_SESSION_ACCEPTED'; END IF;
 IF has_function_privilege('anon',
      'public.beagu_stage_active_member_auth_session(uuid,uuid)','EXECUTE')
   OR has_function_privilege('authenticated',
      'public.beagu_stage_active_member_auth_session(uuid,uuid)','EXECUTE')
   OR NOT has_function_privilege('service_role',
      'public.beagu_stage_active_member_auth_session(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'UNSAFE_MEMBER_SESSION_RPC_GRANTS'; END IF;

 INSERT INTO auth.users(id,instance_id,aud,role,
   raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 VALUES
 (user_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','{}'::jsonb,'{}'::jsonb,now(),now()),
 (user_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','{}'::jsonb,'{}'::jsonb,now(),now());
 INSERT INTO auth.sessions(id,user_id,aal,created_at,updated_at,not_after)
 VALUES(sess,user_a,'aal1'::auth.aal_level,now(),now(),now()+interval '1 hour');

 IF NOT public.beagu_stage_active_member_auth_session(user_a,sess)
 THEN RAISE EXCEPTION 'VALID_SESSION_NOT_FOUND'; END IF;
 IF public.beagu_stage_active_member_auth_session(user_b,sess)
 THEN RAISE EXCEPTION 'OTHER_USER_REUSED_SESSION_ID'; END IF;
 IF public.beagu_stage_active_member_auth_session(NULL,sess)
 OR public.beagu_stage_active_member_auth_session(user_a,NULL)
 THEN RAISE EXCEPTION 'NULL_SESSION_ACCEPTED'; END IF;

 UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=sess;
 IF public.beagu_stage_active_member_auth_session(user_a,sess)
 THEN RAISE EXCEPTION 'EXPIRED_SESSION_ACCEPTED'; END IF;
 UPDATE auth.sessions SET not_after=now()+interval '1 hour',user_id=user_b WHERE id=sess;
 IF public.beagu_stage_active_member_auth_session(user_a,sess)
 THEN RAISE EXCEPTION 'REASSIGNED_SESSION_ACCEPTED'; END IF;
 IF NOT public.beagu_stage_active_member_auth_session(user_b,sess)
 THEN RAISE EXCEPTION 'VALID_REASSIGNED_SESSION_NOT_FOUND'; END IF;

 DELETE FROM auth.sessions WHERE id=sess;
 IF public.beagu_stage_active_member_auth_session(user_a,sess)
 OR public.beagu_stage_active_member_auth_session(user_b,sess)
 THEN RAISE EXCEPTION 'REVOKED_SESSION_ACCEPTED'; END IF;
 RAISE NOTICE 'PASS: active user-owned session accepted; missing, wrong user, NULL, expired and deleted session rejected';
END $qa$;
ROLLBACK;
SELECT
 (SELECT count(*) FROM auth.users) AS users_after_rollback,
 (SELECT count(*) FROM auth.sessions) AS sessions_after_rollback,
 (SELECT count(*) FROM public.beagu_postit_member_accounts) AS members_after_rollback;
