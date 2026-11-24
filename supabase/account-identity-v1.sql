-- Candidate foundation only. No existing accounts or survey records are migrated.
-- Link the canonical challenge visitor to a verified Auth user, without storing a password.
CREATE TABLE IF NOT EXISTS beagu_private.beagu_account_identity_v1 (
 visitor_id uuid PRIMARY KEY,
 auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
 account_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')),
 linked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beagu_private.beagu_account_identity_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_account_identity_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON beagu_private.beagu_account_identity_v1 TO service_role;
-- This function is service-role only and is called only after verified Auth JWT.
-- Require original device claim and active earned referral profile, never a code alone.
CREATE OR REPLACE FUNCTION public.beagu_account_bind_v1(p_user uuid,p_visitor uuid,p_device_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF p_user IS NULL OR p_visitor IS NULL OR p_device_hash IS NULL OR p_device_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_user AND u.email_confirmed_at IS NOT NULL) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM beagu_private.challenge_device_claims d
 JOIN beagu_private.challenge_referral_profiles r ON r.campaign=d.campaign AND r.visitor_id=d.visitor_id
 WHERE d.campaign='2026' AND d.visitor_id=p_visitor AND d.device_secret_sha256=p_device_hash
 AND r.access_level>=2 AND r.valid_referrals>=1 AND r.upgraded_at IS NOT NULL AND r.disabled=false)
 THEN RETURN NULL; END IF;
 -- Preserve any previously linked Post-it identity: neither account may be reassigned.
 IF EXISTS(SELECT 1 FROM public.beagu_postit_member_accounts m
 WHERE (m.auth_user_id=p_user OR m.identity_visitor_id=p_visitor)
 AND (m.auth_user_id<>p_user OR m.identity_visitor_id<>p_visitor OR m.status<>'active'))
 THEN RETURN NULL; END IF;
 INSERT INTO beagu_private.beagu_account_identity_v1(visitor_id,auth_user_id)
 VALUES(p_visitor,p_user) ON CONFLICT DO NOTHING;
 SELECT account_id INTO result FROM beagu_private.beagu_account_identity_v1
 WHERE visitor_id=p_visitor AND auth_user_id=p_user AND status='ACTIVE';
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.beagu_account_bind_v1(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_account_bind_v1(uuid,uuid,text) TO service_role;
-- Not a login endpoint or an access-level grant. No deployment until API and race tests pass.
