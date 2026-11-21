-- Disposable PostgreSQL 16 test data only. Never connect production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists beagu_private;

create table beagu_private.challenge_identity_codes (
 campaign text not null,
 visitor_id uuid not null,
 participant_no bigint not null,
 identity_code text not null unique,
 primary key(campaign,visitor_id)
);
create table beagu_private.challenge_referral_profiles (
 campaign text not null,
 visitor_id uuid not null,
 identity_code_sha256 text not null,
 referral_token_sha256 text not null,
 access_level smallint not null default 1,
 valid_referrals integer not null default 0,
 upgraded_at timestamptz,
 disabled boolean not null default false,
 primary key(campaign,visitor_id)
);
create table beagu_private.challenge_referral_events (
 event_sha256 text primary key,
 campaign text not null,
 referrer_visitor_id uuid,
 referral_token_sha256 text not null,
 decision text not null
);
create table beagu_private.challenge_referral_quality_reviews (
 event_sha256 text primary key,
 quality_status text not null,
 form_quality_attested boolean not null
);
create table public.beagu_level_codes (
 code_sha256 text primary key,
 access_level smallint not null,
 active boolean not null default true
);
insert into public.beagu_level_codes(code_sha256,access_level)
values(encode(extensions.digest('LEGACY-TEST-CODE','sha256'),'hex'),2);

insert into beagu_private.challenge_identity_codes(campaign,visitor_id,participant_no,identity_code)
values
 ('2026','11111111-1111-4111-8111-111111111111',1,'K7M9Q2X4T8'),
 ('2026','22222222-2222-4222-8222-222222222222',2,'BG26-ABCD-EF12-3456-789A-BCDE'),
 ('2026','33333333-3333-4333-8333-333333333333',3,'BG26-ABCDEF-GHJKLM'),
 ('2026','44444444-4444-4444-8444-444444444444',4,'P7K8M9X2T3');

insert into beagu_private.challenge_referral_profiles(
 campaign,visitor_id,identity_code_sha256,referral_token_sha256,
 access_level,valid_referrals,upgraded_at,disabled
) values(
 '2026','33333333-3333-4333-8333-333333333333',
 encode(extensions.digest('BG26-ABCDEF-GHJKLM','sha256'),'hex'),
 repeat('a',64),2,1,now(),false
);
insert into beagu_private.challenge_referral_events(
 event_sha256,campaign,referrer_visitor_id,referral_token_sha256,decision
) values(repeat('b',64),'2026','33333333-3333-4333-8333-333333333333',repeat('a',64),'credited');
insert into beagu_private.challenge_referral_quality_reviews(
 event_sha256,quality_status,form_quality_attested
) values(repeat('b',64),'AUTO_PASS',true);
