-- v1.1.0 stage 14 DRAFT ONLY. DO NOT APPLY without a verified encrypted
-- off-site backup, a successful isolated restore, and explicit owner approval.
-- Supersedes the legacy auth.users metadata trigger; do not treat
-- raw_user_meta_data as trustworthy proof of marketing consent.
--
-- Baseline observed via read-only production catalog: beagu_private.
-- member_sms_subscriptions_v1 already exists; old trigger on auth.users.
begin;

-- Stop user-editable Auth metadata from granting/changing SMS permissions.
drop trigger if exists capture_member_sms_consent_v1 on auth.users;
drop function if exists beagu_private.capture_member_sms_consent_v1();

alter table beagu_private.member_sms_subscriptions_v1
  add column if not exists phone_collection_consent boolean not null default false,
  add column if not exists consent_confirmed_at timestamptz;

create table if not exists beagu_private.member_sms_consent_events_v2 (
  event_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('opt_in','withdraw','legacy_purged')),
  consent_version text not null,
  consent_source text not null,
  request_id uuid not null unique,
  occurred_at timestamptz not null default now()
);
create index if not exists member_sms_consent_events_v2_user_idx
  on beagu_private.member_sms_consent_events_v2(user_id, occurred_at desc);
alter table beagu_private.member_sms_consent_events_v2 enable row level security;
alter table beagu_private.member_sms_subscriptions_v1 enable row level security;

-- Both private tables have no browser-facing grants or RLS policies.
revoke all on beagu_private.member_sms_subscriptions_v1
  from public, anon, authenticated;
revoke all on beagu_private.member_sms_consent_events_v2
  from public, anon, authenticated;
revoke all on sequence beagu_private.member_sms_consent_events_v2_event_id_seq
  from public, anon, authenticated;

-- One-time privacy cleanup of PRE-VERIFIED user-metadata-derived records:
-- no existing phone is grandfathered into the authoritative v2 ledger.
-- Legacy phone values are purged from this PRIVATE table. An operator must
-- separately purge old Auth user_metadata via the supported Auth Admin API.
insert into beagu_private.member_sms_consent_events_v2 (
  user_id, event_type, consent_version, consent_source, request_id
)
select user_id, 'legacy_purged', '2026-11-21-v2', 'unverified_user_metadata', gen_random_uuid()
from beagu_private.member_sms_subscriptions_v1
where sms_consent is true or phone_e164 is not null
on conflict (request_id) do nothing;

update beagu_private.member_sms_subscriptions_v1
set sms_consent=false,
    phone_collection_consent=false,
    phone_e164=null,
    phone_verified_at=null,
    consent_confirmed_at=null,
    withdrawn_at=coalesce(withdrawn_at, now()),
    consent_source='unverified_user_metadata_purged_v2',
    updated_at=now()
where sms_consent is true or phone_e164 is not null;

-- Every active consent must be explicitly confirmed through a server endpoint.
alter table beagu_private.member_sms_subscriptions_v1
  add constraint member_sms_authority_v2
  check (
    (sms_consent is true and phone_collection_consent is true
      and consent_confirmed_at is not null
      and phone_e164 ~ '^[+]8210[0-9]{8}$'
      and withdrawn_at is null)
    or
    (sms_consent is false and phone_collection_consent is false
      and phone_e164 is null and phone_verified_at is null
      and consent_confirmed_at is null)
  ) not valid;
alter table beagu_private.member_sms_subscriptions_v1
  validate constraint member_sms_authority_v2;

-- Only the service role can invoke these RPCs. The API MUST verify the
-- exact authenticated end user via auth.getUser(jwt) and never trust an
-- arbitrary user_id or user_metadata supplied by a browser.
create or replace function public.beagu_member_sms_grant_v2(
  p_user uuid,
  p_phone text,
  p_collection boolean,
  p_marketing boolean,
  p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
  normalized text;
begin
  if p_user is null or p_request_id is null
    or p_collection is distinct from true
    or p_marketing is distinct from true then
    return jsonb_build_object('ok',false,'code','CONSENT_REQUIRED');
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id=p_user and u.email_confirmed_at is not null
      and u.is_anonymous is not true
  ) then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED');
  end if;
  normalized := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if normalized !~ '^010[0-9]{8}$' then
    return jsonb_build_object('ok',false,'code','INVALID_PHONE');
  end if;
  if exists (
    select 1 from beagu_private.member_sms_consent_events_v2
    where request_id=p_request_id and user_id<>p_user
  ) then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end if;
  if exists (
    select 1 from beagu_private.member_sms_consent_events_v2
    where request_id=p_request_id and user_id=p_user and event_type='opt_in'
  ) then
    return jsonb_build_object('ok',true,'consented',true,'duplicate',true);
  end if;
  insert into beagu_private.member_sms_subscriptions_v1 (
    user_id,phone_e164,sms_consent,phone_collection_consent,consent_version,
    consent_source,consented_at,consent_confirmed_at,withdrawn_at,
    phone_verified_at,updated_at
  ) values (
    p_user,'+82'||substring(normalized from 2),true,true,
    '2026-11-21-v2','authenticated_explicit_reconsent_v2',now(),now(),null,
    null,now()
  )
  on conflict (user_id) do update set
    phone_e164=excluded.phone_e164,
    sms_consent=true,
    phone_collection_consent=true,
    consent_version=excluded.consent_version,
    consent_source=excluded.consent_source,
    consented_at=now(),
    consent_confirmed_at=now(),
    withdrawn_at=null,
    -- Changing/reconfirming a phone always invalidates verification.
    phone_verified_at=null,
    updated_at=now();
  insert into beagu_private.member_sms_consent_events_v2(
    user_id,event_type,consent_version,consent_source,request_id
  ) values(p_user,'opt_in','2026-11-21-v2',
    'authenticated_explicit_reconsent_v2',p_request_id);
  return jsonb_build_object('ok',true,'consented',true,'phone_verified',false);
end;
$fn$;
revoke all on function public.beagu_member_sms_grant_v2(uuid,text,boolean,boolean,uuid)
  from public, anon, authenticated;
grant execute on function public.beagu_member_sms_grant_v2(uuid,text,boolean,boolean,uuid)
  to service_role;

create or replace function public.beagu_member_sms_withdraw_v2(
  p_user uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
  if p_user is null or p_request_id is null then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end if;
  if not exists(select 1 from auth.users u where u.id=p_user)
  then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if exists (
    select 1 from beagu_private.member_sms_consent_events_v2
    where request_id=p_request_id and user_id<>p_user
  ) then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  if exists (
    select 1 from beagu_private.member_sms_consent_events_v2
    where request_id=p_request_id and user_id=p_user and event_type='withdraw'
  ) then return jsonb_build_object('ok',true,'consented',false,'duplicate',true); end if;
  insert into beagu_private.member_sms_subscriptions_v1 (
    user_id,phone_e164,sms_consent,phone_collection_consent,
    withdrawn_at,phone_verified_at,consent_confirmed_at,updated_at
  ) values (p_user,null,false,false,now(),null,null,now())
  on conflict (user_id) do update set
    phone_e164=null,
    sms_consent=false,
    phone_collection_consent=false,
    phone_verified_at=null,
    consent_confirmed_at=null,
    withdrawn_at=now(),
    updated_at=now();
  insert into beagu_private.member_sms_consent_events_v2(
    user_id,event_type,consent_version,consent_source,request_id
  ) values(p_user,'withdraw','2026-11-21-v2','self_service_v2',p_request_id);
  return jsonb_build_object('ok',true,'consented',false);
end;
$fn$;
revoke all on function public.beagu_member_sms_withdraw_v2(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.beagu_member_sms_withdraw_v2(uuid,uuid)
  to service_role;

create or replace function public.beagu_member_sms_status_v2(p_user uuid)
returns jsonb language sql security definer set search_path='' as $fn$
  select jsonb_build_object(
    'consented',coalesce(s.sms_consent and s.phone_collection_consent and
      s.consent_confirmed_at is not null and s.withdrawn_at is null,false),
    'phone_verified',coalesce(s.phone_verified_at is not null,false),
    'send_eligible',coalesce(s.sms_consent and s.phone_collection_consent and
      s.consent_confirmed_at is not null and s.phone_verified_at is not null
      and s.withdrawn_at is null,false),
    'updated_at',s.updated_at
  )
  from beagu_private.member_sms_subscriptions_v1 s
  where s.user_id=p_user
$fn$;
revoke all on function public.beagu_member_sms_status_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.beagu_member_sms_status_v2(uuid)
  to service_role;

comment on table beagu_private.member_sms_consent_events_v2 is
  'Private SMS consent event audit. No phone, raw JWT, IP, email or original request body.';
comment on function public.beagu_member_sms_grant_v2(uuid,text,boolean,boolean,uuid) is
  'Service-role ONLY after Auth getUser(jwt) verifies the caller. Never use user_metadata as consent.';
comment on function public.beagu_member_sms_withdraw_v2(uuid,uuid) is
  'Service-role ONLY. Immediately erases private phone and send eligibility.';

commit;
