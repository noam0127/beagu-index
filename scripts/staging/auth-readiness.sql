-- Read-only staging authentication prerequisite inventory.
-- Execute ONLY in Supabase project ycwuugggqbunlbwuzvbx (NOT production).
-- Never copy identities, access tokens, passwords, phone numbers or emails.
-- A positive count means only that the test can START; it is NOT E2E success.
SELECT
  'ycwuugggqbunlbwuzvbx'::text AS stage_ref,
  (SELECT COUNT(*) FROM auth.users)::bigint AS auth_users,
  (SELECT COUNT(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL)::bigint AS confirmed_users,
  (SELECT COUNT(*) FROM auth.mfa_factors WHERE status='verified')::bigint AS verified_mfa_factors,
  (SELECT COUNT(*) FROM public.beagu_admin_accounts
    WHERE enabled=true AND role='owner')::bigint AS enabled_owners,
  (SELECT COUNT(DISTINCT a.user_id)
   FROM public.beagu_admin_accounts a
   JOIN auth.users u ON u.id=a.user_id
   JOIN auth.mfa_factors f ON f.user_id=a.user_id
   WHERE a.enabled=true AND a.role='owner'
     AND u.email_confirmed_at IS NOT NULL
     AND f.status='verified')::bigint AS owner_with_verified_mfa,
  (SELECT COUNT(*) FROM public.beagu_level_codes
    WHERE active=true)::bigint AS active_level_codes,
  (SELECT COUNT(*) FROM beagu_private.challenge_referral_profiles)::bigint
    AS referral_profiles,
  (SELECT COUNT(*) FROM beagu_private.challenge_referral_profiles
    WHERE access_level>=2 AND valid_referrals>=1)::bigint AS earned_lv2_profiles,
  (SELECT COUNT(*) FROM public.beagu_postit_member_accounts)::bigint
    AS linked_member_accounts;
