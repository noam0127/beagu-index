-- Disposable PostgreSQL only. No real survey responses or production credentials.
create schema auth;
create table auth.users(id uuid primary key);
create schema beagu_private;
create table beagu_private.challenge_referral_settings(name text primary key, enabled boolean not null);
create table beagu_private.challenge_referral_profiles(
 campaign text not null, visitor_id uuid not null, referral_token_sha256 text unique not null,
 identity_code_sha256 text, disabled boolean not null default false,
 access_level integer not null default 1, valid_referrals integer not null default 0,
 upgraded_at timestamptz, primary key(campaign,visitor_id));
create table beagu_private.challenge_referral_events(
 event_sha256 text primary key, campaign text not null, referral_token_sha256 text not null,
 respondent_sha256 text not null, referrer_visitor_id uuid, decision text not null);
insert into beagu_private.challenge_referral_settings values('ingest_enabled',true);
