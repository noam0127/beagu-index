-- Staging only: the old binding RPC lacks Auth session identity and private
-- audit. The active Post-it v7 Edge now calls only the audited transition.
-- Disable the old service-role caller to prevent a legacy bypass.
DO $stage$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint c
  WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
    AND c.conname='beagu_2026_results_snapshot_school_id_check'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%'
 ) THEN RAISE EXCEPTION 'REFUSE_NON_ISOLATED_STAGE'; END IF;
END $stage$;
REVOKE ALL ON FUNCTION public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
