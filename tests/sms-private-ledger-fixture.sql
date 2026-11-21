-- Isolated CI Postgres fixture. SYNTHETIC identities only.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
grant usage on schema public to service_role;
create schema auth;
create schema beagu_private;
create table auth.users (
 id uuid primary key,
 email_confirmed_at timestamptz,
 is_anonymous boolean not null default false,
 raw_user_meta_data jsonb not null default '{}'::jsonb
);
insert into auth.users(id,email_confirmed_at,is_anonymous,raw_user_meta_data)
values
 ('11111111-1111-4111-8111-111111111111',now(),false,
  '{"beagu_sms_opt_in":true,"beagu_sms_phone":"010-1111-2222"}'),
 ('22222222-2222-4222-8222-222222222222',null,false,'{}'),
 ('33333333-3333-4333-8333-333333333333',now(),true,'{}');

create table beagu_private.member_sms_subscriptions_v1 (
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone_e164 text,
 sms_consent boolean not null default false,
 consent_version text,
 consent_source text,
 consented_at timestamptz,
 withdrawn_at timestamptz,
 phone_verified_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint member_sms_contact_valid check (
  (sms_consent and phone_e164 ~ '^[+]8210[0-9]{8}$' and consented_at is not null)
  or (not sms_consent and phone_e164 is null)
 )
);
alter table beagu_private.member_sms_subscriptions_v1 enable row level security;
create function beagu_private.capture_member_sms_consent_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,beagu_private as $fn$
begin
 if new.raw_user_meta_data->>'beagu_sms_opt_in'='true' then
  insert into beagu_private.member_sms_subscriptions_v1
    (user_id,phone_e164,sms_consent,consent_version,consent_source,consented_at)
  values(new.id,'+821011112222',true,'legacy','lv2_account_signup',now())
  on conflict(user_id) do update set sms_consent=true,
    phone_e164=excluded.phone_e164, consented_at=now();
 end if;
 return new;
end;$fn$;
create trigger capture_member_sms_consent_v1
after insert or update of raw_user_meta_data on auth.users
for each row execute function beagu_private.capture_member_sms_consent_v1();
insert into beagu_private.member_sms_subscriptions_v1
 (user_id,phone_e164,sms_consent,consent_version,consent_source,consented_at)
values ('11111111-1111-4111-8111-111111111111',
 '+821011112222',true,'legacy','lv2_account_signup',now());
