-- DISPOSABLE POSTGRESQL CI FIXTURE ONLY. This is NOT a Supabase migration.
-- Nothing in this file may run against a real user or staging database.
-- All code/token strings below are fixtures, never production credentials.
-- The following marker is supplied only within the disposable local CI session.
-- This is defense-in-depth against accidentally executing this fixture on
-- any real Supabase database. A custom setting is not cryptographic identity.
DO $fixture_only_guard$
BEGIN
  IF current_setting('app.stage38_fixture_only',true)
       IS DISTINCT FROM 'ephemeral-ci'
     OR current_database() <> 'postgres'
     OR to_regclass('stage_private.fake_schools') IS NULL
     OR to_regclass('stage_private.members') IS NULL
     OR to_regclass('public.beagu_site_release_state_v1') IS NOT NULL
     OR to_regclass('beagu_private.challenge_identity_codes') IS NOT NULL
     OR to_regclass('public.beagu_level_codes') IS NULL
     OR to_regclass('public.beagu_level_sessions') IS NULL
  THEN
    RAISE EXCEPTION 'STAGE38_EPHEMERAL_PG_FIXTURE_ONLY';
  END IF;
  IF EXISTS (SELECT 1 FROM public.beagu_level_codes)
     OR EXISTS (SELECT 1 FROM public.beagu_level_sessions)
  THEN
    RAISE EXCEPTION 'STAGE38_FIXTURE_MUST_START_EMPTY';
  END IF;
END;
$fixture_only_guard$;

DO $fixture$
DECLARE
  duplicate_blocked boolean := false;
  invalid_level_blocked boolean := false;
  bad_hash_blocked boolean := false;
BEGIN
  INSERT INTO public.beagu_level_codes(name, access_level, code_sha256, active)
  VALUES
    ('STAGE38_FIXTURE_LV1_ONLY',1,
      encode(sha256(convert_to('stage38-ephemeral-lv1-only','UTF8')),'hex'),true),
    ('STAGE38_FIXTURE_LV2_ONLY',2,
      encode(sha256(convert_to('stage38-ephemeral-lv2-only','UTF8')),'hex'),true);

  BEGIN
    INSERT INTO public.beagu_level_codes(name,access_level,code_sha256)
    VALUES ('STAGE38_FIXTURE_DUPLICATE',1,
      encode(sha256(convert_to('stage38-ephemeral-lv1-only','UTF8')),'hex'));
  EXCEPTION WHEN unique_violation THEN duplicate_blocked := true;
  END;
  IF NOT duplicate_blocked THEN
    RAISE EXCEPTION 'Duplicate participation code was accepted';
  END IF;

  BEGIN
    INSERT INTO public.beagu_level_codes(name,access_level,code_sha256)
    VALUES ('STAGE38_FIXTURE_INVALID_LEVEL',3,
      encode(sha256(convert_to('stage38-ephemeral-invalid-level','UTF8')),'hex'));
  EXCEPTION WHEN check_violation THEN invalid_level_blocked := true;
  END;
  IF NOT invalid_level_blocked THEN
    RAISE EXCEPTION 'Invalid access level was accepted';
  END IF;

  BEGIN
    INSERT INTO public.beagu_level_codes(name,access_level,code_sha256)
    VALUES ('STAGE38_FIXTURE_PLAINTEXT',1,'NOT_A_SHA256_HASH');
  EXCEPTION WHEN check_violation THEN bad_hash_blocked := true;
  END;
  IF NOT bad_hash_blocked THEN
    RAISE EXCEPTION 'Plaintext participation code was accepted';
  END IF;
END;
$fixture$;

SET ROLE service_role;
DO $check_login$
DECLARE
  got_level smallint;
  got_count integer;
BEGIN
  SELECT access_level INTO got_level
  FROM public.beagu_level_codes
  WHERE active=true AND code_sha256=
    encode(sha256(convert_to('stage38-ephemeral-lv1-only','UTF8')),'hex');
  IF got_level IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Synthetic Lv1 credential could not be resolved';
  END IF;

  SELECT access_level INTO got_level
  FROM public.beagu_level_codes
  WHERE active=true AND code_sha256=
    encode(sha256(convert_to('stage38-ephemeral-lv2-only','UTF8')),'hex');
  IF got_level IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Synthetic Lv2 credential could not be resolved';
  END IF;

  SELECT count(*) INTO got_count FROM public.beagu_level_codes
  WHERE active=true AND code_sha256=
    encode(sha256(convert_to('stage38-ephemeral-wrong-code','UTF8')),'hex');
  IF got_count<>0 THEN
    RAISE EXCEPTION 'Unknown synthetic credential was resolved';
  END IF;

  INSERT INTO public.beagu_level_sessions(
    token_sha256,access_level,created_at,expires_at)
  VALUES
   (encode(sha256(convert_to('stage38-ephemeral-valid-session','UTF8')),'hex'),
     1,now()-interval '1 minute',now()+interval '1 hour'),
   (encode(sha256(convert_to('stage38-ephemeral-expired-session','UTF8')),'hex'),
     2,now()-interval '2 hours',now()-interval '1 hour');

  SELECT count(*) INTO got_count
  FROM public.beagu_level_sessions
  WHERE token_sha256=
    encode(sha256(convert_to('stage38-ephemeral-valid-session','UTF8')),'hex')
    AND expires_at>now();
  IF got_count<>1 THEN
    RAISE EXCEPTION 'Unexpired synthetic session rejected';
  END IF;

  SELECT count(*) INTO got_count
  FROM public.beagu_level_sessions
  WHERE token_sha256=
    encode(sha256(convert_to('stage38-ephemeral-expired-session','UTF8')),'hex')
    AND expires_at>now();
  IF got_count<>0 THEN
    RAISE EXCEPTION 'Expired synthetic session was accepted';
  END IF;
END;
$check_login$;
RESET ROLE;

DO $check_revocation$
DECLARE
  got_count integer;
  duplicate_token_blocked boolean:=false;
BEGIN
  UPDATE public.beagu_level_codes SET active=false
  WHERE name='STAGE38_FIXTURE_LV1_ONLY';
  SELECT count(*) INTO got_count FROM public.beagu_level_codes
  WHERE active=true AND code_sha256=
    encode(sha256(convert_to('stage38-ephemeral-lv1-only','UTF8')),'hex');
  IF got_count<>0 THEN
    RAISE EXCEPTION 'Inactive synthetic participation code still resolves';
  END IF;

  BEGIN
    INSERT INTO public.beagu_level_sessions(
      token_sha256,access_level,created_at,expires_at)
    VALUES
     (encode(sha256(convert_to('stage38-ephemeral-valid-session','UTF8')),'hex'),
      2,now(),now()+interval '1 hour');
  EXCEPTION WHEN unique_violation THEN duplicate_token_blocked:=true;
  END;
  IF NOT duplicate_token_blocked THEN
    RAISE EXCEPTION 'Duplicate hashed session token accepted';
  END IF;
END;
$check_revocation$;

DO $check_stored_state$
DECLARE
  all_correct boolean;
BEGIN
  SELECT count(*)=2 AND bool_and(length(code_sha256)=64) INTO all_correct
  FROM public.beagu_level_codes;
  IF NOT all_correct THEN
    RAISE EXCEPTION 'Non-hashed or unexpected fixture codes remained';
  END IF;
  IF (SELECT count(*) FROM public.beagu_level_sessions) <> 2 THEN
    RAISE EXCEPTION 'Synthetic session insertion count incorrect';
  END IF;
END;
$check_stored_state$;

SELECT 'PASS: fixture-only hashed Lv1/Lv2 codes, invalid/duplicate/revoked codes, session expiration and duplicate token' AS assertion;
