-- SYNTHETIC ONLY: GitHub Actions ephemeral PostgreSQL `postgres` fixture.
-- NEVER deploy on a Supabase project. NOT a migration and NOT real survey proof.
-- This proves the desired Lv1/Lv2 decision only for fake, locally linked proof.
-- Production currently lacks a verified 2026 submission-to-visitor identity
-- attestation: issuing an identity code or joining the challenge is NOT proof.

DO $guard$
BEGIN
  IF current_database() <> 'postgres'
     OR current_setting('app.stage38_fixture_only',true)
        IS DISTINCT FROM 'ephemeral-ci'
     OR to_regclass('stage_private.fake_schools') IS NULL
     OR to_regclass('stage_private.members') IS NULL
     OR to_regclass('public.beagu_login_budget') IS NULL
     OR to_regclass('public.beagu_site_release_state_v1') IS NOT NULL
     OR to_regclass('beagu_private.challenge_identity_codes') IS NOT NULL
     OR to_regnamespace('stage38_referral_fixture') IS NOT NULL
  THEN
    RAISE EXCEPTION 'STAGE38_SYNTHETIC_REFERRAL_EPHEMERAL_ONLY';
  END IF;
END;
$guard$;

CREATE SCHEMA stage38_referral_fixture;
CREATE TABLE stage38_referral_fixture.issued_codes (
  campaign text NOT NULL,
  visitor_id uuid NOT NULL,
  identity_code text NOT NULL,
  PRIMARY KEY (campaign,visitor_id),
  UNIQUE(campaign,identity_code)
);
CREATE TABLE stage38_referral_fixture.verified_submissions (
  campaign text NOT NULL,
  visitor_id uuid NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  PRIMARY KEY(campaign,visitor_id)
);
CREATE TABLE stage38_referral_fixture.referral_profiles (
  campaign text NOT NULL,
  visitor_id uuid NOT NULL,
  identity_code_sha256 text NOT NULL CHECK (identity_code_sha256 ~ '^[a-f0-9]{64}$'),
  access_level smallint NOT NULL CHECK (access_level IN (1,2)),
  valid_referrals integer NOT NULL CHECK (valid_referrals >= 0),
  upgraded_at timestamptz,
  disabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY(campaign,visitor_id)
);
ALTER TABLE stage38_referral_fixture.issued_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage38_referral_fixture.verified_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage38_referral_fixture.referral_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA stage38_referral_fixture FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA stage38_referral_fixture FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA stage38_referral_fixture TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA stage38_referral_fixture TO service_role;

-- This is a fixture-only decision function, NOT a deployed API or production RPC.
-- Proof comes from a synthetic verified_submissions table; no real-world
-- implementation of that attestation exists yet, so do not reuse in production.
CREATE FUNCTION stage38_referral_fixture.level_for_code(p_code text)
RETURNS smallint LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $logic$
  SELECT CASE
    WHEN v.verified IS DISTINCT FROM true THEN 0
    WHEN p.visitor_id IS NOT NULL AND (
      p.disabled IS TRUE OR p.identity_code_sha256 <>
        encode(sha256(convert_to(c.identity_code,'UTF8')),'hex')
    ) THEN 0
    WHEN p.access_level >= 2 AND p.valid_referrals >= 1
         AND p.upgraded_at IS NOT NULL THEN 2
    ELSE 1
  END::smallint
  FROM stage38_referral_fixture.issued_codes c
  LEFT JOIN stage38_referral_fixture.verified_submissions v
    ON v.campaign=c.campaign AND v.visitor_id=c.visitor_id
  LEFT JOIN stage38_referral_fixture.referral_profiles p
    ON p.campaign=c.campaign AND p.visitor_id=c.visitor_id
  WHERE c.campaign='2026' AND c.identity_code=p_code LIMIT 1;
$logic$;
REVOKE ALL ON FUNCTION stage38_referral_fixture.level_for_code(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION stage38_referral_fixture.level_for_code(text)
  TO service_role;

INSERT INTO stage38_referral_fixture.issued_codes(campaign,visitor_id,identity_code)
VALUES
('2026','00000000-0000-4000-8000-000000000001','ST38-ISSUED-NOSURVEY'),
('2026','00000000-0000-4000-8000-000000000002','ST38-VERIFIED-LV1'),
('2026','00000000-0000-4000-8000-000000000003','ST38-VERIFIED-LV2'),
('2026','00000000-0000-4000-8000-000000000004','ST38-REVOKED'),
('2026','00000000-0000-4000-8000-000000000005','ST38-NO-REFERRALS'),
('2026','00000000-0000-4000-8000-000000000006','ST38-NO-UPGRADE'),
('2026','00000000-0000-4000-8000-000000000007','ST38-HASH-MISMATCH'),
('2025','00000000-0000-4000-8000-000000000008','ST38-WRONG-CAMPAIGN');

INSERT INTO stage38_referral_fixture.verified_submissions(campaign,visitor_id,verified)
SELECT campaign,visitor_id,true FROM stage38_referral_fixture.issued_codes
WHERE visitor_id <> '00000000-0000-4000-8000-000000000001'::uuid;

INSERT INTO stage38_referral_fixture.referral_profiles(
  campaign,visitor_id,identity_code_sha256,access_level,valid_referrals,upgraded_at,disabled)
SELECT campaign,visitor_id,
  encode(sha256(convert_to(
    CASE WHEN identity_code='ST38-HASH-MISMATCH' THEN 'WRONG-FAKE-CODE'
         ELSE identity_code END,'UTF8')),'hex'),
  2,
  CASE WHEN identity_code='ST38-NO-REFERRALS' THEN 0 ELSE 1 END,
  CASE WHEN identity_code='ST38-NO-UPGRADE' THEN NULL ELSE now() END,
  identity_code='ST38-REVOKED'
FROM stage38_referral_fixture.issued_codes
WHERE visitor_id IN (
 '00000000-0000-4000-8000-000000000003',
 '00000000-0000-4000-8000-000000000004',
 '00000000-0000-4000-8000-000000000005',
 '00000000-0000-4000-8000-000000000006',
 '00000000-0000-4000-8000-000000000007'
);

DO $security$
BEGIN
  IF has_function_privilege('anon',
       'stage38_referral_fixture.level_for_code(text)','EXECUTE')
     OR has_function_privilege('authenticated',
       'stage38_referral_fixture.level_for_code(text)','EXECUTE')
     OR NOT has_function_privilege('service_role',
       'stage38_referral_fixture.level_for_code(text)','EXECUTE')
     OR has_table_privilege('anon',
       'stage38_referral_fixture.issued_codes','SELECT')
  THEN RAISE EXCEPTION 'Synthetic referral fixture permissions are unsafe';
  END IF;
END;
$security$;

SET ROLE service_role;
DO $cases$
DECLARE
  scenario record;
  actual smallint;
BEGIN
  FOR scenario IN
    SELECT * FROM (VALUES
      ('ST38-ISSUED-NOSURVEY',0::smallint),
      ('ST38-VERIFIED-LV1',1::smallint),
      ('ST38-VERIFIED-LV2',2::smallint),
      ('ST38-REVOKED',0::smallint),
      ('ST38-NO-REFERRALS',1::smallint),
      ('ST38-NO-UPGRADE',1::smallint),
      ('ST38-HASH-MISMATCH',0::smallint),
      ('ST38-WRONG-CAMPAIGN',NULL::smallint),
      ('ST38-NOT-ISSUED',NULL::smallint)
    ) AS cases(code,want)
  LOOP
    SELECT stage38_referral_fixture.level_for_code(scenario.code)
      INTO actual;
    IF actual IS DISTINCT FROM scenario.want THEN
      RAISE EXCEPTION 'Synthetic referral contract violation in case %',scenario.code;
    END IF;
  END LOOP;
END;
$cases$;
RESET ROLE;

SELECT 'PASS: synthetic survey-proof gating Lv1, verified-referral Lv2, issued-only denial, disabled/hash/campaign/unknown fail-closed' AS result;
