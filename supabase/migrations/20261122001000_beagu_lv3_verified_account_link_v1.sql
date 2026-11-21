-- Stage 18 DRAFT: Lv2 owner-verified Auth linkage for FUTURE Lv3.
-- Depends on stage 16 live-session RPC and stage 17 verified own 2026 survey.
-- NO Lv3 grant, no production deployment without verified DB backup/restore.
begin;

create table if not exists beagu_private.member_lv3_identity_links_v1(
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 campaign text not null default '2026' check(campaign='2026'),
 visitor_id uuid not null unique,
 author_uid uuid not null unique,
 link_status text not null default 'linked'
   check(link_status in ('linked','suspended','revoked')),
 linked_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(campaign,visitor_id)
  references beagu_private.challenge_identity_codes(campaign,visitor_id)
  on delete restrict
);
alter table beagu_private.member_lv3_identity_links_v1 enable row level security;
revoke all on beagu_private.member_lv3_identity_links_v1
 from public,anon,authenticated;
grant select,insert,update on beagu_private.member_lv3_identity_links_v1
 to service_role;

create table if not exists beagu_private.member_lv3_link_events_v1(
 id bigint generated always as identity primary key,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 visitor_id uuid not null,
 event_kind text not null check(event_kind in ('linked','suspended','revoked')),
 recorded_at timestamptz not null default now(),
 unique(auth_user_id,visitor_id,event_kind)
);
alter table beagu_private.member_lv3_link_events_v1 enable row level security;
revoke all on beagu_private.member_lv3_link_events_v1
 from public,anon,authenticated;
grant select,insert on beagu_private.member_lv3_link_events_v1 to service_role;

-- Retain existing API signature, so the current Post-it UI button continues
-- to work without users having to send code or e-mail to the browser API.
-- Caller Edge MUST verify Supabase Auth getUser(JWT) and the exact active
-- Auth session_id (stage 16 RPC) and bind a VERIFIED Lv2 level session.
-- Lock to enforce two-way 1:1 binding and preserve original author identity.
create or replace function public.beagu_postit_bind_verified_member(
 p_user uuid,p_visitor uuid,p_device_hash text,p_actor uuid
) returns uuid
language plpgsql security definer set search_path='' as $fn$
declare
 previous beagu_private.member_lv3_identity_links_v1%rowtype;
 posted public.beagu_postit_member_accounts%rowtype;
 new_link boolean:=false;
begin
 if p_user is null or p_visitor is null or p_actor is null
   or p_device_hash is null or p_device_hash !~ '^[a-f0-9]{64}$'
 then return null;end if;
 -- Never trust raw_user_meta_data; verify Auth user and actual email flag.
 if not exists(
  select 1 from auth.users a
  where a.id=p_user and a.email_confirmed_at is not null
   and a.is_anonymous is not true
 ) then return null;end if;
 -- Stage 17 verifier requires independently attested OWN 2026 submission,
 -- verified referral event, quality review and active Lv2 profile.
 if public.beagu_2026_verified_visitor_level_v1(p_visitor)<>2
 then return null;end if;
 -- Device proof must be the ORIGINAL challenge device secret, previously
 -- bound by the link issuance flow; do not create a claim here.
 if not exists(
  select 1 from beagu_private.challenge_device_claims d
  where d.campaign='2026' and d.visitor_id=p_visitor
   and d.device_secret_sha256=p_device_hash
 ) then return null;end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_visitor::text),2618);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user::text),2619);
 -- Fail closed if either principal has ever linked a different principal.
 if exists(
   select 1 from beagu_private.member_lv3_identity_links_v1 l
   where (l.auth_user_id=p_user or l.visitor_id=p_visitor)
    and (l.auth_user_id<>p_user or l.visitor_id<>p_visitor
     or l.author_uid<>p_actor or l.link_status<>'linked')
 ) then return null;end if;
 if exists(
   select 1 from public.beagu_postit_member_accounts m
   where (m.auth_user_id=p_user or m.identity_visitor_id=p_visitor)
    and (m.auth_user_id<>p_user or m.identity_visitor_id<>p_visitor
     or m.author_uid<>p_actor or m.status<>'active')
 ) then return null;end if;

 select * into previous
 from beagu_private.member_lv3_identity_links_v1 l
 where l.auth_user_id=p_user for update;
 if not found then
   -- Cross-account/visitor racing insert fails UNIQUE and rolls back whole
   -- transaction; the Edge reports a generic 409, never leaks an owner ID.
   insert into beagu_private.member_lv3_identity_links_v1(
     auth_user_id,campaign,visitor_id,author_uid,link_status)
   values(p_user,'2026',p_visitor,p_actor,'linked');
   new_link:=true;
 end if;
 insert into public.beagu_postit_member_accounts(
   auth_user_id,identity_visitor_id,author_uid,status
 ) values(p_user,p_visitor,p_actor,'active')
 on conflict(auth_user_id) do nothing;
 select * into posted from public.beagu_postit_member_accounts m
 where m.auth_user_id=p_user and m.identity_visitor_id=p_visitor
   and m.author_uid=p_actor and m.status='active';
 if not found then
   -- A partial private claim must not survive an unexpected writer conflict.
   raise exception 'member linkage conflict' using errcode='23505';
 end if;
 if new_link then
  insert into beagu_private.member_lv3_link_events_v1(
    auth_user_id,visitor_id,event_kind
  ) values(p_user,p_visitor,'linked');
 end if;
 return posted.author_uid;
end;
$fn$;
revoke all on function public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid)
 to service_role;

-- Read-only status for future Lv3 authorisation. Binding alone cannot grant
-- Lv3 without a fresh verified 2026 response, referral and email identity.
create or replace function public.beagu_lv3_link_status_v1(
 p_user uuid,p_visitor uuid,p_actor uuid
) returns boolean
language sql stable security definer set search_path='' as $fn$
 select p_user is not null and p_visitor is not null and p_actor is not null
 and public.beagu_2026_verified_visitor_level_v1(p_visitor)=2
 and exists(
  select 1
  from beagu_private.member_lv3_identity_links_v1 l
  join public.beagu_postit_member_accounts p
   on p.auth_user_id=l.auth_user_id
   and p.identity_visitor_id=l.visitor_id
   and p.author_uid=l.author_uid
  join auth.users u on u.id=l.auth_user_id
  where l.auth_user_id=p_user and l.visitor_id=p_visitor
   and l.author_uid=p_actor and l.link_status='linked'
   and p.status='active'
   and u.email_confirmed_at is not null and u.is_anonymous is not true
 )
$fn$;
revoke all on function public.beagu_lv3_link_status_v1(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.beagu_lv3_link_status_v1(uuid,uuid,uuid)
 to service_role;

comment on table beagu_private.member_lv3_identity_links_v1 is
 'Account-to-Lv2-visitor exclusive link only; NOT an automatic Lv3 grant. Browser cannot read or write.';
comment on function public.beagu_lv3_link_status_v1(uuid,uuid,uuid) is
 'Requires Auth + matching verified own 2026 response, quality-credit Lv2 and original writer link. Future level3 eligibility foundation, not level3 itself.';
commit;
