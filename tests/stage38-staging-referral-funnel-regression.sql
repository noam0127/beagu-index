-- Stage38: fictional referral funnel regression, isolated Supabase ycwuugggqbunlbwuzvbx.
-- NEVER run against production snvzwrexuqavnfvzgxqj.
-- All visitor IDs, hashes, short codes are invented test fixtures.
-- The complete transaction ROLLBACK removes every test row.
BEGIN;
DO $preflight$
BEGIN
 IF (SELECT count(*) FROM beagu_private.challenge_identity_codes) <> 0
    OR (SELECT count(*) FROM beagu_private.challenge_referral_profiles) <> 0
    OR (SELECT count(*) FROM beagu_private.challenge_referral_events) <> 0
    OR (SELECT count(*) FROM beagu_private.challenge_referral_funnel_events) <> 0
 THEN RAISE EXCEPTION 'Staging referral tables nonempty; refuse synthetic empty-baseline test'; END IF;
 IF has_table_privilege('anon','beagu_private.challenge_referral_funnel_events','SELECT')
    OR has_table_privilege('authenticated','beagu_private.challenge_referral_events','SELECT')
    OR has_function_privilege('anon','public.beagu_admin_referral_funnel_v1(text)','EXECUTE')
    OR has_function_privilege('authenticated','public.beagu_admin_referral_funnel_v1(text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.beagu_admin_referral_funnel_v1(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Referral funnel access boundary violated'; END IF;
END $preflight$;
INSERT INTO beagu_private.challenge_identity_codes
  (campaign,visitor_id,participant_no,identity_code)
VALUES ('2026','00000000-0000-4000-8000-000000000038',3801,'STAGE38-FAKE-CODE');
INSERT INTO beagu_private.challenge_referral_profiles
  (campaign,visitor_id,identity_code_sha256,referral_token_sha256,
   access_level,valid_referrals,short_code)
VALUES ('2026','00000000-0000-4000-8000-000000000038',
  repeat('a',64),repeat('b',64),2,1,'STAGE038');

SET LOCAL ROLE service_role;
DO $record$
BEGIN
 IF public.beagu_referral_funnel_record_v1(repeat('b',64),repeat('c',64),'open') IS DISTINCT FROM true
   OR public.beagu_referral_funnel_record_v1(repeat('b',64),repeat('d',64),'open') IS DISTINCT FROM true
   OR public.beagu_referral_funnel_record_v1(repeat('b',64),repeat('c',64),'proof') IS DISTINCT FROM true
   OR public.beagu_referral_funnel_record_v1(repeat('b',64),repeat('d',64),'handoff') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Synthetic funnel stage recorder failed'; END IF;
 IF public.beagu_referral_funnel_record_v1(repeat('b',64),repeat('c',64),'open') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Valid duplicate retry should be accepted idempotently'; END IF;
 IF public.beagu_referral_funnel_record_v1(repeat('e',64),repeat('c',64),'open') IS DISTINCT FROM false
    OR public.beagu_referral_funnel_record_v1(repeat('b',64),repeat('c',64),'invalid') IS DISTINCT FROM false
    OR public.beagu_referral_funnel_record_v1('broken',repeat('c',64),'open') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Invalid or unregistered referral hash accepted'; END IF;
END $record$;
RESET ROLE;

INSERT INTO beagu_private.challenge_referral_events
  (event_sha256,campaign,referral_token_sha256,respondent_sha256,
   referrer_visitor_id,decision)
VALUES
 (repeat('f',64),'2026',repeat('b',64),repeat('1',64),
  '00000000-0000-4000-8000-000000000038','credited'),
 (repeat('e',64),'2026',repeat('b',64),repeat('2',64),
  '00000000-0000-4000-8000-000000000038','rejected_quality');

DO $aggregation$
DECLARE result jsonb; r jsonb; all_data jsonb;
BEGIN
 result:=public.beagu_admin_referral_funnel_v1('7d');
 IF jsonb_array_length(result->'rows')<>1
 THEN RAISE EXCEPTION 'Expected exactly one fictional referral, got %', result; END IF;
 r:=result->'rows'->0;
 IF r->>'code' <> 'STAGE038'
    OR (r->>'opened')::int<>2
    OR (r->>'proof_issued')::int<>1
    OR (r->>'handoffs')::int<>1
    OR (r->>'credited')::int<>1
    OR (r->>'form_events')::int<>2
    OR (r->>'lifetime_valid')::int<>1
    OR (r->>'level')::int<>2
 THEN RAISE EXCEPTION 'Unexpected referral funnel aggregation: %',r; END IF;
 IF (SELECT count(*) FROM beagu_private.challenge_referral_funnel_events)<>4
 THEN RAISE EXCEPTION 'Idempotent stage event deduplication failed'; END IF;
 IF result::text LIKE '%'||repeat('b',64)||'%'
    OR result::text LIKE '%'||repeat('c',64)||'%'
    OR result::text LIKE '%00000000-0000-4000%'
 THEN RAISE EXCEPTION 'Hashed source or visitor ID leaked in admin summary'; END IF;
 all_data:=public.beagu_admin_referral_funnel_v1('all');
 IF (all_data->>'max_tracking_days')::int<>30
    OR jsonb_array_length(all_data->'rows')<>1
 THEN RAISE EXCEPTION 'All-time 30-day privacy window contract broken'; END IF;
 BEGIN
   PERFORM public.beagu_admin_referral_funnel_v1('invalid-window');
   RAISE EXCEPTION 'Invalid reporting period accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
END $aggregation$;

UPDATE beagu_private.challenge_referral_profiles SET disabled=true
  WHERE campaign='2026' AND visitor_id='00000000-0000-4000-8000-000000000038';
SET LOCAL ROLE service_role;
DO $disabled$
BEGIN
 IF public.beagu_referral_funnel_record_v1(repeat('b',64),repeat('c',64),'handoff') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Disabled referral unexpectedly allowed a new event'; END IF;
END $disabled$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $anonymous$
BEGIN
 BEGIN
  PERFORM public.beagu_admin_referral_funnel_v1('7d');
  RAISE EXCEPTION 'Anonymous caller accessed service-only referral summary';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.beagu_referral_funnel_record_v1(repeat('b',64),repeat('c',64),'open');
  RAISE EXCEPTION 'Anonymous caller executed private referral recorder';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $anonymous$;
RESET ROLE;
ROLLBACK;
-- PASS: no exceptions and all synthetic rows removed.
