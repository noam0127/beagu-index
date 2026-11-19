-- Follow-up guard for already-applied phase-1 migration.
-- Even a premature Edge deployment cannot enroll users while public_enabled=false.
create or replace function public.beagu_referral_enroll(
  p_visitor uuid,p_identity_code text,p_referral_hash text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare p beagu_private.challenge_referral_profiles%rowtype;
begin
  if coalesce((select enabled from beagu_private.challenge_referral_settings
               where name='public_enabled'),false)=false
  then raise exception 'referral not yet enabled' using errcode='42501'; end if;
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


revoke all on function public.beagu_referral_enroll(uuid,text,text) from public,anon,authenticated;
grant execute on function public.beagu_referral_enroll(uuid,text,text) to service_role;
