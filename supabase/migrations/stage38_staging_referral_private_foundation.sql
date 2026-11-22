-- Stage38: schema-only staging reconstruction from production catalog metadata.
-- Target ONLY ycwuugggqbunlbwuzvbx. NO production rows, keys, identities or grants copied.
BEGIN;
CREATE TABLE IF NOT EXISTS beagu_private.challenge_identity_codes (
 campaign text NOT NULL, visitor_id uuid NOT NULL, participant_no bigint NOT NULL,
 identity_code text NOT NULL, issued_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign,visitor_id), UNIQUE(campaign,participant_no), UNIQUE(identity_code)
);
CREATE TABLE IF NOT EXISTS beagu_private.challenge_referral_profiles (
 campaign text NOT NULL DEFAULT '2026', visitor_id uuid NOT NULL,
 identity_code_sha256 text NOT NULL CHECK(identity_code_sha256 ~ '^[a-f0-9]{64}$'),
 referral_token_sha256 text NOT NULL CHECK(referral_token_sha256 ~ '^[a-f0-9]{64}$'),
 access_level smallint NOT NULL DEFAULT 1 CHECK(access_level BETWEEN 1 AND 3),
 valid_referrals integer NOT NULL DEFAULT 0 CHECK(valid_referrals>=0),
 issued_at timestamptz NOT NULL DEFAULT now(), upgraded_at timestamptz,
 disabled boolean NOT NULL DEFAULT false, short_code text UNIQUE,
 PRIMARY KEY(campaign,visitor_id),
 FOREIGN KEY(campaign,visitor_id) REFERENCES beagu_private.challenge_identity_codes(campaign,visitor_id)
);
CREATE TABLE IF NOT EXISTS beagu_private.challenge_device_claims (
 campaign text NOT NULL DEFAULT '2026', visitor_id uuid NOT NULL,
 device_secret_sha256 text NOT NULL CHECK(device_secret_sha256 ~ '^[a-f0-9]{64}$'),
 claimed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign,visitor_id),
 FOREIGN KEY(campaign,visitor_id) REFERENCES beagu_private.challenge_identity_codes(campaign,visitor_id)
);
ALTER TABLE beagu_private.challenge_identity_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.challenge_referral_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.challenge_device_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.challenge_identity_codes,beagu_private.challenge_referral_profiles,beagu_private.challenge_device_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON beagu_private.challenge_identity_codes,beagu_private.challenge_referral_profiles,beagu_private.challenge_device_claims TO service_role;
COMMIT;
