-- Isolated synthetic test data; never connect to production.
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);
CREATE SCHEMA beagu_private;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE beagu_private.challenge_identity_codes(campaign text,visitor_id uuid,identity_code text,PRIMARY KEY(campaign,visitor_id));
CREATE TABLE beagu_private.challenge_device_claims(campaign text,visitor_id uuid,device_secret_sha256 text,PRIMARY KEY(campaign,visitor_id));
CREATE TABLE beagu_private.challenge_referral_profiles(campaign text,visitor_id uuid,access_level smallint,valid_referrals integer,upgraded_at timestamptz,disabled boolean,PRIMARY KEY(campaign,visitor_id));
CREATE TABLE public.beagu_level_sessions(token_sha256 text PRIMARY KEY,access_level smallint NOT NULL,expires_at timestamptz NOT NULL,identity_campaign text,identity_visitor_id uuid);
CREATE TABLE public.beagu_login_budget(bucket timestamptz PRIMARY KEY,attempts integer NOT NULL);
CREATE FUNCTION public.beagu_consume_login_budget() RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$ DECLARE n integer; BEGIN
 INSERT INTO public.beagu_login_budget(bucket,attempts) VALUES(date_trunc('minute',now()),1) ON CONFLICT(bucket) DO UPDATE SET attempts=beagu_login_budget.attempts+1 RETURNING attempts INTO n; RETURN n<=60; END $$;
CREATE FUNCTION public.beagu_has_earned_challenge_visitor(p_visitor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT EXISTS(SELECT 1 FROM beagu_private.challenge_referral_profiles WHERE campaign='2026' AND visitor_id=p_visitor AND access_level>=2 AND valid_referrals>=1 AND upgraded_at IS NOT NULL AND disabled=false)
$$;
INSERT INTO auth.users(id,email_confirmed_at) VALUES('00000000-0000-0000-0000-000000000001',now()),('00000000-0000-0000-0000-000000000002',now());
INSERT INTO beagu_private.challenge_identity_codes VALUES('2026','10000000-0000-0000-0000-000000000001','SYNTHETIC-ONE'),('2026','10000000-0000-0000-0000-000000000002','SYNTHETIC-TWO');
INSERT INTO beagu_private.challenge_device_claims VALUES('2026','10000000-0000-0000-0000-000000000001',repeat('a',64)),('2026','10000000-0000-0000-0000-000000000002',repeat('b',64));
INSERT INTO beagu_private.challenge_referral_profiles VALUES('2026','10000000-0000-0000-0000-000000000001',1,0,NULL,false),('2026','10000000-0000-0000-0000-000000000002',2,2,now(),false);

CREATE TABLE public.schools(school_id text PRIMARY KEY);
INSERT INTO public.schools VALUES('TEST001');
CREATE TABLE public.beagu_admin_accounts(user_id uuid PRIMARY KEY,role text,enabled boolean);
INSERT INTO public.beagu_admin_accounts VALUES('00000000-0000-0000-0000-000000000001','owner',true);
