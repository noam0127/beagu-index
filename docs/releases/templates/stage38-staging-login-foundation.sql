-- REVIEW-ONLY / NOT AN ACTIVE MIGRATION / DO NOT APPLY WITHOUT OWNER APPROVAL
-- TARGET: isolated Supabase ycwuugggqbunlbwuzvbx ONLY
-- NEVER APPLY TO production Supabase snvzwrexuqavnfvzgxqj.
--
-- Stage38 synthetic-only, minimal foundation for the *existing* Lv1/Lv2
-- participation-code login handler. This intentionally creates NO accounts,
-- sample codes, sessions, real school records, PII, or production migrations.
--
-- This file is deliberately NOT in supabase/migrations/.
-- A separate authorized operator must set this guard on the same DB session:
--   SET app.stage38_approved_target_ref = 'ycwuugggqbunlbwuzvbx';
-- Then independently verify project identity and review DDL before running.
-- The custom setting is an accidental-target guard, NOT cryptographic proof.
-- The schema checks prevent a normal production database from matching.
--
-- No GitHub Actions job, app code or test may invoke this DDL automatically.

BEGIN;
DO $stage38_guard$
BEGIN
  IF current_setting('app.stage38_approved_target_ref', true)
       IS DISTINCT FROM 'ycwuugggqbunlbwuzvbx'
     OR to_regclass('stage_private.fake_schools') IS NULL
     OR to_regclass('stage_private.members') IS NULL
     OR to_regclass('public.beagu_level_sessions') IS NULL
     OR to_regclass('public.beagu_site_release_state_v1') IS NOT NULL
     OR to_regclass('beagu_private.challenge_identity_codes') IS NOT NULL
  THEN
    RAISE EXCEPTION 'STAGE38_STAGING_ONLY_TARGET_GUARD_FAILED';
  END IF;
  IF to_regclass('public.beagu_level_codes') IS NOT NULL
     OR to_regclass('public.beagu_login_budget') IS NOT NULL
     OR to_regprocedure('public.beagu_consume_login_budget()') IS NOT NULL
  THEN
    RAISE EXCEPTION 'STAGE38_LOGIN_FOUNDATION_ALREADY_EXISTS_REVIEW_REQUIRED';
  END IF;
END;
$stage38_guard$;

CREATE TABLE public.beagu_level_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  access_level smallint NOT NULL CHECK (access_level IN (1, 2)),
  code_sha256 text NOT NULL UNIQUE CHECK (code_sha256 ~ '^[a-f0-9]{64}$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.beagu_login_budget (
  bucket timestamptz PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0)
);

ALTER TABLE public.beagu_level_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_login_budget ENABLE ROW LEVEL SECURITY;

-- No policies grant direct client access. All calls are server-only and use
-- service_role; never expose participation-code hashes through the Data API.
REVOKE ALL ON TABLE public.beagu_level_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.beagu_login_budget FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.beagu_level_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.beagu_login_budget TO service_role;

-- Atomic minute-budget; does not expose or return any participation code.
-- At the limit, no increment is permitted and the return value is false.
CREATE FUNCTION public.beagu_consume_login_budget()
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $stage38_function$
DECLARE
  v_attempts integer;
BEGIN
  DELETE FROM public.beagu_login_budget
    WHERE bucket < now() - interval '1 hour';
  INSERT INTO public.beagu_login_budget(bucket, attempts)
    VALUES(date_trunc('minute', now()), 1)
  ON CONFLICT (bucket) DO UPDATE
    SET attempts = public.beagu_login_budget.attempts + 1
    WHERE public.beagu_login_budget.attempts < 60
  RETURNING attempts INTO v_attempts;
  RETURN COALESCE(v_attempts BETWEEN 1 AND 60, false);
END;
$stage38_function$;

REVOKE ALL ON FUNCTION public.beagu_consume_login_budget()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_consume_login_budget()
  TO service_role;

-- Deliberately NO INSERT into beagu_level_codes or any other user table.
-- Synthetic codes are provisioned only in a distinct, approved later action.
COMMIT;
