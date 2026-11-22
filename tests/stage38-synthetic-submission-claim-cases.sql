-- EPHEMERAL PostgreSQL 17 fixture ONLY. NOT a Supabase migration or grant.
-- Demonstrates atomic, one-time submission claims against a synthetic ledger.
-- Never contains actual Form IDs, identity codes, survey responses, or PII.
BEGIN;
DO $fixture_only_guard$
BEGIN
  IF current_setting('app.stage38_fixture_only',true) IS DISTINCT FROM 'ephemeral-ci'
     OR current_database() <> 'postgres'
     OR to_regclass('stage_private.fake_schools') IS NULL
     OR to_regclass('stage_private.members') IS NULL
     OR to_regclass('public.beagu_level_codes') IS NULL
     OR to_regclass('public.beagu_level_sessions') IS NULL
     OR to_regclass('public.beagu_site_release_state_v1') IS NOT NULL
     OR to_regclass('beagu_private.challenge_identity_codes') IS NOT NULL
     OR to_regnamespace('stage38_claim_fixture') IS NOT NULL
  THEN RAISE EXCEPTION 'STAGE38_EPHEMERAL_CLAIM_ONLY';
  END IF;
END;
$fixture_only_guard$;

CREATE SCHEMA stage38_claim_fixture;
CREATE TABLE stage38_claim_fixture.submission_claims (
  event_digest text PRIMARY KEY CHECK (event_digest ~ '^[a-f0-9]{64}$'),
  code_digest text NOT NULL UNIQUE CHECK (code_digest ~ '^[a-f0-9]{64}$'),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_digest <> code_digest)
);
ALTER TABLE stage38_claim_fixture.submission_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA stage38_claim_fixture FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE stage38_claim_fixture.submission_claims FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA stage38_claim_fixture TO service_role;
GRANT SELECT, INSERT ON TABLE stage38_claim_fixture.submission_claims TO service_role;

-- MUST be called only AFTER the trusted Form MAC, issued-code ownership,
-- and quality/privacy policy were validated separately by the service layer.
-- This fixture returns a boolean CLAIMED(once)/DENIED(replay or conflict).
-- It intentionally does NOT create login sessions or authorize any tier.
CREATE FUNCTION stage38_claim_fixture.try_claim(
  p_event_digest text, p_code_digest text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path TO ''
AS $claim$
DECLARE
  inserted_digest text;
BEGIN
  IF p_event_digest IS NULL OR p_code_digest IS NULL
     OR p_event_digest !~ '^[a-f0-9]{64}$'
     OR p_code_digest !~ '^[a-f0-9]{64}$'
     OR p_event_digest = p_code_digest
  THEN RETURN false;
  END IF;
  -- The two UNIQUE constraints enforce atomicity even across transactions:
  -- same event for another code and same code for another event both fail.
  INSERT INTO stage38_claim_fixture.submission_claims(event_digest,code_digest)
  VALUES(p_event_digest,p_code_digest)
  ON CONFLICT DO NOTHING
  RETURNING event_digest INTO inserted_digest;
  RETURN inserted_digest IS NOT NULL;
END;
$claim$;

REVOKE ALL ON FUNCTION stage38_claim_fixture.try_claim(text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stage38_claim_fixture.try_claim(text,text)
  TO service_role;

-- Private read-only membership lookup for subsequent login checks.
-- Does not verify possession, mint sessions, or read official Form responses.
-- SHA digests in this disposable test must never replace production HMAC.
CREATE FUNCTION stage38_claim_fixture.has_active_enrollment(
  p_code_digest text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $resume$
  SELECT CASE WHEN p_code_digest ~ '^[a-f0-9]{64}BEGIN
  IF has_schema_privilege('anon','stage38_claim_fixture','USAGE')
     OR has_schema_privilege('authenticated','stage38_claim_fixture','USAGE')
     OR has_table_privilege('anon','stage38_claim_fixture.submission_claims','SELECT')
     OR has_table_privilege('authenticated','stage38_claim_fixture.submission_claims','INSERT')
     OR has_function_privilege('anon','stage38_claim_fixture.try_claim(text,text)','EXECUTE')
     OR has_function_privilege('authenticated','stage38_claim_fixture.try_claim(text,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','stage38_claim_fixture.try_claim(text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'STAGE38_CLAIM_LEDGER_PRIVILEGES_UNSAFE';
  END IF;
END;
$access_guard$;
COMMIT;

SET ROLE service_role;
DO $cases$
DECLARE
  event_a text:=encode(sha256(convert_to('ST38-synthetic-event-a','UTF8')),'hex');
  event_b text:=encode(sha256(convert_to('ST38-synthetic-event-b','UTF8')),'hex');
  event_c text:=encode(sha256(convert_to('ST38-synthetic-event-c','UTF8')),'hex');
  code_a text:=encode(sha256(convert_to('ST38-synthetic-code-a','UTF8')),'hex');
  code_b text:=encode(sha256(convert_to('ST38-synthetic-code-b','UTF8')),'hex');
BEGIN
  IF stage38_claim_fixture.try_claim(event_a,code_a) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'first legitimate submission claim failed';
  END IF;
  IF stage38_claim_fixture.try_claim(event_a,code_a) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'replay of same Form response was accepted';
  END IF;
  IF stage38_claim_fixture.try_claim(event_a,code_b) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'same Form response was attributed to a second code';
  END IF;
  IF stage38_claim_fixture.try_claim(event_b,code_a) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'one code accepted two Form responses';
  END IF;
  IF stage38_claim_fixture.try_claim(event_b,code_b) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'independent Form response was rejected';
  END IF;
  IF stage38_claim_fixture.try_claim(event_c,'NOT_A_HASH') IS DISTINCT FROM false
     OR stage38_claim_fixture.try_claim('BAD',code_b) IS DISTINCT FROM false
     OR stage38_claim_fixture.try_claim(NULL,code_b) IS DISTINCT FROM false
     OR stage38_claim_fixture.try_claim(event_c,NULL) IS DISTINCT FROM false
     OR stage38_claim_fixture.try_claim(event_c,event_c) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'malformed digest passed the claim gate';
  END IF;
  IF (SELECT COUNT(*) FROM stage38_claim_fixture.submission_claims) <> 2
  THEN RAISE EXCEPTION 'replays or invalid claims modified the ledger';
  END IF;
END;
$cases$;
RESET ROLE;

SELECT 'PASS: atomic synthetic one-time claim / replay / cross-code / malformed reject' AS result;
 THEN EXISTS (
    SELECT 1 FROM stage38_claim_fixture.submission_claims c
    JOIN public.beagu_level_codes issued ON issued.code_sha256=c.code_digest
    WHERE c.code_digest=p_code_digest
      AND issued.active IS TRUE
      AND issued.access_level>=1
  ) ELSE false END;
$resume$;
REVOKE ALL ON FUNCTION stage38_claim_fixture.has_active_enrollment(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stage38_claim_fixture.has_active_enrollment(text)
  TO service_role;

DO $access_guard$
BEGIN
  IF has_schema_privilege('anon','stage38_claim_fixture','USAGE')
     OR has_schema_privilege('authenticated','stage38_claim_fixture','USAGE')
     OR has_table_privilege('anon','stage38_claim_fixture.submission_claims','SELECT')
     OR has_table_privilege('authenticated','stage38_claim_fixture.submission_claims','INSERT')
     OR has_function_privilege('anon','stage38_claim_fixture.try_claim(text,text)','EXECUTE')
     OR has_function_privilege('authenticated','stage38_claim_fixture.try_claim(text,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','stage38_claim_fixture.try_claim(text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'STAGE38_CLAIM_LEDGER_PRIVILEGES_UNSAFE';
  END IF;
END;
$access_guard$;
COMMIT;

SET ROLE service_role;
DO $cases$
DECLARE
  event_a text:=encode(sha256(convert_to('ST38-synthetic-event-a','UTF8')),'hex');
  event_b text:=encode(sha256(convert_to('ST38-synthetic-event-b','UTF8')),'hex');
  event_c text:=encode(sha256(convert_to('ST38-synthetic-event-c','UTF8')),'hex');
  code_a text:=encode(sha256(convert_to('ST38-synthetic-code-a','UTF8')),'hex');
  code_b text:=encode(sha256(convert_to('ST38-synthetic-code-b','UTF8')),'hex');
BEGIN
  IF stage38_claim_fixture.try_claim(event_a,code_a) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'first legitimate submission claim failed';
  END IF;
  IF stage38_claim_fixture.try_claim(event_a,code_a) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'replay of same Form response was accepted';
  END IF;
  IF stage38_claim_fixture.try_claim(event_a,code_b) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'same Form response was attributed to a second code';
  END IF;
  IF stage38_claim_fixture.try_claim(event_b,code_a) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'one code accepted two Form responses';
  END IF;
  IF stage38_claim_fixture.try_claim(event_b,code_b) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'independent Form response was rejected';
  END IF;
  IF stage38_claim_fixture.try_claim(event_c,'NOT_A_HASH') IS DISTINCT FROM false
     OR stage38_claim_fixture.try_claim('BAD',code_b) IS DISTINCT FROM false
     OR stage38_claim_fixture.try_claim(NULL,code_b) IS DISTINCT FROM false
     OR stage38_claim_fixture.try_claim(event_c,NULL) IS DISTINCT FROM false
     OR stage38_claim_fixture.try_claim(event_c,event_c) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'malformed digest passed the claim gate';
  END IF;
  IF (SELECT COUNT(*) FROM stage38_claim_fixture.submission_claims) <> 2
  THEN RAISE EXCEPTION 'replays or invalid claims modified the ledger';
  END IF;
END;
$cases$;
RESET ROLE;

SELECT 'PASS: atomic synthetic one-time claim / replay / cross-code / malformed reject' AS result;
