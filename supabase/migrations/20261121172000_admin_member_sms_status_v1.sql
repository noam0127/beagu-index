-- Service-only summary of optional member SMS consent.
-- Never expose phone numbers or make this RPC callable by browser roles.
CREATE OR REPLACE FUNCTION public.beagu_admin_member_sms_status_v1(p_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  sms_consent boolean,
  phone_verified boolean,
  consented_at timestamptz,
  withdrawn_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.user_id,
         (s.sms_consent IS TRUE AND s.withdrawn_at IS NULL) AS sms_consent,
         (s.phone_verified_at IS NOT NULL) AS phone_verified,
         s.consented_at,
         s.withdrawn_at
  FROM beagu_private.member_sms_subscriptions_v1 AS s
  WHERE s.user_id = ANY(p_ids);
$$;
REVOKE ALL ON FUNCTION public.beagu_admin_member_sms_status_v1(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_admin_member_sms_status_v1(uuid[]) TO service_role;
COMMENT ON FUNCTION public.beagu_admin_member_sms_status_v1(uuid[]) IS
  'Service role only: SMS opt-in and phone verification status, without phone values.';
