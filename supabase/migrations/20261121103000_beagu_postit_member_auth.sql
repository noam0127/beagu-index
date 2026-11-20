-- Stage 3: verified Supabase Auth account + device-bound earned Lv2 claim.
-- Existing Lv2 reading privileges remain. Writing requires a linked Auth user.
-- Private identity information is not exposed through browser Data API.
create table if not exists public.beagu_postit_member_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  identity_visitor_id uuid not null unique,
  author_uid uuid not null unique,
  status text not null default 'active' check (status in ('active','suspended')),
  linked_at timestamptz not null default now()
);
create index if not exists beagu_postit_members_author_idx
  on public.beagu_postit_member_accounts(author_uid);
alter table public.beagu_postit_member_accounts enable row level security;
revoke all on public.beagu_postit_member_accounts from public,anon,authenticated;
grant select,insert,update on public.beagu_postit_member_accounts to service_role;

-- The caller (Edge Function) MUST first authenticate the Supabase Auth JWT and
-- the server-issued Lv2 token; the database additionally checks the original
-- device proof, credited referral and 1:1 identity ownership atomically.
create or replace function public.beagu_postit_bind_verified_member(
  p_user uuid, p_visitor uuid, p_device_hash text, p_actor uuid
) returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_actor uuid;
begin
  if p_user is null or p_visitor is null or p_actor is null
     or p_device_hash is null or p_device_hash !~ '^[a-f0-9]{64}$'
  then return null; end if;

  if not exists(
    select 1
    from beagu_private.challenge_device_claims d
    join beagu_private.challenge_referral_profiles r
      on r.campaign=d.campaign and r.visitor_id=d.visitor_id
    where d.campaign='2026' and d.visitor_id=p_visitor
      and d.device_secret_sha256=p_device_hash
      and r.access_level>=2 and r.valid_referrals>=1
      and r.upgraded_at is not null and r.disabled=false
  ) then return null; end if;

  insert into public.beagu_postit_member_accounts(
    auth_user_id,identity_visitor_id,author_uid,status
  ) values(p_user,p_visitor,p_actor,'active')
  on conflict(auth_user_id) do nothing;

  select m.author_uid into v_actor
  from public.beagu_postit_member_accounts m
  where m.auth_user_id=p_user
    and m.identity_visitor_id=p_visitor
    and m.author_uid=p_actor and m.status='active';
  return v_actor;
end;
$fn$;
revoke all on function public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid)
  to service_role;
comment on function public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid) is
  'Service-role only. Verified OAuth/email Auth user plus earned Lv2 plus original device proof.';

-- A membership always fails closed when a challenge referral is revoked:
-- the Edge Function revalidates the earned profile on every request.
