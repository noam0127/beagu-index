-- PREVIEW ONLY. Review and convert into an official migration before deployment.
begin;
create table if not exists public.beagu_lv3_accounts (
  account_id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null unique,
  lookup text not null unique check (lookup ~ '^[a-f0-9]{64}$'),
  salt text not null check (salt ~ '^[a-f0-9]{64}$'),
  verifier text not null check (verifier ~ '^[a-f0-9]{64}$'),
  version integer not null check (version = 1),
  created_at timestamptz not null default now()
);
alter table public.beagu_lv3_accounts enable row level security;
revoke all on public.beagu_lv3_accounts from public, anon, authenticated;
grant select, insert on public.beagu_lv3_accounts to service_role;
alter table public.beagu_level_sessions add column if not exists level3_account_id uuid
  references public.beagu_lv3_accounts(account_id);
-- Existing sessions and their existing Lv.2 data access are deliberately unchanged.
create or replace function public.beagu_lv3_register_v1(
  p_session text, p_lookup text, p_salt text, p_verifier text,
  p_new_session text, p_expiry timestamptz
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_visitor uuid;
  v_account uuid;
begin
  select identity_visitor_id into v_visitor
    from public.beagu_level_sessions
    where token_sha256=p_session and access_level=2 and identity_campaign='2026'
      and expires_at>now() and level3_account_id is null for update;
  if v_visitor is null or not public.beagu_has_earned_challenge_visitor(v_visitor)
    then raise exception 'LEVEL_REQUIRED' using errcode='28000'; end if;
  insert into public.beagu_lv3_accounts(visitor_id,lookup,salt,verifier,version)
    values(v_visitor,p_lookup,p_salt,p_verifier,1) returning account_id into v_account;
  insert into public.beagu_level_sessions(token_sha256,access_level,expires_at,identity_campaign,identity_visitor_id,level3_account_id)
    values(p_new_session,2,p_expiry,'2026',v_visitor,v_account);
  return v_account;
end $$;
revoke all on function public.beagu_lv3_register_v1(text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.beagu_lv3_register_v1(text,text,text,text,text,timestamptz) to service_role;
commit;
