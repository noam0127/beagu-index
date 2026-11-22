-- DRAFT MIGRATION, review branch only. DO NOT APPLY TO PRODUCTION WITHOUT
-- explicit release approval, staged security QA, and coordinated Edge deployment.
-- Atomic release job outcome finalization: job state, immutable SHA pointer, and
-- release history commit in a single PostgreSQL transaction.
-- Only an externally verified signed GitHub worker may request finalization
-- through the Edge API AFTER a real deploy succeeded. This SQL deploys nothing.
-- Validated independently in stage38 isolated project with rolled-back fixtures.
CREATE OR REPLACE FUNCTION public.beagu_site_release_finalize_v1(
    p_job_id uuid, p_outcome text, p_deployed_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $atomic_release$
DECLARE
  j public.beagu_site_release_jobs_v1%ROWTYPE;
  s public.beagu_site_release_state_v1%ROWTYPE;
  expected text;
  rows_updated bigint;
BEGIN
  IF p_job_id IS NULL OR p_outcome NOT IN ('deployed','failed') THEN
    RAISE EXCEPTION 'invalid_finalize_arguments' USING ERRCODE='22023';
  END IF;
  -- Lock state and job together; no second worker can update either in parallel.
  SELECT * INTO s FROM public.beagu_site_release_state_v1 WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'release_state_missing' USING ERRCODE='P0002'; END IF;
  SELECT * INTO j FROM public.beagu_site_release_jobs_v1 WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'release_job_missing' USING ERRCODE='P0002'; END IF;
  IF j.status='deployed' AND p_outcome='deployed' THEN
    IF NOT EXISTS (SELECT 1 FROM public.beagu_site_release_history_v1 WHERE job_id=j.id)
      THEN RAISE EXCEPTION 'completed_job_missing_history' USING ERRCODE='23514'; END IF;
    RETURN jsonb_build_object('ok',true,'already_complete',true,'job_id',j.id);
  END IF;
  IF j.status <> 'running' THEN
    RAISE EXCEPTION 'release_job_not_running' USING ERRCODE='23514';
  END IF;
  IF p_outcome='failed' THEN
    UPDATE public.beagu_site_release_jobs_v1
      SET status='failed',error_code='deployment_failed',finished_at=clock_timestamp()
      WHERE id=j.id AND status='running';
    RETURN jsonb_build_object('ok',true,'status','failed','job_id',j.id);
  END IF;
  IF p_deployed_url IS NULL
      OR p_deployed_url !~ '^https://[a-zA-Z0-9.-]+(/[a-zA-Z0-9._~/%-]*)?$' THEN
    RAISE EXCEPTION 'invalid_deployment_url' USING ERRCODE='22023';
  END IF;
  IF j.action IN ('stage_apply','stage_rollback') THEN
    IF j.target <> 'staging' THEN
      RAISE EXCEPTION 'release_action_target_mismatch' USING ERRCODE='23514'; END IF;
  ELSIF j.action IN ('bootstrap','prod_apply','prod_rollback','data_refresh') THEN
    IF j.target <> 'production' THEN
      RAISE EXCEPTION 'release_action_target_mismatch' USING ERRCODE='23514'; END IF;
  ELSE
    RAISE EXCEPTION 'unsupported_release_action' USING ERRCODE='23514';
  END IF;
  expected := CASE WHEN j.target='staging' THEN s.staging_sha ELSE s.production_sha END;
  IF expected IS DISTINCT FROM j.from_sha THEN
    RAISE EXCEPTION 'stale_release_pointer' USING ERRCODE='40001';
  END IF;
  IF j.action='prod_apply' AND s.staging_sha IS DISTINCT FROM j.to_sha THEN
    RAISE EXCEPTION 'staging_signoff_mismatch' USING ERRCODE='23514';
  END IF;
  IF j.action='bootstrap' AND s.production_sha IS NOT NULL THEN
    RAISE EXCEPTION 'bootstrap_already_completed' USING ERRCODE='23514';
  END IF;
  IF j.action='data_refresh' THEN
    IF j.to_sha IS DISTINCT FROM s.production_sha OR j.public_data_blob_sha IS NULL THEN
      RAISE EXCEPTION 'invalid_data_refresh_pointer' USING ERRCODE='23514'; END IF;
    UPDATE public.beagu_site_release_state_v1
      SET public_data_blob_sha=j.public_data_blob_sha,updated_at=clock_timestamp()
      WHERE id=1;
  ELSIF j.target='staging' THEN
    IF j.to_sha IS NULL THEN
      RAISE EXCEPTION 'empty_staging_target' USING ERRCODE='23514'; END IF;
    UPDATE public.beagu_site_release_state_v1
      SET staging_sha=j.to_sha,staging_version=j.version,
          public_data_blob_sha=COALESCE(j.public_data_blob_sha,s.public_data_blob_sha),
          updated_at=clock_timestamp()
      WHERE id=1;
  ELSE
    IF j.to_sha IS NULL THEN
      RAISE EXCEPTION 'empty_production_target' USING ERRCODE='23514'; END IF;
    UPDATE public.beagu_site_release_state_v1
      SET production_sha=j.to_sha,production_version=j.version,
          public_data_blob_sha=COALESCE(j.public_data_blob_sha,s.public_data_blob_sha),
          updated_at=clock_timestamp()
      WHERE id=1;
  END IF;
  -- This unique(history.job_id) insert is deliberately BETWEEN state and job
  -- updates so any conflict proves PostgreSQL rolls back ALL three writes.
  INSERT INTO public.beagu_site_release_history_v1
      (job_id,target,action,version,summary,from_sha,to_sha,deployed_url)
  VALUES (j.id,j.target,j.action,j.version,j.summary,j.from_sha,j.to_sha,p_deployed_url);
  UPDATE public.beagu_site_release_jobs_v1
    SET status='deployed',finished_at=clock_timestamp(),
        deployed_url=p_deployed_url
    WHERE id=j.id AND status='running';
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated <> 1 THEN
    RAISE EXCEPTION 'release_job_finalize_lost' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object('ok',true,'status','deployed','job_id',j.id,'target',j.target);
END;
$atomic_release$;
REVOKE ALL ON FUNCTION public.beagu_site_release_finalize_v1(uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_site_release_finalize_v1(uuid,text,text)
  TO service_role;
COMMENT ON FUNCTION public.beagu_site_release_finalize_v1(uuid,text,text) IS
'Atomic release pointer/history/job finalization. Non-deploying service-role-only RPC. Requires verified release worker.';
