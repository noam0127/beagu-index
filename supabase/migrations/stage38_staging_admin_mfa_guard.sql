-- Stage38 isolated staging only: extract the MFA guard from the production migration.
-- Intentionally omit unrelated telemetry triggers whose dependencies are not installed.
CREATE OR REPLACE FUNCTION public.beagu_admin_active_mfa_session(p_user uuid,p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT EXISTS(SELECT 1 FROM auth.sessions s
 WHERE s.user_id=p_user AND s.id=p_session AND s.aal::text='aal2'
 AND (s.not_after IS NULL OR s.not_after>now()))
$function$;
REVOKE ALL ON FUNCTION public.beagu_admin_active_mfa_session(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_admin_active_mfa_session(uuid,uuid) TO service_role;
COMMENT ON FUNCTION public.beagu_admin_active_mfa_session(uuid,uuid) IS 'Service-only: live AAL2 Auth session guard';
