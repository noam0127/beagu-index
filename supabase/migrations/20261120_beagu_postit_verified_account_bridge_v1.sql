-- Post-it account authorization bridge for the *future v3 account schema*.
-- DO NOT APPLY before the separately reviewed account_profiles and
-- account_level_profiles tables are installed, secured, and populated via
-- server-verified Lv1 codes and valid Lv2 referral credits.
-- This file does not grant anyone a level or create a user.
--
-- The Edge Function passes ONLY the UID returned by Supabase Auth getUser(jwt).
-- The RPC is SECURITY INVOKER, executable solely by the service role.
-- Anonymous/authenticated clients cannot call it to enumerate account levels.
create or replace function public.beagu_postit_account_access_v1(p_auth_user_id uuid)
returns smallint
language sql
stable
security invoker
set search_path = ''
as $$
  select (
    case
      when a.disabled is true or l.disabled is true then 0
      when l.access_level = 2
       and l.level1_verified_at is not null
       and l.level2_upgraded_at is not null then 2
      when l.access_level >= 1
       and l.level1_verified_at is not null then 1
      else 0
    end
  )::smallint
  from beagu_private.account_profiles a
  join beagu_private.account_level_profiles l
    on l.auth_user_id = a.auth_user_id
  where a.auth_user_id = p_auth_user_id;
$$;

revoke all on function public.beagu_postit_account_access_v1(uuid)
  from PUBLIC, anon, authenticated;
grant execute on function public.beagu_postit_account_access_v1(uuid)
  to service_role;

comment on function public.beagu_postit_account_access_v1(uuid) is
'Private verified account level projection for the Post-it service role. Requires an email-confirmed Supabase Auth JWT checked by the Edge Function; Lv2 must originate from server-verified referral credits.';
