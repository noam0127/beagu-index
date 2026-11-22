-- v1.1.0 stage 35: isolated test Supabase only, read-only role boundary checks.
-- DO NOT deploy this file as a migration or run it on production.
-- Safety condition: stage_private.fake_schools is an isolated test fixture.
DO $$
DECLARE blocked boolean := false; observed bigint := -1;
BEGIN
  IF to_regclass('stage_private.fake_schools') IS NULL THEN
    RAISE EXCEPTION 'STOP: not the isolated staging fixture database';
  END IF;
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE 'SELECT count(*) FROM public.beagu_level_sessions' INTO observed;
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'SECURITY FAILURE: anon role read protected sessions';
  END IF;
  RAISE NOTICE 'PASS: anon role cannot read protected level sessions';
END $$;

DO $$
DECLARE blocked boolean := false; observed bigint := -1;
BEGIN
  IF to_regclass('stage_private.fake_schools') IS NULL THEN
    RAISE EXCEPTION 'STOP: not the isolated staging fixture database';
  END IF;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM public.beagu_level_sessions' INTO observed;
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'SECURITY FAILURE: authenticated role read protected sessions';
  END IF;
  RAISE NOTICE 'PASS: authenticated role cannot read protected level sessions';
END $$;
