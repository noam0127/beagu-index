-- Staging-only PRIVATE RPC read/denial regression.
-- The QA owner allowlist is intentionally EMPTY. The test makes ZERO
-- successful admin/quality decisions and preserves 16 pre-existing audit rows.
BEGIN;
DO $qa$
DECLARE
  v_queue jsonb;
  v_pipeline jsonb;
  v_quality jsonb;
  v_allowed boolean;
  v_actor uuid := 'a0000000-0000-4000-8000-00000000a001';
  v_session uuid := 'a0000000-0000-4000-8000-00000000a002';
  v_before_admin_audit bigint;
  v_before_snapshots bigint;
  v_before_quality_audit bigint;
  v_before_basis_events bigint;
  v_before_private_approval bigint;
BEGIN
  SELECT count(*) INTO v_before_admin_audit FROM public.beagu_admin_audit_events;
  SELECT count(*) INTO v_before_snapshots FROM public.beagu_2026_results_snapshot;
  SELECT count(*) INTO v_before_quality_audit FROM beagu_private.challenge_referral_quality_audit;
  SELECT count(*) INTO v_before_basis_events FROM beagu_private.beagu_2026_basis_review_events;
  SELECT count(*) INTO v_before_private_approval FROM beagu_private.beagu_2026_results_approval_audit;

  v_queue:=public.beagu_2026_admin_review_queue('all',20,0);
  IF v_queue->'items'<>'[]'::jsonb OR (v_queue->'summary'->>'total')::integer<>0
  THEN RAISE EXCEPTION 'private review queue was not empty'; END IF;
  v_pipeline:=public.beagu_2026_admin_pipeline_status();
  IF (v_pipeline->>'year')::integer<>2026
     OR (v_pipeline->'publication_eligibility'->>'approved')::integer<>0
  THEN RAISE EXCEPTION 'incorrect 2026 internal aggregate counts'; END IF;
  v_quality:=public.beagu_referral_quality_queue();
  IF v_quality->'items'<>'[]'::jsonb OR (v_quality->>'total')::integer<>0
  THEN RAISE EXCEPTION 'referral quality review queue not empty'; END IF;

  v_allowed:=true;
  BEGIN
    PERFORM public.beagu_2026_admin_hold_result(
      'TST0001',repeat('a',64),v_actor,v_session,'synthetic QA hold must be denied');
  EXCEPTION WHEN OTHERS THEN v_allowed:=false;
  END;
  IF v_allowed THEN RAISE EXCEPTION 'owner/MFA-less HOLD unexpectedly succeeded'; END IF;

  v_allowed:=true;
  BEGIN
    PERFORM public.beagu_2026_admin_record_basis_review(
      'TST0001',repeat('a',64),v_actor,v_session,'PENDING',
      NULL,NULL,NULL,NULL,NULL,'synthetic QA basis review must be denied',
      false,false,false,false,false);
  EXCEPTION WHEN OTHERS THEN v_allowed:=false;
  END;
  IF v_allowed THEN RAISE EXCEPTION 'owner/MFA-less basis review unexpectedly succeeded'; END IF;

  v_allowed:=true;
  BEGIN
    PERFORM public.beagu_referral_quality_resolve(
       repeat('a',64),v_actor,v_session,'APPROVE',
       'synthetic QA approval must be denied');
  EXCEPTION WHEN OTHERS THEN v_allowed:=false;
  END;
  IF v_allowed THEN RAISE EXCEPTION 'owner/MFA-less Lv2 credit unexpectedly succeeded'; END IF;

  IF (SELECT count(*) FROM public.beagu_admin_audit_events)<>v_before_admin_audit
   OR (SELECT count(*) FROM public.beagu_2026_results_snapshot)<>v_before_snapshots
   OR (SELECT count(*) FROM beagu_private.challenge_referral_quality_audit)<>v_before_quality_audit
   OR (SELECT count(*) FROM beagu_private.beagu_2026_basis_review_events)<>v_before_basis_events
   OR (SELECT count(*) FROM beagu_private.beagu_2026_results_approval_audit)<>v_before_private_approval
  THEN RAISE EXCEPTION 'QA failed: denied admin request mutated records'; END IF;
  RAISE NOTICE 'PASS: 3 read-only RPCs, 3 owner+MFA denials, zero audit/approval side effects';
END;
$qa$;
ROLLBACK;