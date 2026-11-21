-- Synthetic fixture for isolated PostgreSQL 16 only.
-- Must run AFTER tests/challenge-2026-code-level-fixture.sql
-- and BEFORE stage-16/17/18 migrations.
create schema auth;
create table auth.users(
 id uuid primary key,
 email_confirmed_at timestamptz,
 is_anonymous boolean not null default false
);
create table auth.sessions(
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 not_after timestamptz
);
create table beagu_private.challenge_device_claims(
 campaign text not null,
 visitor_id uuid not null,
 device_secret_sha256 text not null,
 primary key(campaign,visitor_id),
 foreign key(campaign,visitor_id)
  references beagu_private.challenge_identity_codes(campaign,visitor_id)
);
create table public.beagu_admin_accounts(
 user_id uuid primary key references auth.users(id),
 role text not null,
 enabled boolean not null default true
);
insert into auth.users(id,email_confirmed_at,is_anonymous)values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now(),false),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',null,false),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',now(),true);
insert into auth.sessions(id,user_id,not_after)values
 ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()+interval '30 minutes'),
 ('aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '2 minutes'),
 ('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now()+interval '30 minutes');

insert into beagu_private.challenge_device_claims(campaign,visitor_id,device_secret_sha256)values
 ('2026','33333333-3333-4333-8333-333333333333',repeat('d',64)),
 ('2026','44444444-4444-4444-8444-444444444444',repeat('e',64));

grant usage on schema auth,beagu_private to service_role;
grant select on auth.users,auth.sessions to service_role;
grant select on public.beagu_admin_accounts to service_role;
grant select on beagu_private.challenge_device_claims to service_role;
