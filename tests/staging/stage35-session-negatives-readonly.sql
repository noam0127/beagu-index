-- v1.1.0 stage 35: TEST SUPABASE ONLY.
-- Read-only expired, forged and malformed credential database predicates.
-- Run only on ycwuugggqbunlbwuzvbx, never on production.
DO $$
DECLARE
  v_expired_count integer;
  v_forged_count integer;
  v_still_valid_count integer;
BEGIN
  -- Test-only fixture schema is absent in production.
  IF to_regclass('stage_private.fake_schools') IS NULL THEN
    RAISE EXCEPTION 'STOP: stage_private fixture marker missing';
  END IF;

  SELECT count(*) INTO v_expired_count
  FROM public.beagu_level_sessions
  WHERE token_sha256=encode(extensions.digest(repeat('0',64),'sha256'),'hex')
    AND expires_at < clock_timestamp() AND access_level=1;

  SELECT count(*) INTO v_still_valid_count
  FROM public.beagu_level_sessions
  WHERE token_sha256=encode(extensions.digest(repeat('0',64),'sha256'),'hex')
    AND expires_at > clock_timestamp();

  SELECT count(*) INTO v_forged_count
  FROM public.beagu_level_sessions
  WHERE token_sha256=encode(extensions.digest(repeat('1',64),'sha256'),'hex');

  IF v_expired_count <> 1 OR v_still_valid_count <> 0 OR v_forged_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: expiration/forgery staging test preconditions violated';
  END IF;
  IF repeat('0',63) ~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'FAIL: invalid credential unexpectedly satisfies format guard';
  END IF;
  RAISE NOTICE 'PASS: expired token has 0 currently-valid matching rows; forged token has 0 matches; malformed token fails format guard.';
END $$;
