-- QA-only transactional regression; all generated visitor identities rollback.
BEGIN;
DO $test$
DECLARE
  v_one jsonb;
  v_repeat jsonb;
  visitor CONSTANT uuid := 'c0000000-0000-4000-8000-000000000001';
  other CONSTANT uuid := 'c0000000-0000-4000-8000-000000000002';
  token CONSTANT text := repeat('1',64);
  device CONSTANT text := repeat('a',64);
  declined boolean;
BEGIN
  IF (select count(*) from public.beagu_level_sessions)<>0
    OR (select count(*) from beagu_private.participants)<>0
    OR (select count(*) from beagu_private.challenge_identity_codes)<>0
    OR (select count(*) from beagu_private.challenge_device_claims)<>0
  THEN RAISE EXCEPTION 'ABORT nonempty staging identities'; END IF;
  INSERT INTO public.beagu_level_sessions
    (token_sha256,access_level,expires_at)
  VALUES(token,1,now()+interval '1 hour');
  SELECT public.beagu_stage_issue_challenge_bound(token,visitor,device,NULL) INTO v_one;
  IF (v_one->>'identity_code') !~ '^[A-HJ-NP-Z2-9]{10}$'
    OR (v_one->>'participant_no')::bigint <> 1
  THEN RAISE EXCEPTION 'Invalid issued challenge payload %',v_one; END IF;
  SELECT public.beagu_stage_issue_challenge_bound(token,visitor,device,NULL) INTO v_repeat;
  IF v_repeat <> v_one THEN RAISE EXCEPTION 'Idempotent reissue failed'; END IF;
  IF (select identity_visitor_id from public.beagu_level_sessions
      where token_sha256=token) <> visitor
  THEN RAISE EXCEPTION 'Session not bound'; END IF;
  declined:=false;
  BEGIN
    PERFORM public.beagu_stage_issue_challenge_bound(token,other,device,NULL);
  EXCEPTION WHEN SQLSTATE '28000' THEN declined:=true;
  END;
  IF NOT declined THEN RAISE EXCEPTION 'Different visitor was allowed on same session'; END IF;
  declined:=false;
  BEGIN
    PERFORM public.beagu_stage_issue_challenge_bound(token,visitor,repeat('b',64),NULL);
  EXCEPTION WHEN SQLSTATE '28000' THEN declined:=true;
  END;
  IF NOT declined THEN RAISE EXCEPTION 'Wrong device recovered code'; END IF;
  declined:=false;
  BEGIN
    PERFORM public.beagu_stage_issue_challenge_bound(repeat('2',64),visitor,device,NULL);
  EXCEPTION WHEN SQLSTATE '28000' THEN declined:=true;
  END;
  IF NOT declined THEN RAISE EXCEPTION 'Invalid session issued code'; END IF;
  IF (select count(*) from beagu_private.participants)<>1
      OR (select count(*) from beagu_private.challenge_identity_codes)<>1
      OR (select count(*) from beagu_private.challenge_device_claims)<>1
  THEN RAISE EXCEPTION 'Unexpected duplicate identity'; END IF;
  RAISE NOTICE 'PASS atomic Lv1+device-bound issue, idempotence, cross-visitor and cross-device denials';
END;
$test$;
ROLLBACK;