-- Stage 19. CODE/ISOLATED-TEST DRAFT ONLY; DO NOT APPLY TO LIVE DB.
-- Preconditions before activation: encrypted backup+isolated restore, verified
-- 2026 Form attribution/backfill, tested original-device ownership and
-- administrator-approved release. OFF BY DEFAULT. No Lv3 elevation at install.
begin;

create table if not exists beagu_private.lv3_release_control_v1 (
 singleton boolean primary key default true check(singleton=true),
 enabled boolean not null default false,
 approved_at timestamptz,
 approved_by uuid references auth.users(id) on delete set null,
 reason text,
 updated_at timestamptz not null default now(),
 constraint lv3_requires_explicit_release_approval_v1
  check(not enabled or (approved_at is not null and approved_by is not null
    and reason is not null and length(reason)>=20))
);
insert into beagu_private.lv3_release_control_v1(singleton,enabled)
 values(true,false) on conflict(singleton) do nothing;
alter table beagu_private.lv3_release_control_v1 enable row level security;
revoke all on beagu_private.lv3_release_control_v1
 from public,anon,authenticated;
grant select on beagu_private.lv3_release_control_v1 to service_role;
-- Do not grant UPDATE to the Edge service role: only a separately approved
-- SQL release process can enable Lv3 after all launch gates are verified.

create table if not exists beagu_private.lv3_member_sessions_v1 (
 token_sha256 text primary key check(token_sha256 ~ '^[a-f0-9]{64}$'),
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 visitor_id uuid not null,
 auth_session_id uuid not null,
 issued_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 constraint lv3_session_duration_v1
  check(expires_at>issued_at and expires_at<=issued_at+interval '30 minutes'),
 foreign key(auth_user_id,visitor_id)
  references beagu_private.member_lv3_identity_links_v1(auth_user_id,visitor_id)
  on delete cascade
);
create index if not exists lv3_session_owner_time_v1
 on beagu_private.lv3_member_sessions_v1(auth_user_id,issued_at desc);
create index if not exists lv3_session_live_v1
 on beagu_private.lv3_member_sessions_v1(auth_user_id,auth_session_id)
 where revoked_at is null;
alter table beagu_private.lv3_member_sessions_v1 enable row level security;
revoke all on beagu_private.lv3_member_sessions_v1
 from public,anon,authenticated;
grant select,insert,update on beagu_private.lv3_member_sessions_v1
 to service_role;

-- Each protected feature calls this RPC, never trusts "3" from a UI or JWT.
-- The CURRENT own survey, quality-approved referral, Auth session and exclusive
-- link all remain mandatory, including after account issuance.
create or replace function public.beagu_lv3_verify_session_v1(
 p_hash text,p_user uuid,p_auth_session uuid,p_visitor uuid
) returns boolean
language sql stable security definer set search_path='' as $fn$
 select p_hash ~ '^[a-f0-9]{64}$' and p_user is not null
   and p_auth_session is not null and p_visitor is not null
   and exists(
     select 1 from beagu_private.lv3_release_control_v1 c
     where c.singleton and c.enabled
       and c.approved_by is not null and c.approved_at is not null
   )
   and public.beagu_member_live_session_v1(p_user,p_auth_session)
   and public.beagu_lv3_link_status_v1(
     p_user,p_visitor,
     (select l.author_uid from beagu_private.member_lv3_identity_links_v1 l
       where l.auth_user_id=p_user and l.visitor_id=p_visitor
         and l.link_status='linked')
   )
   and exists(
     select 1 from beagu_private.lv3_member_sessions_v1 s
     where s.token_sha256=p_hash and s.auth_user_id=p_user
       and s.visitor_id=p_visitor and s.auth_session_id=p_auth_session
       and s.revoked_at is null and s.expires_at>now()
   )
$fn$;
revoke all on function public.beagu_lv3_verify_session_v1(text,uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.beagu_lv3_verify_session_v1(text,uuid,uuid,uuid)
 to service_role;

-- The Edge validates a real Supabase JWT AND a distinct issued 2026 Lv2
-- session before invoking this service-only function. The opaque token is
-- generated using WebCrypto on the server; only its SHA-256 digest is stored.
create or replace function public.beagu_lv3_issue_session_v1(
 p_hash text,p_user uuid,p_auth_session uuid,p_visitor uuid
) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare
 v_now timestamptz:=now();
 v_expiry timestamptz;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
 or p_user is null or p_auth_session is null or p_visitor is null then
  return pg_catalog.jsonb_build_object('ok',false,'reason','INVALID_PROOF');
 end if;
 if not exists(
   select 1 from beagu_private.lv3_release_control_v1 c
   where c.singleton and c.enabled and c.approved_at is not null
     and c.approved_by is not null
 ) then
  return pg_catalog.jsonb_build_object('ok',false,'reason','NOT_RELEASED');
 end if;
 if not public.beagu_member_live_session_v1(p_user,p_auth_session)
 or not public.beagu_lv3_link_status_v1(
   p_user,p_visitor,
   (select l.author_uid from beagu_private.member_lv3_identity_links_v1 l
    where l.auth_user_id=p_user and l.visitor_id=p_visitor
      and l.link_status='linked')
 ) then
  return pg_catalog.jsonb_build_object('ok',false,'reason','NOT_ELIGIBLE');
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtext(p_user::text),19019);
 -- Limit issuance/churn even across browsers, without storing raw login data.
 if (select count(*) from beagu_private.lv3_member_sessions_v1 s
  where s.auth_user_id=p_user
    and s.issued_at>v_now-interval '1 hour')>=6 then
  return pg_catalog.jsonb_build_object('ok',false,'reason','RATE_LIMITED');
 end if;
 -- Re-check eligibility under the account lock before replacing live tokens.
 if not public.beagu_member_live_session_v1(p_user,p_auth_session)
 or not public.beagu_lv3_link_status_v1(
   p_user,p_visitor,
   (select l.author_uid from beagu_private.member_lv3_identity_links_v1 l
    where l.auth_user_id=p_user and l.visitor_id=p_visitor
      and l.link_status='linked')
 ) then
  return pg_catalog.jsonb_build_object('ok',false,'reason','NOT_ELIGIBLE');
 end if;
 update beagu_private.lv3_member_sessions_v1 s
  set revoked_at=v_now
  where s.auth_user_id=p_user and s.revoked_at is null;
 v_expiry:=v_now+interval '30 minutes';
 insert into beagu_private.lv3_member_sessions_v1(
  token_sha256,auth_user_id,visitor_id,auth_session_id,
  issued_at,expires_at
 ) values(p_hash,p_user,p_visitor,p_auth_session,v_now,v_expiry);
 return pg_catalog.jsonb_build_object(
  'ok',true,'level',3,'expiresAt',v_expiry);
end;
$fn$;
revoke all on function public.beagu_lv3_issue_session_v1(text,uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.beagu_lv3_issue_session_v1(text,uuid,uuid,uuid)
 to service_role;

create or replace function public.beagu_lv3_revoke_session_v1(
 p_hash text,p_user uuid,p_auth_session uuid
) returns boolean
language plpgsql security definer set search_path='' as $fn$
declare count_changed integer;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
 or p_user is null or p_auth_session is null
 or not public.beagu_member_live_session_v1(p_user,p_auth_session)
 then return false;end if;
 update beagu_private.lv3_member_sessions_v1 s
 set revoked_at=now()
 where s.token_sha256=p_hash and s.auth_user_id=p_user
   and s.auth_session_id=p_auth_session and s.revoked_at is null;
 get diagnostics count_changed=row_count;
 return count_changed=1;
end;
$fn$;
revoke all on function public.beagu_lv3_revoke_session_v1(text,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.beagu_lv3_revoke_session_v1(text,uuid,uuid)
 to service_role;

comment on table beagu_private.lv3_release_control_v1 is
 'Explicit gate OFF by default; no automatic Lv3 grant from migration or login. Enable only after independent launch approval.';
comment on function public.beagu_lv3_verify_session_v1(text,uuid,uuid,uuid) is
 'Service-role-only authoritative Lv3 check for future protected endpoints. Never trust a client badge or JWT user_metadata.';

commit;
