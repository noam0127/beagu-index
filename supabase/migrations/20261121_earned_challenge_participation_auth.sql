-- A challenge identity becomes a Lv2 participation credential ONLY after
-- a verified referral credit. Service-role only; never expose the code or
-- respondent identities through the Data API.
create or replace function public.beagu_earned_challenge_visitor(p_code text)
returns uuid language sql stable security definer set search_path = ''
as $$
 select c.visitor_id
 from beagu_private.challenge_identity_codes c
 join beagu_private.challenge_referral_profiles p
   on p.campaign=c.campaign and p.visitor_id=c.visitor_id
   and p.identity_code_sha256=encode(extensions.digest(c.identity_code,'sha256'),'hex')
 where c.campaign='2026'
   and c.identity_code=p_code
   and p.access_level>=2
   and p.valid_referrals>=1
   and p.upgraded_at is not null
   and p.disabled=false
 limit 1
$$;
revoke all on function public.beagu_earned_challenge_visitor(text) from public, anon, authenticated;
grant execute on function public.beagu_earned_challenge_visitor(text) to service_role;
comment on function public.beagu_earned_challenge_visitor(text) is
 'Server-only earned referral check for Lv2 code-based session issuance. Never validates an unearned identity code.';
