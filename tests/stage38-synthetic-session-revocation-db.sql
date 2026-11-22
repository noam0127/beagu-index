-- STAGE38 EPHEMERAL FIXTURE ONLY; NO Supabase deployment or real records.
-- PostgreSQL 17.6 disposable GitHub Actions job only. Not a migration.
-- Production/staging credentials, actual token digests, codes and PII absent.
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'postgres'
     OR current_setting('app.stage38_fixture_only',true) IS DISTINCT FROM 'ephemeral-ci'
     OR to_regclass('stage_private.fake_schools') IS NULL
     OR to_regclass('stage_private.members') IS NULL
     OR to_regclass('public.beagu_level_sessions') IS NULL
     OR to_regclass('public.beagu_level_codes') IS NULL
     OR to_regclass('public.beagu_site_release_state_v1') IS NOT NULL
     OR to_regclass('beagu_private.challenge_identity_codes') IS NOT NULL
     OR to_regnamespace('stage38_session_fixture') IS NOT NULL
  THEN RAISE EXCEPTION 'STAGE38_EPHEMERAL_SESSION_ONLY';
  END IF;
END;
$guard$;

CREATE SCHEMA stage38_session_fixture;
CREATE TABLE stage38_session_fixture.enrollments (
  campaign text NOT NULL CHECK (campaign='2026'),
  lookup_key_id text NOT NULL,
  code_lookup_digest text NOT NULL CHECK (code_lookup_digest ~ '^[a-f0-9]{64}$'),
  access_level smallint NOT NULL CHECK (access_level IN (1,2)),
  proof_state text NOT NULL CHECK (proof_state IN ('claimed','issued')),
  evidence_origin text NOT NULL,
  owner_binding_state text NOT NULL,
  active boolean NOT NULL,
  revoked_at timestamptz,
  visitor_id uuid,
  earned_lv2_now boolean NOT NULL DEFAULT false,
  PRIMARY KEY (campaign,lookup_key_id,code_lookup_digest)
);
CREATE TABLE stage38_session_fixture.sessions (
  token_sha256 text PRIMARY KEY CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  campaign text NOT NULL CHECK (campaign='2026'),
  lookup_key_id text NOT NULL,
  code_lookup_digest text NOT NULL CHECK (code_lookup_digest ~ '^[a-f0-9]{64}$'),
  access_level smallint NOT NULL CHECK (access_level IN (1,2)),
  visitor_id uuid,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at>created_at)
);

ALTER TABLE stage38_session_fixture.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage38_session_fixture.sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA stage38_session_fixture FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA stage38_session_fixture FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA stage38_session_fixture TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA stage38_session_fixture TO service_role;

-- Stable SECURITY INVOKER query: no session issuance and no state changes.
-- In production, a trusted Edge backend must hash a strongly random bearer
-- token and invoke this check with its server identity (NOT raw browser fields).
-- A current private enrollment revocation/level decline is authoritative.
CREATE FUNCTION stage38_session_fixture.protected_tier(
  p_token_sha256 text
) RETURNS smallint
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $tier$
  SELECT COALESCE((
    SELECT CASE
      WHEN s.campaign<>'2026' OR e.campaign<>'2026'
        OR s.created_at>now() OR s.expires_at<=now()
        OR s.expires_at-s.created_at>interval '6 hours'
        OR e.active IS DISTINCT FROM true OR e.revoked_at IS NOT NULL
        OR e.proof_state<>'claimed'
        OR e.evidence_origin<>'official-signed-form'
        OR e.owner_binding_state<>'verified'
        OR s.access_level>e.access_level
        THEN 0
      WHEN s.access_level=1 THEN 1
      WHEN s.access_level=2 AND e.earned_lv2_now IS TRUE
        AND s.visitor_id IS NOT NULL
        AND s.visitor_id=e.visitor_id THEN 2
      ELSE 0
    END
    FROM stage38_session_fixture.sessions s
    JOIN stage38_session_fixture.enrollments e
      ON e.campaign=s.campaign
      AND e.lookup_key_id=s.lookup_key_id
      AND e.code_lookup_digest=s.code_lookup_digest
    WHERE s.token_sha256=p_token_sha256
    LIMIT 1
  ),0)::smallint;
$tier$;
REVOKE ALL ON FUNCTION stage38_session_fixture.protected_tier(text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION stage38_session_fixture.protected_tier(text)
  TO service_role;

DO $rights$
BEGIN
  IF has_schema_privilege('anon','stage38_session_fixture','USAGE')
     OR has_schema_privilege('authenticated','stage38_session_fixture','USAGE')
     OR has_table_privilege('anon','stage38_session_fixture.sessions','SELECT')
     OR has_table_privilege('authenticated','stage38_session_fixture.enrollments','SELECT')
     OR has_function_privilege('anon','stage38_session_fixture.protected_tier(text)','EXECUTE')
     OR has_function_privilege('authenticated','stage38_session_fixture.protected_tier(text)','EXECUTE')
     OR NOT has_function_privilege('service_role','stage38_session_fixture.protected_tier(text)','EXECUTE')
     OR NOT (SELECT relrowsecurity FROM pg_class
         WHERE oid='stage38_session_fixture.sessions'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class
         WHERE oid='stage38_session_fixture.enrollments'::regclass)
  THEN RAISE EXCEPTION 'STAGE38_SESSION_FIXTURE_UNSAFE_PRIVILEGES';
  END IF;
END;
$rights$;

-- All IDs below are artificial. SHA digest values never represent real users.
INSERT INTO stage38_session_fixture.enrollments (
  campaign,lookup_key_id,code_lookup_digest,access_level,
  proof_state,evidence_origin,owner_binding_state,active,
  revoked_at,visitor_id,earned_lv2_now
) VALUES
('2026','testkey',repeat('a',64),1,
 'claimed','official-signed-form','verified',true,
 NULL,NULL,false),
('2026','testkey',repeat('b',64),2,
 'claimed','official-signed-form','verified',true,
 NULL,'00000000-0000-4000-8000-000000000003',true),
('2026','testkey',repeat('c',64),1,
 'issued','official-signed-form','verified',true,
 NULL,NULL,false);

INSERT INTO stage38_session_fixture.sessions (
  token_sha256,campaign,lookup_key_id,code_lookup_digest,access_level,
  visitor_id,created_at,expires_at
) VALUES
(repeat('1',64),'2026','testkey',repeat('a',64),1,
 NULL,now()-interval '1 minute',now()+interval '5 hours'),
(repeat('2',64),'2026','testkey',repeat('b',64),2,
 '00000000-0000-4000-8000-000000000003',
 now()-interval '1 minute',now()+interval '5 hours'),
(repeat('3',64),'2026','testkey',repeat('c',64),1,
 NULL,now()-interval '1 minute',now()+interval '5 hours'),
(repeat('4',64),'2026','wrongkey',repeat('a',64),1,
 NULL,now()-interval '1 minute',now()+interval '5 hours'),
(repeat('5',64),'2026','testkey',repeat('a',64),1,
 NULL,now()-interval '7 hours',now()-interval '1 hour');

COMMIT;

-- Emulate multiple authenticated HTTP reads via service_role, with new
-- connections/requests observing the current enrollment on EVERY call.
SET ROLE service_role;
DO $initial$
BEGIN
  IF stage38_session_fixture.protected_tier(repeat('1',64))<>1
     OR stage38_session_fixture.protected_tier(repeat('2',64))<>2
     OR stage38_session_fixture.protected_tier(repeat('3',64))<>0
     OR stage38_session_fixture.protected_tier(repeat('4',64))<>0
     OR stage38_session_fixture.protected_tier(repeat('5',64))<>0
     OR stage38_session_fixture.protected_tier(repeat('f',64))<>0
     OR stage38_session_fixture.protected_tier('INVALID')<>0
     OR stage38_session_fixture.protected_tier(NULL)<>0
  THEN RAISE EXCEPTION 'STAGE38_SESSION_INITIAL_AUTH_CHECK_FAILED';
  END IF;
END;
$initial$;
RESET ROLE;

-- Privileged fixture authority revokes a previously issued code while the
-- 6-hour bearer token still exists. The NEXT access must deny, not wait 6h.
UPDATE stage38_session_fixture.enrollments SET active=false,revoked_at=now()
WHERE code_lookup_digest=repeat('a',64);
SET ROLE service_role;
DO $revoked$
BEGIN
  IF stage38_session_fixture.protected_tier(repeat('1',64))<>0
  THEN RAISE EXCEPTION 'STAGE38_SESSION_REVOKED_CODE_STILL_VALID';
  END IF;
END;
$revoked$;
RESET ROLE;

-- Separate Lv2 profile disable must revoke the existing Lv2 bearer.
UPDATE stage38_session_fixture.enrollments SET earned_lv2_now=false
WHERE code_lookup_digest=repeat('b',64);
SET ROLE service_role;
DO $unearned$
BEGIN
  IF stage38_session_fixture.protected_tier(repeat('2',64))<>0
  THEN RAISE EXCEPTION 'STAGE38_SESSION_UNEARNED_LV2_STILL_VALID';
  END IF;
END;
$unearned$;
RESET ROLE;

-- A code downgraded to Lv1 may not use an old Lv2 token.
UPDATE stage38_session_fixture.enrollments
SET earned_lv2_now=true,access_level=1
WHERE code_lookup_digest=repeat('b',64);
SET ROLE service_role;
DO $downgraded$
BEGIN
  IF stage38_session_fixture.protected_tier(repeat('2',64))<>0
  THEN RAISE EXCEPTION 'STAGE38_SESSION_DOWNGRADED_LV2_STILL_VALID';
  END IF;
END;
$downgraded$;
RESET ROLE;

-- Simulated function is READ-ONLY: all records still exist (no implicit
-- logout/disconnect) but authorization drops immediately.
DO $stable$
BEGIN
  IF (SELECT COUNT(*) FROM stage38_session_fixture.sessions)<>5
     OR (SELECT COUNT(*) FROM stage38_session_fixture.enrollments)<>3
  THEN RAISE EXCEPTION 'STAGE38_SESSION_CHECK_MUTATED_STATE';
  END IF;
END;
$stable$;
SELECT 'PASS: isolated PG17 session-to-enrollment checks block revoked code, withdrawn referral and downgraded tier on next request' AS result;
