-- Stage 17 DRAFT (no production/staging DB execution).
-- Prerequisites: verified encrypted backup & isolated restore, actual Google
-- Forms response source -> pseudonymous challenge visitor mapping, and trusted
-- webhook quality attestation. No legacy code or challenge number is rewritten.
begin;

create table if not exists beagu_private.challenge_2026_verified_responses_v1 (
 campaign text not null default '2026' check (campaign='2026'),
 visitor_id uuid not null,
 source_evidence_hmac text not null unique
  check (source_evidence_hmac ~ '^[0-9a-f]{64}$'),
 verification_status text not null
  check(verification_status in ('approved','revoked','review_required')),
 verified_at timestamptz not null,
 source_kind text not null default '2026_google_forms_verified'
  check(source_kind='2026_google_forms_verified'),
 recorded_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(campaign,visitor_id),
 foreign key (campaign,visitor_id)
   references beagu_private.challenge_identity_codes(campaign,visitor_id)
   on delete restrict
);
alter table beagu_private.challenge_2026_verified_responses_v1
 enable row level security;
revoke all on beagu_private.challenge_2026_verified_responses_v1
 from public,anon,authenticated;
grant select,insert,update on beagu_private.challenge_2026_verified_responses_v1
 to service_role;

create table if not exists beagu_private.challenge_2026_verification_events_v1 (
 id bigint generated always as identity primary key,
 campaign text not null default '2026' check(campaign='2026'),
 visitor_id uuid not null,
 decision text not null check(decision in ('approved','revoked','review_required')),
 source_evidence_hmac text not null
  check(source_evidence_hmac ~ '^[0-9a-f]{64}$'),
 occurred_at timestamptz not null default now(),
 foreign key(campaign,visitor_id)
  references beagu_private.challenge_2026_verified_responses_v1(campaign,visitor_id)
  on delete cascade
);
create index if not exists beagu_2026_verified_event_visitor_idx
 on beagu_private.challenge_2026_verification_events_v1(campaign,visitor_id,occurred_at desc);
alter table beagu_private.challenge_2026_verification_events_v1
 enable row level security;
revoke all on beagu_private.challenge_2026_verification_events_v1
 from public,anon,authenticated;
grant select,insert on beagu_private.challenge_2026_verification_events_v1
 to service_role;

-- ONLY invoke from a dedicated server-to-server Google Form submission worker.
-- The Edge function validates a dedicated 32-byte secret, an approved
-- source-row token and 2026 survey quality before calling this RPC.
-- Identifiers, visit counts, code issuance, referral links, and manual browser
-- declarations are NOT a substitute for trusted source attestation.
create or replace function public.beagu_2026_record_verified_response_v1(
 p_visitor uuid,
 p_evidence_hmac text,
 p_verified_at timestamptz,
 p_status text
) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare
 v_old beagu_private.challenge_2026_verified_responses_v1%rowtype;
begin
 if p_visitor is null
   or p_evidence_hmac is null or p_evidence_hmac !~ '^[0-9a-f]{64}$'
   or p_verified_at is null
   or p_verified_at < '2026-01-01T00:00:00Z'::timestamptz
   or p_verified_at > now()+interval '5 minutes'
   or p_status is null
   or p_status not in ('approved','revoked','review_required')
 then return pg_catalog.jsonb_build_object('ok',false,'code','INVALID_SOURCE_EVIDENCE');end if;
 if not exists(
   select 1 from beagu_private.challenge_identity_codes c
   where c.campaign='2026' and c.visitor_id=p_visitor
 ) then return pg_catalog.jsonb_build_object('ok',false,'code','UNKNOWN_VISITOR');end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_visitor::text),2617);
 select * into v_old from beagu_private.challenge_2026_verified_responses_v1
 where campaign='2026' and visitor_id=p_visitor for update;
 if found and v_old.source_evidence_hmac<>p_evidence_hmac then
   return pg_catalog.jsonb_build_object('ok',false,'code','EVIDENCE_CONFLICT');
 end if;
 if found and v_old.verification_status=p_status then
   return pg_catalog.jsonb_build_object('ok',true,'status',p_status,'duplicate',true);
 end if;
 -- Unique evidence hash blocks recycling one verified survey response to
 -- multiple visitor accounts even in concurrent requests.
 insert into beagu_private.challenge_2026_verified_responses_v1(
  campaign,visitor_id,source_evidence_hmac,verification_status,verified_at
 ) values('2026',p_visitor,p_evidence_hmac,p_status,p_verified_at)
 on conflict(campaign,visitor_id)
 do update set verification_status=excluded.verification_status,
   updated_at=now(),
   verified_at=excluded.verified_at;
 insert into beagu_private.challenge_2026_verification_events_v1(
  campaign,visitor_id,decision,source_evidence_hmac
 ) values('2026',p_visitor,p_status,p_evidence_hmac);
 return pg_catalog.jsonb_build_object('ok',true,'status',p_status,'duplicate',false);
end;
$fn$;
revoke all on function public.beagu_2026_record_verified_response_v1(uuid,text,timestamptz,text)
 from public,anon,authenticated;
grant execute on function public.beagu_2026_record_verified_response_v1(uuid,text,timestamptz,text)
 to service_role;

-- Single authoritative tier resolver; OWN 2026 verified response is required
-- for both tiers. Lv2 additionally requires a current, non-disabled referral
-- profile AND an actually credited event with approved quality.
create or replace function public.beagu_2026_verified_visitor_level_v1(p_visitor uuid)
returns smallint
language sql stable security definer set search_path='' as $fn$
 select case
  when p_visitor is null or not exists(
   select 1 from beagu_private.challenge_2026_verified_responses_v1 v
   where v.campaign='2026' and v.visitor_id=p_visitor
    and v.verification_status='approved'
  ) then 0::smallint
  when exists(
   select 1 from beagu_private.challenge_referral_profiles p
   join beagu_private.challenge_identity_codes c
    on c.campaign=p.campaign and c.visitor_id=p.visitor_id
    and p.identity_code_sha256=pg_catalog.encode(
      extensions.digest(c.identity_code,'sha256'),'hex')
   where p.campaign='2026' and p.visitor_id=p_visitor
    and p.disabled=false and p.access_level>=2
    and p.valid_referrals>=1 and p.upgraded_at is not null
    and exists(
     select 1 from beagu_private.challenge_referral_events e
     join beagu_private.challenge_referral_quality_reviews q
      on q.event_sha256=e.event_sha256
     where e.campaign='2026' and e.referrer_visitor_id=p_visitor
      and e.referral_token_sha256=p.referral_token_sha256
      and e.decision='credited'
      and (q.quality_status='MANUALLY_APPROVED'
        or (q.quality_status='AUTO_PASS' and q.form_quality_attested=true))
    )
  ) then 2::smallint
  else 1::smallint end
$fn$;
revoke all on function public.beagu_2026_verified_visitor_level_v1(uuid)
 from public,anon,authenticated;
grant execute on function public.beagu_2026_verified_visitor_level_v1(uuid)
 to service_role;

-- Return a known code at level 0 (not merely NULL) so it cannot fall through
-- to the legacy code table even in the unlikely event of a hash collision.
-- Keep all previously issued identity_code strings byte-for-byte unchanged.
create or replace function public.beagu_2026_verified_code_level_v1(p_code text)
returns jsonb
language sql stable security definer set search_path='' as $fn$
 select pg_catalog.jsonb_build_object(
  'known',true,'visitor',c.visitor_id,
  'level',public.beagu_2026_verified_visitor_level_v1(c.visitor_id)
 )
 from beagu_private.challenge_identity_codes c
 where c.campaign='2026' and c.identity_code=p_code
 limit 1
$fn$;
revoke all on function public.beagu_2026_verified_code_level_v1(text)
 from public,anon,authenticated;
grant execute on function public.beagu_2026_verified_code_level_v1(text)
 to service_role;

-- Retire OLD referral-only privilege shortcuts while preserving the RPC
-- names used by protected Post-it/release endpoints.
create or replace function public.beagu_has_earned_challenge_visitor(p_visitor uuid)
returns boolean
language sql stable security definer set search_path='' as $fn$
 select public.beagu_2026_verified_visitor_level_v1(p_visitor)>=2
$fn$;
revoke all on function public.beagu_has_earned_challenge_visitor(uuid)
 from public,anon,authenticated;
grant execute on function public.beagu_has_earned_challenge_visitor(uuid)
 to service_role;

create or replace function public.beagu_earned_challenge_visitor(p_code text)
returns uuid
language sql stable security definer set search_path='' as $fn$
 select c.visitor_id
 from beagu_private.challenge_identity_codes c
 where c.campaign='2026' and c.identity_code=p_code
  and public.beagu_2026_verified_visitor_level_v1(c.visitor_id)>=2
 limit 1
$fn$;
revoke all on function public.beagu_earned_challenge_visitor(text)
 from public,anon,authenticated;
grant execute on function public.beagu_earned_challenge_visitor(text)
 to service_role;

comment on table beagu_private.challenge_2026_verified_responses_v1 is
 'Verified 2026 individual response evidence only, never raw Google Form contents. No existing rows auto-approved.';
comment on function public.beagu_2026_verified_code_level_v1(text) is
 'Private canonical level evaluator: unverified code 0, own 2026 response 1, credited quality-approved referral 2.';

commit;
