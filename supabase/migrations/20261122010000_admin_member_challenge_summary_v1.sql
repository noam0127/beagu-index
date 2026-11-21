-- Admin-only member/challenge summary; no identity codes or device secrets leave DB.
-- Deploy this migration before deploying the updated Edge Function.
create or replace function public.beagu_admin_member_challenge_summary_v1(p_user uuid)
returns table(link_status text, participant_no bigint, access_level smallint, valid_referrals integer)
language sql stable security definer set search_path = '' as $$
  select m.status,
    case when m.status='active' and coalesce(r.disabled,true)=false and r.access_level>=2
      and r.valid_referrals>=1 then i.participant_no else null end,
    case when m.status='active' and coalesce(r.disabled,true)=false and r.access_level>=2
      and r.valid_referrals>=1 then r.access_level else null end,
    case when m.status='active' and coalesce(r.disabled,true)=false and r.access_level>=2
      and r.valid_referrals>=1 then r.valid_referrals else null end
  from public.beagu_postit_member_accounts m
  left join beagu_private.challenge_identity_codes i
    on i.campaign='2026' and i.visitor_id=m.identity_visitor_id
  left join beagu_private.challenge_referral_profiles r
    on r.campaign='2026' and r.visitor_id=m.identity_visitor_id
  where m.auth_user_id=p_user
  limit 1
$$;
revoke all on function public.beagu_admin_member_challenge_summary_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.beagu_admin_member_challenge_summary_v1(uuid)
  to service_role;
comment on function public.beagu_admin_member_challenge_summary_v1(uuid) is
  'Service-role-only read-only 2026 challenge summary for linked member; no private codes.';
