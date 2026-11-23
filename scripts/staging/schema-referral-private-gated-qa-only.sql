-- ISOLATED BEAGU v1.1.0 STAGING ONLY.
-- Explicitly disabled until Google Form attribution is independently verified.
-- No real respondent identities, tokens, or answers copied from production.
CREATE TABLE IF NOT EXISTS beagu_private.challenge_referral_settings (
  name text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beagu_private.challenge_referral_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.challenge_referral_settings FROM PUBLIC, anon, authenticated;
INSERT INTO beagu_private.challenge_referral_settings(name,enabled)
VALUES ('public_enabled',false)
ON CONFLICT(name) DO NOTHING;
-- A valid device-proof hash and already issued code must agree; UUID alone
-- and mere knowledge of the identity code are never sufficient for ownership.
CREATE OR REPLACE FUNCTION public.beagu_issue_challenge_identity_bound(
  p_visitor uuid,p_device_hash text,p_existing_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_code text;
  v_hash text;
  v_no bigint;
BEGIN
  IF p_visitor IS NULL OR p_device_hash IS NULL
     OR p_device_hash !~ '^[a-f0-9]{64}$'
     OR p_existing_code IS NULL
  THEN RAISE EXCEPTION 'INVALID_PROOF' USING errcode='28000'; END IF;
  SELECT c.identity_code,c.participant_no,d.device_secret_sha256
  INTO v_code,v_no,v_hash
  FROM beagu_private.challenge_identity_codes c
  JOIN beagu_private.challenge_device_claims d
    ON d.campaign=c.campaign AND d.visitor_id=c.visitor_id
  WHERE c.campaign='2026' AND c.visitor_id=p_visitor;
  IF NOT FOUND OR v_hash<>p_device_hash OR v_code<>p_existing_code THEN
    RAISE EXCEPTION 'OWNERSHIP_MISMATCH' USING errcode='28000';
  END IF;
  RETURN pg_catalog.jsonb_build_object('identity_code',v_code,'participant_no',v_no);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.beagu_referral_enroll(
  p_visitor uuid,p_identity_code text,p_referral_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_profile beagu_private.challenge_referral_profiles%rowtype;
BEGIN
  -- Fail closed until owner-verifiable Google Form ingestion is available.
  IF NOT coalesce((SELECT enabled FROM beagu_private.challenge_referral_settings
      WHERE name='public_enabled'),false)
  THEN RAISE EXCEPTION 'REFERRAL_NOT_READY' USING errcode='42501'; END IF;
  IF p_visitor IS NULL OR p_identity_code IS NULL OR
     p_referral_hash IS NULL OR p_referral_hash !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'INVALID_ENROLLMENT' USING errcode='22023'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM beagu_private.challenge_identity_codes c
    WHERE c.campaign='2026' AND c.visitor_id=p_visitor AND c.identity_code=p_identity_code
  ) THEN RAISE EXCEPTION 'IDENTITY_MISMATCH' USING errcode='28000'; END IF;
  INSERT INTO beagu_private.challenge_referral_profiles
    (campaign,visitor_id,identity_code_sha256,referral_token_sha256)
  VALUES ('2026',p_visitor,
    pg_catalog.encode(extensions.digest(p_identity_code,'sha256'),'hex'),
    p_referral_hash)
  ON CONFLICT(campaign,visitor_id) DO NOTHING;
  SELECT * INTO v_profile
  FROM beagu_private.challenge_referral_profiles
  WHERE campaign='2026' AND visitor_id=p_visitor;
  IF NOT FOUND OR v_profile.disabled OR
    v_profile.identity_code_sha256<>pg_catalog.encode(extensions.digest(p_identity_code,'sha256'),'hex') OR
    v_profile.referral_token_sha256<>p_referral_hash
  THEN RAISE EXCEPTION 'ENROLLMENT_UNAVAILABLE' USING errcode='28000'; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'level',v_profile.access_level,'validReferrals',v_profile.valid_referrals);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.beagu_referral_short_issue(p_hash text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_short text;
  v_attempt integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM beagu_private.challenge_referral_settings
    WHERE name='public_enabled' AND enabled)
  THEN RAISE EXCEPTION 'REFERRAL_NOT_READY' USING errcode='42501'; END IF;
  SELECT short_code INTO STRICT v_short
  FROM beagu_private.challenge_referral_profiles
  WHERE campaign='2026' AND referral_token_sha256=p_hash AND NOT disabled
  FOR UPDATE;
  IF v_short IS NOT NULL THEN RETURN v_short; END IF;
  FOR v_attempt IN 1..10 LOOP
    v_short:=pg_catalog.translate(pg_catalog.encode(extensions.gen_random_bytes(6),'base64'),'+/','-_');
    BEGIN
      UPDATE beagu_private.challenge_referral_profiles
      SET short_code=v_short
      WHERE campaign='2026' AND referral_token_sha256=p_hash AND NOT disabled;
      RETURN v_short;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'SHORT_CODE_ALLOCATION_FAILED' USING errcode='23505';
END;
$fn$;
CREATE OR REPLACE FUNCTION public.beagu_referral_short_resolve(p_code text)
RETURNS TABLE(visitor uuid,identity_code text,token_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT p.visitor_id,c.identity_code,p.referral_token_sha256
 FROM beagu_private.challenge_referral_profiles p
 JOIN beagu_private.challenge_identity_codes c USING(campaign,visitor_id)
 WHERE p.campaign='2026' AND p.short_code=p_code AND NOT p.disabled
   AND EXISTS(SELECT 1 FROM beagu_private.challenge_referral_settings
      WHERE name='public_enabled' AND enabled);
$fn$;
-- Explicit DEFNER privilege isolation, default PostgreSQL PUBLIC execute removed.
REVOKE ALL ON FUNCTION public.beagu_issue_challenge_identity_bound(uuid,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_referral_enroll(uuid,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_referral_short_issue(text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_referral_short_resolve(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_issue_challenge_identity_bound(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_referral_enroll(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_referral_short_issue(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_referral_short_resolve(text) TO service_role;
NOTIFY pgrst,'reload schema';