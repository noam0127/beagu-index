-- Beaguindex account/auth groundwork. STAGING FILE ONLY. DO NOT APPLY TO PRODUCTION YET.
-- All features fail closed and no screen or navigation is added.
-- No emails, school data, response answers, passwords, or Auth tokens are copied here.

create table if not exists beagu_private.account_v1_settings (
  name text primary key check (name in ('signup_enabled','login_enabled','registration_enabled','recovery_enabled','account_deletion_enabled')),
  enabled boolean not null default false,
  changed_at timestamptz not null default now()
);
insert into beagu_private.account_v1_settings(name,enabled) values
 ('signup_enabled',false),('login_enabled',false),
 ('registration_enabled',false),('recovery_enabled',false),('account_deletion_enabled',false)
on conflict (name) do nothing;

create table if not exists beagu_private.account_profiles_v1 (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  username_canonical text not null unique
    check (username_canonical ~ '^[a-z][a-z0-9_]{3,19}$'),
  access_level smallint not null default 0 check (access_level between 0 and 2),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists beagu_private.account_login_budgets_v1 (
  key_sha256 text primary key check (key_sha256 ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);

alter table beagu_private.account_v1_settings enable row level security;
alter table beagu_private.account_profiles_v1 enable row level security;
alter table beagu_private.account_login_budgets_v1 enable row level security;
revoke all on beagu_private.account_v1_settings from public, anon, authenticated;
revoke all on beagu_private.account_profiles_v1 from public, anon, authenticated;
revoke all on beagu_private.account_login_budgets_v1 from public, anon, authenticated;

-- Service role access only. Private tables remain outside the public Data API.
grant usage on schema beagu_private to service_role;
grant select on beagu_private.account_v1_settings to service_role;
grant select,insert,update on beagu_private.account_profiles_v1 to service_role;
grant select,insert,update on beagu_private.account_login_budgets_v1 to service_role;

-- SECURITY INVOKER: the caller must be service_role, not a shared anonymous session.
create or replace function public.beagu_account_v1_feature(p_name text)
returns boolean language sql stable security invoker set search_path=''
as $$
  select coalesce((
    select s.enabled from beagu_private.account_v1_settings s where s.name=p_name
  ),false);
$$;

-- Atomic sliding-ish fixed-window budget. Caller passes only a server-side HMAC,
-- never IP/email/username in plaintext. Includes already-successful attempts.
create or replace function public.beagu_account_v1_take_slot(
  p_key_sha256 text,p_limit integer,p_window_seconds integer
) returns boolean language plpgsql volatile security invoker set search_path=''
as $$
declare n integer;
begin
  if p_key_sha256 is null or p_key_sha256 !~ '^[a-f0-9]{64}$'
     or p_limit not between 1 and 1000
     or p_window_seconds not between 60 and 86400
  then raise exception 'invalid rate limit input' using errcode='22023'; end if;
  insert into beagu_private.account_login_budgets_v1
    (key_sha256,window_started_at,attempts)
  values(p_key_sha256,now(),1)
  on conflict(key_sha256) do update
    set attempts=case
      when beagu_private.account_login_budgets_v1.window_started_at +
           make_interval(secs=>p_window_seconds) <= now()
      then 1 else beagu_private.account_login_budgets_v1.attempts+1 end,
      window_started_at=case
      when beagu_private.account_login_budgets_v1.window_started_at +
           make_interval(secs=>p_window_seconds) <= now()
      then now() else beagu_private.account_login_budgets_v1.window_started_at end
  returning attempts into n;
  return n<=p_limit;
end $$;

-- Username is a non-privileged display/login selector, never authority.
-- The Edge Function MUST first call admin.auth.getUser(jwt), verify confirmed
-- email, and bind only the validated user.id; no client-supplied user_id.
create or replace function public.beagu_account_v1_bind(
  p_auth_user_id uuid,p_username text
) returns jsonb language plpgsql volatile security invoker set search_path=''
as $$
declare lvl smallint; normalized text;
begin
  if not coalesce((select enabled from beagu_private.account_v1_settings
                    where name='registration_enabled'),false)
  then raise exception 'registration disabled' using errcode='42501'; end if;
  normalized:=lower(btrim(coalesce(p_username,'')));
  if p_auth_user_id is null or normalized !~ '^[a-z][a-z0-9_]{3,19}$'
  then raise exception 'invalid account' using errcode='22023'; end if;
  insert into beagu_private.account_profiles_v1(auth_user_id,username_canonical)
  values(p_auth_user_id,normalized)
  on conflict(auth_user_id) do update
     set username_canonical=excluded.username_canonical
   where beagu_private.account_profiles_v1.username_canonical=excluded.username_canonical
  returning access_level into lvl;
  if not found then raise exception 'account already bound' using errcode='28000'; end if;
  return jsonb_build_object('registered',true,'username',normalized,'level',lvl);
end $$;

create or replace function public.beagu_account_v1_owner(p_username text)
returns uuid language sql stable security invoker set search_path=''
as $$
  select a.auth_user_id from beagu_private.account_profiles_v1 a
   where a.username_canonical=lower(btrim(p_username)) and a.disabled=false;
$$;

create or replace function public.beagu_account_v1_profile(p_auth_user_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$
  select jsonb_build_object(
    'registered',true,'username',a.username_canonical,
    'level',a.access_level,'disabled',a.disabled)
  from beagu_private.account_profiles_v1 a
  where a.auth_user_id=p_auth_user_id;
$$;

-- Revoke automatic PUBLIC EXECUTE on public-schema functions explicitly.
revoke all on function public.beagu_account_v1_feature(text) from public,anon,authenticated;
revoke all on function public.beagu_account_v1_take_slot(text,integer,integer) from public,anon,authenticated;
revoke all on function public.beagu_account_v1_bind(uuid,text) from public,anon,authenticated;
revoke all on function public.beagu_account_v1_owner(text) from public,anon,authenticated;
revoke all on function public.beagu_account_v1_profile(uuid) from public,anon,authenticated;
grant execute on function public.beagu_account_v1_feature(text) to service_role;
grant execute on function public.beagu_account_v1_take_slot(text,integer,integer) to service_role;
grant execute on function public.beagu_account_v1_bind(uuid,text) to service_role;
grant execute on function public.beagu_account_v1_owner(text) to service_role;
grant execute on function public.beagu_account_v1_profile(uuid) to service_role;

-- This migration deliberately does NOT modify challenge identity APIs,
-- Google Forms/Apps Script, the existing Lv.1 sessions, or referral flags.
