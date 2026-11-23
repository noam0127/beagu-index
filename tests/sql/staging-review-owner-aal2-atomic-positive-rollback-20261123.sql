-- STAGING-ONLY transactional positive/negative authorization simulation.
-- A synthetic auth.users row and an AAL2-LABELED auth.sessions row are
-- database test fixtures, NOT a real MFA enrollment, TOTP or JWT login.
-- Every fixture, approval transition and audit change is ROLLED BACK.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.qa_forced_admin_audit_failure()
RETURNS trigger LANGUAGE plpgsql AS $fail$
BEGIN
  RAISE EXCEPTION 'QA_FORCED_AUDIT_INSERT_FAILURE' USING ERRCODE='P0001';
END;
$fail$;

DO $qa$
DECLARE
  qa_actor CONSTANT uuid := 'c0000000-0000-4000-8000-00000000a001';
  qa_session CONSTANT uuid := 'c0000000-0000-4000-8000-00000000a002';
  qa_school CONSTANT text := 'TST0999';
  qa_digest CONSTANT text := repeat('a',64);
  denied boolean;
  before_admin_audit bigint;
  before_approval_audit bigint;
  before_basis_audit bigint;
BEGIN
  -- Critical cross-project safety: the production snapshot table has NO
  -- restrictive TST-only school-ID constraint. Refuse non-stage databases.
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
      AND c.conname='beagu_2026_results_snapshot_school_id_check'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%'
  ) THEN RAISE EXCEPTION 'NOT_ISOLATED_STAGING_DATABASE'; END IF;

  IF (SELECT count(*) FROM auth.users)<>0
     OR (SELECT count(*) FROM auth.sessions)<>0
     OR (SELECT count(*) FROM public.beagu_admin_accounts)<>0
     OR (SELECT count(*) FROM public.beagu_2026_results_snapshot)<>0
     OR (SELECT count(*) FROM public.schools WHERE school_id~'^TST[0-9]{4}$')<>0
     OR (SELECT count(*) FROM beagu_private.beagu_2026_results_approval_audit)<>0
     OR (SELECT count(*) FROM beagu_private.beagu_2026_basis_review_events)<>0
  THEN RAISE EXCEPTION 'STAGING_NOT_EMPTY_OR_TEST_FIXTURE_COLLISION'; END IF;

  SELECT count(*) INTO before_admin_audit
    FROM public.beagu_admin_audit_events;

  -- This database-only fake account has NO email/password or real auth token.
  INSERT INTO auth.users(id,instance_id,aud,role,email,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  VALUES(qa_actor,'00000000-0000-0000-0000-000000000000',
    'authenticated','authenticated',NULL,'{}'::jsonb,'{}'::jsonb,now(),now());

  INSERT INTO auth.sessions(id,user_id,aal,not_after,created_at,updated_at)
  VALUES(qa_session,qa_actor,'aal2'::auth.aal_level,
    now()+interval '1 hour',now(),now());

  INSERT INTO public.beagu_admin_accounts(user_id,role,enabled)
  VALUES(qa_actor,'owner',true);

  INSERT INTO public.schools(school_id,school_name,sido)
  VALUES(qa_school,'가상 QA 검증학교','시험');

  INSERT INTO public.beagu_2026_results_snapshot(
    school_id,school_response_rows,school_match_status,questions,
    payload_sha256,source_snapshot_at,approval_status,approved_by,
    approved_at,approval_evidence,approved_payload_sha256
  ) VALUES(qa_school,1,'MATCHED','[]'::jsonb,qa_digest,now(),
    'APPROVED',qa_actor::text,now(),'{"qa":true}'::jsonb,qa_digest);

  IF NOT public.beagu_admin_active_mfa_session(qa_actor,qa_session)
  THEN RAISE EXCEPTION 'test AAL2 session not detected'; END IF;

  -- Viewer may NEVER hold/review.
  UPDATE public.beagu_admin_accounts SET role='viewer' WHERE user_id=qa_actor;
  denied:=false;
  BEGIN
    PERFORM public.beagu_2026_admin_hold_result(
      qa_school,qa_digest,qa_actor,qa_session,'synthetic reviewer role rejection');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'VIEWER_ROLE_BYPASSED_OWNER_CHECK'; END IF;
  UPDATE public.beagu_admin_accounts SET role='owner' WHERE user_id=qa_actor;

  -- AAL1 is not the same as AAL2.
  UPDATE auth.sessions SET aal='aal1'::auth.aal_level WHERE id=qa_session;
  IF public.beagu_admin_active_mfa_session(qa_actor,qa_session)
  THEN RAISE EXCEPTION 'AAL1_MISTAKEN_FOR_AAL2'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.beagu_2026_admin_hold_result(
      qa_school,qa_digest,qa_actor,qa_session,'synthetic AAL1 rejection reason');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AAL1_ACCEPTED_FOR_HOLD'; END IF;
  UPDATE auth.sessions SET aal='aal2'::auth.aal_level WHERE id=qa_session;

  -- Expired AAL2 session may NEVER issue decisions.
  UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id=qa_session;
  IF public.beagu_admin_active_mfa_session(qa_actor,qa_session)
  THEN RAISE EXCEPTION 'EXPIRED_SESSION_MISTAKEN_FOR_ACTIVE'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.beagu_2026_admin_hold_result(
      qa_school,qa_digest,qa_actor,qa_session,'synthetic expired session denial');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'EXPIRED_AAL2_SESSION_ACCEPTED'; END IF;
  UPDATE auth.sessions SET not_after=now()+interval '1 hour' WHERE id=qa_session;

  -- Database-positive authorization path for a PENDING legal basis review.
  -- This NEVER claims verified consent, personal-data approval or publication.
  PERFORM public.beagu_2026_admin_record_basis_review(
    qa_school,qa_digest,qa_actor,qa_session,'PENDING',
    NULL,NULL,NULL,NULL,NULL,
    'Synthetic QA basis review remains pending.',
    false,false,false,false,false);
  IF (SELECT review_status FROM beagu_private.beagu_2026_publication_basis_review
      WHERE school_id=qa_school)<>'PENDING'
     OR (SELECT count(*) FROM beagu_private.beagu_2026_basis_review_events
         WHERE school_id=qa_school AND action='PENDING')<>1
     OR (SELECT approval_status FROM public.beagu_2026_results_snapshot
         WHERE school_id=qa_school)<>'WITHHELD'
  THEN RAISE EXCEPTION 'PENDING_BASIS_DID_NOT_REVOKE_APPROVAL'; END IF;

  -- Restore fictional *fixture* state to exercise a separate HOLD success.
  UPDATE public.beagu_2026_results_snapshot
   SET approval_status='APPROVED',approved_by=qa_actor::text,approved_at=now(),
       approved_payload_sha256=qa_digest,approval_evidence='{"qa":true}'::jsonb
  WHERE school_id=qa_school;
  SELECT count(*) INTO before_approval_audit
    FROM beagu_private.beagu_2026_results_approval_audit;

  -- Single success path: hold + private audit + public audit commit atomically.
  PERFORM public.beagu_2026_admin_hold_result(
    qa_school,qa_digest,qa_actor,qa_session,
    'Synthetic private hold with two atomic audits.');
  IF (SELECT approval_status FROM public.beagu_2026_results_snapshot
      WHERE school_id=qa_school)<>'WITHHELD'
    OR (SELECT count(*) FROM beagu_private.beagu_2026_results_approval_audit)
       <>before_approval_audit+1
    OR (SELECT count(*) FROM public.beagu_admin_audit_events)
       <>before_admin_audit+1
    OR (SELECT count(*) FROM public.beagu_admin_audit_events
        WHERE actor_user_id=qa_actor AND event_type='admin_2026_review_hold'
           AND outcome='success')<>1
  THEN RAISE EXCEPTION 'POSITIVE_HOLD_OR_BOTH_AUDITS_INCONSISTENT'; END IF;

  -- Create failure injection in this transaction ONLY.
  -- If the last audit INSERT fails, the inner SQL call must roll back
  -- BOTH earlier operations: snapshot WITHHELD and private audit INSERT.
  UPDATE public.beagu_2026_results_snapshot
   SET approval_status='APPROVED',approved_by=qa_actor::text,approved_at=now(),
       approved_payload_sha256=qa_digest,approval_evidence='{"qa":true}'::jsonb
  WHERE school_id=qa_school;
  SELECT count(*) INTO before_approval_audit
    FROM beagu_private.beagu_2026_results_approval_audit;
  SELECT count(*) INTO before_basis_audit
    FROM beagu_private.beagu_2026_basis_review_events;
  EXECUTE 'CREATE TRIGGER qa_force_public_audit_failure
    BEFORE INSERT ON public.beagu_admin_audit_events
    FOR EACH ROW EXECUTE FUNCTION pg_temp.qa_forced_admin_audit_failure()';
  denied:=false;
  BEGIN
    PERFORM public.beagu_2026_admin_hold_result(
      qa_school,qa_digest,qa_actor,qa_session,
      'Synthetic failure injection should roll back.');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'AUDIT_FAILURE_WAS_NOT_PROPAGATED'; END IF;
  IF (SELECT approval_status FROM public.beagu_2026_results_snapshot
      WHERE school_id=qa_school)<>'APPROVED'
    OR (SELECT count(*) FROM beagu_private.beagu_2026_results_approval_audit)
       <>before_approval_audit
    OR (SELECT count(*) FROM public.beagu_admin_audit_events)
       <>before_admin_audit+1
    OR (SELECT count(*) FROM beagu_private.beagu_2026_basis_review_events)
       <>before_basis_audit
  THEN RAISE EXCEPTION 'ATOMICITY_BROKEN_PARTIAL_PRIVATE_OR_SNAPSHOT_COMMIT'; END IF;

  RAISE NOTICE 'QA PASS: fabricated AAL2 DB fixture ONLY, viewer/AAL1/expired denied, PENDING basis revokes approval, owner HOLD +2 audits success, injected audit failure restores snapshot and private audit';
END;
$qa$;
ROLLBACK;
-- All stage QA-only changes (including Auth mock row and trigger) must vanish.
SELECT
  (SELECT count(*) FROM auth.users) AS auth_users_after_rollback,
  (SELECT count(*) FROM auth.sessions) AS auth_sessions_after_rollback,
  (SELECT count(*) FROM public.beagu_admin_accounts) AS admin_accounts_after_rollback,
  (SELECT count(*) FROM public.beagu_2026_results_snapshot) AS qa_snapshots_after_rollback,
  (SELECT count(*) FROM beagu_private.beagu_2026_results_approval_audit) AS private_approval_audits_after_rollback,
  (SELECT count(*) FROM beagu_private.beagu_2026_basis_review_events) AS basis_events_after_rollback,
  (SELECT count(*) FROM public.beagu_admin_audit_events WHERE actor_user_id='c0000000-0000-4000-8000-00000000a001') AS qa_public_audits_after_rollback,
  (SELECT count(*) FROM public.schools WHERE school_id='TST0999') AS qa_schools_after_rollback,
  (SELECT count(*) FROM pg_trigger WHERE tgname='qa_force_public_audit_failure') AS qa_trigger_after_rollback;
