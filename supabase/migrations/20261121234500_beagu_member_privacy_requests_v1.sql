-- Stage 16 draft only. Requires verified encrypted off-site backup,
-- isolated restore and explicit release approval before database deployment.
-- Never auto-delete auth.users: several review/audit FKs are NO ACTION.
begin;

create table if not exists beagu_private.member_privacy_requests_v1 (
  request_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('access','deletion')),
  status text not null default 'pending'
    check(status in ('pending','processing','blocked','completed','cancelled')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint privacy_resolution_consistent_v1 check(
    (status in ('completed','cancelled','blocked') and resolved_at is not null)
    or (status in ('pending','processing') and resolved_at is null)
  )
);
create unique index if not exists member_privacy_active_one_v1
 on beagu_private.member_privacy_requests_v1(user_id,kind)
 where status in ('pending','processing');
create index if not exists member_privacy_user_created_v1
 on beagu_private.member_privacy_requests_v1(user_id,requested_at desc);
alter table beagu_private.member_privacy_requests_v1 enable row level security;
revoke all on beagu_private.member_privacy_requests_v1
 from public,anon,authenticated;
grant select,insert,update on beagu_private.member_privacy_requests_v1
 to service_role;

-- Registered browser identities cannot invoke the private functions.
-- Every action must be tied to a VERIFIED auth.getUser(jwt) id and a live
-- Auth session; Supabase Edge uses service_role only.
create or replace function public.beagu_member_live_session_v1(
 p_user uuid,p_session uuid
) returns boolean
language sql stable security definer set search_path='' as $fn$
 select exists(
   select 1 from auth.sessions s
   where s.id=p_session and s.user_id=p_user
     and (s.not_after is null or s.not_after>now())
 )
$fn$;
revoke all on function public.beagu_member_live_session_v1(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.beagu_member_live_session_v1(uuid,uuid)
 to service_role;

create or replace function public.beagu_member_privacy_status_v1(p_user uuid)
returns jsonb
language sql stable security definer set search_path='' as $fn$
 select coalesce(
  (select jsonb_object_agg(kind,jsonb_build_object(
      'status',status,
      'requestedAt',requested_at,
      'updatedAt',updated_at
    )) from (
      select distinct on (r.kind) r.kind,r.status,r.requested_at,r.updated_at
      from beagu_private.member_privacy_requests_v1 r
      where r.user_id=p_user
      order by r.kind,r.requested_at desc
    ) q),
  '{}'::jsonb
 )
$fn$;
revoke all on function public.beagu_member_privacy_status_v1(uuid)
 from public,anon,authenticated;
grant execute on function public.beagu_member_privacy_status_v1(uuid)
 to service_role;

create or replace function public.beagu_member_privacy_request_v1(
 p_user uuid,p_kind text,p_request uuid
) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare
 id uuid;
begin
 if p_user is null or p_request is null or p_kind is null or p_kind not in ('access','deletion')
 then return jsonb_build_object('ok',false,'code','INVALID_REQUEST');end if;
 if not exists (
   select 1 from auth.users u where u.id=p_user
      and u.email_confirmed_at is not null and u.is_anonymous is not true
 ) then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED');end if;
 -- Administrator accounts must be handled through a separate audited
 -- owner/delegation procedure, not self-service destructive requests.
 if exists(select 1 from public.beagu_admin_accounts a
    where a.user_id=p_user)
 then return jsonb_build_object('ok',false,'code','ADMIN_REVIEW_REQUIRED');end if;
 if (select count(*) from beagu_private.member_privacy_requests_v1
     where user_id=p_user and kind=p_kind
       and requested_at>now()-interval '24 hours')>=5
 then return jsonb_build_object('ok',false,'code','TOO_MANY_REQUESTS');end if;
 insert into beagu_private.member_privacy_requests_v1(
   request_id,user_id,kind,status
 ) values(p_request,p_user,p_kind,'pending')
 on conflict (user_id,kind) where status in ('pending','processing')
 do nothing
 returning request_id into id;
 if id is null then
   return jsonb_build_object('ok',true,'status','already_pending');
 end if;
 return jsonb_build_object('ok',true,'status','pending');
end;
$fn$;
revoke all on function public.beagu_member_privacy_request_v1(uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.beagu_member_privacy_request_v1(uuid,text,uuid)
 to service_role;

create or replace function public.beagu_member_privacy_cancel_v1(
 p_user uuid,p_kind text
) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare
 updated_count int;
begin
 if p_user is null or p_kind is null or p_kind not in ('access','deletion')
 then return jsonb_build_object('ok',false,'code','INVALID_REQUEST');end if;
 update beagu_private.member_privacy_requests_v1
  set status='cancelled',updated_at=now(),resolved_at=now()
 where user_id=p_user and kind=p_kind and status='pending';
 get diagnostics updated_count = row_count;
 if updated_count=1 then
   return jsonb_build_object('ok',true,'status','cancelled');end if;
 if exists (
  select 1 from beagu_private.member_privacy_requests_v1
  where user_id=p_user and kind=p_kind and status='processing'
 ) then return jsonb_build_object('ok',false,'code','PROCESSING');end if;
 return jsonb_build_object('ok',false,'code','NOT_PENDING');
end;
$fn$;
revoke all on function public.beagu_member_privacy_cancel_v1(uuid,text)
 from public,anon,authenticated;
grant execute on function public.beagu_member_privacy_cancel_v1(uuid,text)
 to service_role;

comment on table beagu_private.member_privacy_requests_v1 is
 'Server-verified account access/deletion request queue; no phone, email, raw JWT, password or content; no automatic Auth user deletion.';
comment on function public.beagu_member_privacy_request_v1(uuid,text,uuid) is
 'Service-only; caller authenticated via Auth getUser + live session at Edge layer; queue, never delete user.';

commit;
