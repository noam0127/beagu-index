-- Disposable PostgreSQL ONLY. No production Supabase connections.
-- Before applying the pinned admin PR #240 migration SQL files.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA beagu_private;

CREATE TABLE auth.users(
 id uuid PRIMARY KEY,
 email text,
 email_confirmed_at timestamptz,
 created_at timestamptz NOT NULL,
 last_sign_in_at timestamptz,
 banned_until timestamptz
);
CREATE TABLE public.beagu_admin_accounts(
 user_id uuid PRIMARY KEY,
 role text NOT NULL DEFAULT 'admin',
 enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE public.beagu_admin_audit_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_user_id uuid NOT NULL,
 event_type text NOT NULL,
 outcome text NOT NULL,
 details jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.beagu_postit_member_accounts(
 auth_user_id uuid PRIMARY KEY,
 identity_visitor_id uuid,
 status text NOT NULL,
 linked_at timestamptz
);
CREATE TABLE beagu_private.challenge_identity_codes(
 campaign text NOT NULL,
 visitor_id uuid NOT NULL,
 participant_no bigint NOT NULL,
 PRIMARY KEY(campaign,visitor_id)
);
CREATE TABLE beagu_private.challenge_referral_profiles(
 campaign text NOT NULL,
 visitor_id uuid NOT NULL,
 access_level smallint,
 valid_referrals integer,
 disabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY(campaign,visitor_id)
);
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_admin_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_postit_member_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.challenge_identity_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.challenge_referral_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA auth,beagu_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA auth,beagu_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon,authenticated;
COMMIT;

-- 10,001 synthetic Auth accounts. No real users or survey responses.
INSERT INTO auth.users(id,email,email_confirmed_at,created_at,last_sign_in_at,banned_until)
SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       'teacher'||lpad(n::text,5,'0')||'@example.test',
       CASE WHEN n%2=0 THEN now() ELSE null END,
       now()-n*interval '1 second',
       CASE WHEN n%4=0 THEN now() ELSE null END,
       CASE WHEN n%101=0 THEN now()+interval '24 hours' ELSE null END
FROM generate_series(1,10001) n;

INSERT INTO public.beagu_admin_accounts(user_id,role,enabled)
VALUES ('00000000-0000-4000-8000-000000000002','owner',true);

INSERT INTO public.beagu_postit_member_accounts(auth_user_id,identity_visitor_id,status,linked_at)
VALUES ('00000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111','active',now());
INSERT INTO beagu_private.challenge_identity_codes(campaign,visitor_id,participant_no)
VALUES ('2026','11111111-1111-4111-8111-111111111111',777);
INSERT INTO beagu_private.challenge_referral_profiles(
 campaign,visitor_id,access_level,valid_referrals,disabled)
VALUES ('2026','11111111-1111-4111-8111-111111111111',2,3,false);
