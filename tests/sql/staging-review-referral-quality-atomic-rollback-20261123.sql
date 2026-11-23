-- STAGING QA: referral reviewer positive REJECT + denied unverified APPROVE.
-- This is NOT a verified Google Forms response and MUST NOT elevate Lv2.
-- All synthetic auth/users/referrals/audits/trigger are rolled back.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.qa_force_referral_audit_failure()
RETURNS trigger LANGUAGE plpgsql AS $fail$
BEGIN
  RAISE EXCEPTION 'QA_REFERRAL_AUDIT_FORCED_FAILURE' USING ERRCODE='P0001';
END;
$fail$;
DO $qa$
DECLARE
  qa_actor CONSTANT uuid := 'c0000000-0000-4000-8000-00000000a003';
  qa_session CONSTANT uuid := 'c0000000-0000-4000-8000-00000000a004';
  qa_event CONSTANT text := repeat('d',64);
  v_denied boolean;
  v_result jsonb;
  v_audit integer;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint c
   WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
   AND c.conname='beagu_2026_results_snapshot_school_id_check'
   AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%'
 ) THEN RAISE EXCEPTION 'REFUSE_NON_STAGING'; END IF;
 IF (SELECT count(*) FROM auth.users)<>0
  OR (SELECT count(*) FROM auth.sessions)<>0
  OR (SELECT count(*) FROM public.beagu_admin_accounts)<>0
  OR (SELECT count(*) FROM beagu_private.challenge_referral_events)<>0
  OR (SELECT count(*) FROM beagu_private.challenge_referral_quality_reviews)<>0
  OR (SELECT count(*) FROM beagu_private.challenge_referral_quality_audit)<>0
  OR (SELECT count(*) FROM beagu_private.challenge_referral_profiles)<>0
  OR NOT EXISTS(SELECT 1 FROM beagu_private.challenge_referral_settings
      WHERE name='public_enabled' AND enabled=false)
 THEN RAISE EXCEPTION 'NONEMPTY_OR_REFERRALS_ALREADY_ENABLED'; END IF;

 INSERT INTO auth.users(id,instance_id,aud,role,email,
     raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 VALUES(qa_actor,'00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated',NULL,'{}'::jsonb,'{}'::jsonb,now(),now());
 INSERT INTO auth.sessions(id,user_id,aal,not_after,created_at,updated_at)
 VALUES(qa_session,qa_actor,'aal2'::auth.aal_level,
   now()+interval '1 hour',now(),now());
 INSERT INTO public.beagu_admin_accounts(user_id,role,enabled)
 VALUES(qa_actor,'owner',true);

 INSERT INTO beagu_private.challenge_referral_events(
    event_sha256,referral_token_sha256,respondent_sha256,decision,referrer_visitor_id)
 VALUES(qa_event,repeat('e',64),repeat('f',64),'pending_quality_review',NULL);
 INSERT INTO beagu_private.challenge_referral_quality_reviews(
    event_sha256,quality_status,signals,form_quality_attested)
 VALUES(qa_event,'REVIEW_REQUIRED',ARRAY['QA_SYNTHETIC'],'false');

 -- Even with a synthetic AAL2 owner, unverified submission is NOT enough.
 v_denied:=false;
 BEGIN
   PERFORM public.beagu_referral_quality_resolve(
     qa_event,qa_actor,qa_session,'APPROVE',
     'QA cannot credit without verified submission.');
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'UNATTESTED_REFERRAL_APPROVAL_ACCEPTED'; END IF;

 -- Claiming an external form as attested still cannot override disabled
 -- rollout. The only identity data here is a QA event/hash.
 UPDATE beagu_private.challenge_referral_quality_reviews
 SET form_quality_attested=true WHERE event_sha256=qa_event;
 v_denied:=false;
 BEGIN
   PERFORM public.beagu_referral_quality_resolve(
     qa_event,qa_actor,qa_session,'APPROVE',
     'QA rollout disabled must block Lv2 credit.');
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'DISABLED_REFERRAL_LAUNCH_BYPASSED'; END IF;
 IF (SELECT count(*) FROM beagu_private.challenge_referral_profiles)<>0
 THEN RAISE EXCEPTION 'UNVERIFIED_LV2_PROFILE_CREATED'; END IF;

 -- Owner may REJECT a pending synthetic event; each change must be audited.
 SELECT public.beagu_referral_quality_resolve(
     qa_event,qa_actor,qa_session,'REJECT',
     'QA privacy review rejects invalid referral.')
 INTO v_result;
 IF v_result->>'decision'<>'REJECT'
   OR (SELECT decision FROM beagu_private.challenge_referral_events
     WHERE event_sha256=qa_event)<>'rejected_quality'
   OR (SELECT quality_status FROM beagu_private.challenge_referral_quality_reviews
     WHERE event_sha256=qa_event)<>'REJECTED'
   OR (SELECT count(*) FROM beagu_private.challenge_referral_quality_audit
     WHERE event_sha256=qa_event AND action='OWNER_REJECTED')<>1
 THEN RAISE EXCEPTION 'REFERRAL_REJECTION_OR_AUDIT_NOT_ATOMIC'; END IF;
 SELECT count(*) INTO v_audit
 FROM beagu_private.challenge_referral_quality_audit;

 -- A forced failure in the LAST audit step must undo event/review updates.
 UPDATE beagu_private.challenge_referral_events
 SET decision='pending_quality_review' WHERE event_sha256=qa_event;
 UPDATE beagu_private.challenge_referral_quality_reviews
 SET quality_status='REVIEW_REQUIRED',reviewer_user_id=NULL,
     reviewed_at=NULL,notes=NULL,form_quality_attested=false
 WHERE event_sha256=qa_event;

 EXECUTE 'CREATE TRIGGER qa_force_referral_audit_failure
   BEFORE INSERT ON beagu_private.challenge_referral_quality_audit
   FOR EACH ROW EXECUTE FUNCTION pg_temp.qa_force_referral_audit_failure()';
 v_denied:=false;
 BEGIN
   PERFORM public.beagu_referral_quality_resolve(
     qa_event,qa_actor,qa_session,'REJECT',
     'QA failure must roll back all changes.');
 EXCEPTION WHEN SQLSTATE 'P0001' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'REFERRAL_AUDIT_FAILURE_NOT_PROPAGATED'; END IF;
 IF (SELECT decision FROM beagu_private.challenge_referral_events
     WHERE event_sha256=qa_event)<>'pending_quality_review'
   OR (SELECT quality_status FROM beagu_private.challenge_referral_quality_reviews
     WHERE event_sha256=qa_event)<>'REVIEW_REQUIRED'
   OR (SELECT count(*) FROM beagu_private.challenge_referral_quality_audit)<>v_audit
 THEN RAISE EXCEPTION 'REFERRAL_REJECTION_PARTIALLY_COMMITTED'; END IF;
 RAISE NOTICE 'QA PASS: no Lv2 credit without verified form and rollout; REJECT audit atomic; injected last audit failure rolls back everything';
END;
$qa$;
ROLLBACK;
SELECT
 (SELECT count(*) FROM auth.users) auth_users,
 (SELECT count(*) FROM auth.sessions) auth_sessions,
 (SELECT count(*) FROM public.beagu_admin_accounts) admin_accounts,
 (SELECT count(*) FROM beagu_private.challenge_referral_events) referral_events,
 (SELECT count(*) FROM beagu_private.challenge_referral_quality_reviews) quality_reviews,
 (SELECT count(*) FROM beagu_private.challenge_referral_quality_audit) quality_audits,
 (SELECT count(*) FROM beagu_private.challenge_referral_profiles) referral_profiles,
 (SELECT count(*) FROM pg_trigger WHERE tgname='qa_force_referral_audit_failure') qa_triggers,
 (SELECT enabled FROM beagu_private.challenge_referral_settings WHERE name='public_enabled') rollout_enabled;
