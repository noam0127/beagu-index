-- Phase 1: additive, disabled-by-default referral ledger. No existing identity is changed.
-- Raw Google Form answers, identity codes and browser UUIDs are never stored in event rows.
create table if not exists beagu_private.challenge_referral_settings(
  name text primary key check (name in ('public_enabled','ingest_enabled','login_enabled')),
  enabled boolean not null default false,
  changed_at timestamptz not null default now()
);
insert into beagu_private.challenge_referral_settings(name,enabled)
values ('public_enabled',false),('ingest_enabled',false),('login_enabled',false)
on conflict (name) do nothing;

create table if not exists beagu_private.challenge_referral_profiles(
  campaign text not null default '2026',
  visitor_id uuid not null,
  identity_code_sha256 text not null unique check (identity_code_sha256 ~ '^[0-9a-f]{64}$'),
  referral_token_sha256 text not null unique check (referral_token_sha256 ~ '^[0-9a-f]{64}$'),
  access_level smallint not null default 1 check (access_level in (1,2)),
  valid_referrals integer not null default 0 check (valid_referrals between 0 and 1),
  issued_at timestamptz not null default now(),
  upgraded_at timestamptz,
  disabled boolean not null default false,
  primary key(campaign,visitor_id),
  foreign key(campaign,visitor_id)
    references beagu_private.challenge_identity_codes(campaign,visitor_id)
);
create table if not exists beagu_private.challenge_referral_events(
  event_sha256 text primary key check(event_sha256 ~ '^[0-9a-f]{64}$'),
  campaign text not null default '2026',
  referral_token_sha256 text not null check(referral_token_sha256 ~ '^[0-9a-f]{64}$'),
  respondent_sha256 text not null check(respondent_sha256 ~ '^[0-9a-f]{64}$'),
  referrer_visitor_id uuid,
  decision text not null check(decision in ('credited','invalid_link','same_device','duplicate_respondent','already_upgraded')),
  created_at timestamptz not null default now(),
  foreign key(campaign,referrer_visitor_id) references beagu_private.challenge_referral_profiles(campaign,visitor_id)
);
create unique index if not exists challenge_referral_one_respondent_credit
  on beagu_private.challenge_referral_events(campaign,respondent_sha256)
  where decision='credited';
create index if not exists challenge_referral_events_owner_idx
  on beagu_private.challenge_referral_events(campaign,referrer_visitor_id,created_at desc);

alter table beagu_private.challenge_referral_settings enable row level security;
alter table beagu_private.challenge_referral_profiles enable row level security;
alter table beagu_private.challenge_referral_events enable row level security;
revoke all on beagu_private.challenge_referral_settings from public,anon,authenticated;
revoke all on beagu_private.challenge_referral_profiles from public,anon,authenticated;
revoke all on beagu_private.challenge_referral_events from public,anon,authenticated;

-- For revocation/rotation we associate new sessions with the owner; legacy sessions remain unchanged.
alter table public.beagu_level_sessions
  add column if not exists identity_campaign text,
  add column if not exists identity_visitor_id uuid;

create or replace function public.beagu_referral_enroll(
  p_visitor uuid,p_identity_code text,p_referral_hash text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare p beagu_private.challenge_referral_profiles%rowtype;
begin
  if p_visitor is null or p_identity_code is null or p_referral_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid enrollment' using errcode='22023'; end if;
  if not exists (
    select 1 from beagu_private.challenge_identity_codes c
    where c.campaign='2026' and c.visitor_id=p_visitor and c.identity_code=p_identity_code
  ) then raise exception 'identity mismatch' using errcode='28000'; end if;
  insert into beagu_private.challenge_referral_profiles(
    campaign,visitor_id,identity_code_sha256,referral_token_sha256
  ) values('2026',p_visitor,encode(extensions.digest(p_identity_code,'sha256'),'hex'),p_referral_hash)
  on conflict(campaign,visitor_id) do nothing;
  select * into p from beagu_private.challenge_referral_profiles
  where campaign='2026' and visitor_id=p_visitor;
  if not found or p.disabled or
    p.identity_code_sha256<>encode(extensions.digest(p_identity_code,'sha256'),'hex')
    or p.referral_token_sha256<>p_referral_hash
  then raise exception 'enrollment unavailable' using errcode='28000'; end if;
  return jsonb_build_object('level',p.access_level,'validReferrals',p.valid_referrals);
end $$;

-- A sheet-submission event is idempotent, and each (peppered) device UUID can earn
-- at most one referral credit even when several referral links were submitted.
create or replace function public.beagu_referral_credit(
 p_event_hash text,p_referral_hash text,p_respondent_hash text,p_respondent_uuid uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare p beagu_private.challenge_referral_profiles%rowtype;
        old_event beagu_private.challenge_referral_events%rowtype;
        outcome text;
begin
 if coalesce((select enabled from beagu_private.challenge_referral_settings where name='ingest_enabled'),false)=false
 then raise exception 'ingest disabled' using errcode='42501'; end if;
 if p_event_hash !~ '^[0-9a-f]{64}$' or p_referral_hash !~ '^[0-9a-f]{64}$'
  or p_respondent_hash !~ '^[0-9a-f]{64}$' or p_respondent_uuid is null
 then raise exception 'invalid event' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_event_hash),2602);
 select * into old_event from beagu_private.challenge_referral_events
 where event_sha256=p_event_hash;
 if found then return jsonb_build_object('credited',false,'decision','duplicate_event'); end if;
 select * into p from beagu_private.challenge_referral_profiles
 where referral_token_sha256=p_referral_hash and campaign='2026' for update;
 if not found or p.disabled then
   outcome:='invalid_link';
 elsif p.visitor_id=p_respondent_uuid then
   outcome:='same_device';
 elsif p.access_level=2 then
   outcome:='already_upgraded';
 else
   -- Locks prevent two simultaneous events from crediting the same device.
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_respondent_hash),2603);
   if exists(select 1 from beagu_private.challenge_referral_events
      where campaign='2026' and respondent_sha256=p_respondent_hash and decision='credited')
   then outcome:='duplicate_respondent';
   else outcome:='credited'; end if;
 end if;
 insert into beagu_private.challenge_referral_events
 (event_sha256,campaign,referral_token_sha256,respondent_sha256,referrer_visitor_id,decision)
 values(p_event_hash,'2026',p_referral_hash,p_respondent_hash,
   case when p.visitor_id is null then null else p.visitor_id end,outcome);
 if outcome='credited' then
    update beagu_private.challenge_referral_profiles
       set access_level=2,valid_referrals=1,upgraded_at=now()
    where campaign='2026' and visitor_id=p.visitor_id and access_level=1;
 end if;
 return jsonb_build_object('credited',outcome='credited','decision',outcome);
end $$;

create or replace function public.beagu_referral_auth(p_identity_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare p beagu_private.challenge_referral_profiles%rowtype;
begin
 if coalesce((select enabled from beagu_private.challenge_referral_settings where name='login_enabled'),false)=false
 then return null; end if;
 if p_identity_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 select * into p from beagu_private.challenge_referral_profiles
 where identity_code_sha256=p_identity_hash and disabled=false;
 if not found then return null; end if;
 return jsonb_build_object('level',p.access_level,'visitor',p.visitor_id,'campaign',p.campaign);
end $$;

-- Feature flags are deliberately false. The second phase must audit existing
-- challenge-identity IDOR before setting login_enabled or public_enabled=true.
revoke all on function public.beagu_referral_enroll(uuid,text,text) from public,anon,authenticated;
revoke all on function public.beagu_referral_credit(text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.beagu_referral_auth(text) from public,anon,authenticated;
grant execute on function public.beagu_referral_enroll(uuid,text,text) to service_role;
grant execute on function public.beagu_referral_credit(text,text,text,uuid) to service_role;
grant execute on function public.beagu_referral_auth(text) to service_role;
