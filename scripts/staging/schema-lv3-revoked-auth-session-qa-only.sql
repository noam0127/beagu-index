-- 2026-11-23: isolated QA Supabase ycwuugggqbunlbwuzvbx ONLY.
-- No actual email users or production credentials are created.
-- A valid Auth user/JWT alone must NOT retain member access after sign-out,
-- session expiry or server-side revocation (auth.sessions row removal).
DO $stage$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint c
  WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
    AND c.conname='beagu_2026_results_snapshot_school_id_check'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%'
 ) THEN RAISE EXCEPTION 'REFUSE_NON_ISOLATED_STAGING_DB'; END IF;
END $stage$;

CREATE OR REPLACE FUNCTION public.beagu_stage_active_member_auth_session(
  p_user uuid, p_session uuid
) RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
 SELECT p_user IS NOT NULL AND p_session IS NOT NULL AND EXISTS(
  SELECT 1 FROM auth.sessions s
  WHERE s.id=p_session AND s.user_id=p_user
    AND s.created_at IS NOT NULL AND s.created_at<=now()
    AND (s.not_after IS NULL OR s.not_after>now())
 );
$fn$;

REVOKE ALL ON FUNCTION public.beagu_stage_active_member_auth_session(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_stage_active_member_auth_session(uuid,uuid)
 TO service_role;
NOTIFY pgrst,'reload schema';
