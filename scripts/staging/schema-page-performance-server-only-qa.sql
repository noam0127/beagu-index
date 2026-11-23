-- 2026-11-23 ISOLATED STAGING ONLY ycwuugggqbunlbwuzvbx.
-- Browser RUM on the development branch now targets the bounded staging
-- beagu-perf-ingest-v1 Edge API instead of this SECURITY DEFINER RPC.
-- No permission changes on the operating Supabase project.
REVOKE ALL ON FUNCTION public.beagu_perf_record_v1(uuid,text,text,integer,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_perf_record_v1(uuid,text,text,integer,boolean)
  TO service_role;
NOTIFY pgrst,'reload schema';
