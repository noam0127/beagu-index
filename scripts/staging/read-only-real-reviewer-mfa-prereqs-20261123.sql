-- READ-ONLY actual MFA readiness evidence, test Supabase ONLY.
-- DO NOT interpret synthetic aal2 rows as proof of real MFA; this query must
-- be run outside every QA rollback transaction, after any fixtures are gone.
WITH enabled_owners AS (
  SELECT a.user_id
  FROM public.beagu_admin_accounts a
  JOIN auth.users u ON u.id=a.user_id
  WHERE a.enabled AND a.role='owner'
), verified_owner_factors AS (
  SELECT DISTINCT f.user_id
  FROM auth.mfa_factors f
  JOIN enabled_owners o ON o.user_id=f.user_id
  WHERE f.status::text='verified'
), active_owner_aal2 AS (
  SELECT DISTINCT s.user_id
  FROM auth.sessions s
  JOIN enabled_owners o ON o.user_id=s.user_id
  JOIN verified_owner_factors f ON f.user_id=s.user_id
  WHERE s.aal::text='aal2' AND (s.not_after IS NULL OR s.not_after>now())
)
SELECT
 (SELECT count(*) FROM auth.users) AS auth_users,
 (SELECT count(*) FROM enabled_owners) AS enabled_owner_accounts,
 (SELECT count(*) FROM verified_owner_factors) AS owners_with_verified_mfa_factors,
 (SELECT count(*) FROM active_owner_aal2) AS owners_with_active_aal2_sessions,
 CASE
  WHEN (SELECT count(*) FROM enabled_owners)>0
   AND (SELECT count(*) FROM verified_owner_factors)>0
   AND (SELECT count(*) FROM active_owner_aal2)>0
  THEN 'ELIGIBLE_FOR_MANUAL_REAL_JWT_BROWSER_CHECK'
  ELSE 'BLOCKED_REAL_MFA_OWNER_ACCOUNT_NOT_CONFIGURED'
 END AS actual_mfa_http_e2e_gate,
 'NOTE: valid Auth MFA factor plus aal2 session still require real JWT and browser E2E' AS evidence_limit;
