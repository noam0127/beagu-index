-- Opt-in only. Promotional SMS consent is never presumed from account creation.
-- Private contact list; no Data API permissions or user-controlled RLS policies.
create schema if not exists beagu_private;

create table if not exists beagu_private.member_sms_subscriptions_v1 (
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
    (sms_consent and phone_e164 ~ '^[+]8210[0-9]{8} and consented_at is not null)
    or (not sms_consent and phone_e164 is null)
  )
);
alter table beagu_private.member_sms_subscriptions_v1 enable row level security;
revoke all on beagu_private.member_sms_subscriptions_v1 from public, anon, authenticated;
create index if not exists member_sms_active_v1_idx
  on beagu_private.member_sms_subscriptions_v1(sms_consent, phone_verified_at)
  where sms_consent = true;

comment on table beagu_private.member_sms_subscriptions_v1 is
  'Explicit, optional SMS marketing consent from verified application signup actions. Phone verification required before campaigns.';
comment on column beagu_private.member_sms_subscriptions_v1.phone_verified_at is
  'NULL until verified via an independently configured SMS OTP provider; never infer ownership from typed number.';

create or replace function beagu_private.capture_member_sms_consent_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, beagu_private
as $$
declare
  wants_sms boolean;
  raw_phone text;
  clean_phone text;
begin
  if tg_op = 'UPDATE'
    and (new.raw_user_meta_data ->> 'beagu_sms_opt_in')
      is not distinct from (old.raw_user_meta_data ->> 'beagu_sms_opt_in')
    and (new.raw_user_meta_data ->> 'beagu_sms_phone')
      is not distinct from (old.raw_user_meta_data ->> 'beagu_sms_phone')
  then
    return new;
  end if;

  wants_sms := (new.raw_user_meta_data ->> 'beagu_sms_opt_in') = 'true';
  if wants_sms then
    raw_phone := coalesce(new.raw_user_meta_data ->> 'beagu_sms_phone', '');
    clean_phone := regexp_replace(raw_phone, '[^0-9]', '', 'g');
    if clean_phone !~ '^010[0-9]{8}$' then
      -- Refuse to record a purported consent unless a valid contact was supplied.
      return new;
    end if;
    insert into beagu_private.member_sms_subscriptions_v1
      (user_id,phone_e164,sms_consent,consent_version,consent_source,
       consented_at,withdrawn_at,phone_verified_at,updated_at)
    values
      (new.id, '+82'||substring(clean_phone from 2), true,
       '2026-11-21-v1', 'lv2_account_signup', now(), null, null, now())
    on conflict (user_id) do update set
      phone_e164 = excluded.phone_e164,
      sms_consent = true,
      consent_version = excluded.consent_version,
      consent_source = excluded.consent_source,
      consented_at = now(),
      withdrawn_at = null,
      phone_verified_at = case
        when member_sms_subscriptions_v1.phone_e164 = excluded.phone_e164
        then member_sms_subscriptions_v1.phone_verified_at
        else null end,
      updated_at = now();
  else
    -- Withdrawal stops future messaging, and erases the phone from the private list.
    update beagu_private.member_sms_subscriptions_v1
       set sms_consent=false, phone_e164=null, phone_verified_at=null,
           withdrawn_at=now(), updated_at=now()
     where user_id=new.id and sms_consent=true;
  end if;
  return new;
end;
$$;
revoke all on function beagu_private.capture_member_sms_consent_v1()
  from public, anon, authenticated;

drop trigger if exists capture_member_sms_consent_v1 on auth.users;
create trigger capture_member_sms_consent_v1
after insert or update of raw_user_meta_data on auth.users
for each row execute function beagu_private.capture_member_sms_consent_v1();
 and consented_at is not null)
    or (not sms_consent and phone_e164 is null)
  )
);
alter table beagu_private.member_sms_subscriptions_v1 enable row level security;
revoke all on beagu_private.member_sms_subscriptions_v1 from public, anon, authenticated;
create index if not exists member_sms_active_v1_idx
  on beagu_private.member_sms_subscriptions_v1(sms_consent, phone_verified_at)
  where sms_consent = true;

comment on table beagu_private.member_sms_subscriptions_v1 is
  'Explicit, optional SMS marketing consent from verified application signup actions. Phone verification required before campaigns.';
comment on column beagu_private.member_sms_subscriptions_v1.phone_verified_at is
  'NULL until verified via an independently configured SMS OTP provider; never infer ownership from typed number.';

create or replace function beagu_private.capture_member_sms_consent_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, beagu_private
as $$
declare
  wants_sms boolean;
  raw_phone text;
  clean_phone text;
begin
  if tg_op = 'UPDATE'
    and (new.raw_user_meta_data ->> 'beagu_sms_opt_in')
      is not distinct from (old.raw_user_meta_data ->> 'beagu_sms_opt_in')
    and (new.raw_user_meta_data ->> 'beagu_sms_phone')
      is not distinct from (old.raw_user_meta_data ->> 'beagu_sms_phone')
  then
    return new;
  end if;

  wants_sms := (new.raw_user_meta_data ->> 'beagu_sms_opt_in') = 'true';
  if wants_sms then
    raw_phone := coalesce(new.raw_user_meta_data ->> 'beagu_sms_phone', '');
    clean_phone := regexp_replace(raw_phone, '[^0-9]', '', 'g');
    if clean_phone !~ '^010[0-9]{8}$' then
      -- Refuse to record a purported consent unless a valid contact was supplied.
      return new;
    end if;
    insert into beagu_private.member_sms_subscriptions_v1
      (user_id,phone_e164,sms_consent,consent_version,consent_source,
       consented_at,withdrawn_at,phone_verified_at,updated_at)
    values
      (new.id, '+82'||substring(clean_phone from 2), true,
       '2026-11-21-v1', 'lv2_account_signup', now(), null, null, now())
    on conflict (user_id) do update set
      phone_e164 = excluded.phone_e164,
      sms_consent = true,
      consent_version = excluded.consent_version,
      consent_source = excluded.consent_source,
      consented_at = now(),
      withdrawn_at = null,
      phone_verified_at = case
        when member_sms_subscriptions_v1.phone_e164 = excluded.phone_e164
        then member_sms_subscriptions_v1.phone_verified_at
        else null end,
      updated_at = now();
  else
    -- Withdrawal stops future messaging, and erases the phone from the private list.
    update beagu_private.member_sms_subscriptions_v1
       set sms_consent=false, phone_e164=null, phone_verified_at=null,
           withdrawn_at=now(), updated_at=now()
     where user_id=new.id and sms_consent=true;
  end if;
  return new;
end;
$$;
revoke all on function beagu_private.capture_member_sms_consent_v1()
  from public, anon, authenticated;

drop trigger if exists capture_member_sms_consent_v1 on auth.users;
create trigger capture_member_sms_consent_v1
after insert or update of raw_user_meta_data on auth.users
for each row execute function beagu_private.capture_member_sms_consent_v1();
