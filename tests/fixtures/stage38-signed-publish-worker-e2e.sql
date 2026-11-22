-- Stage38 ephemeral, service-only, NONPRODUCTION actual-branch publisher fixture.
-- Apply only to staging Supabase ycwuugggqbunlbwuzvbx.
-- NEVER run against production snvzwrexuqavnfvzgxqj.
-- Exact sandbox A/B immutable commits from previously tested external static
-- Git branch; this function does not publish sites; a signed PR CI worker does so on an isolated branch.
CREATE OR REPLACE FUNCTION public.beagu_stage38_signed_publish_worker_fixture_v1(p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog, public
AS $fixture$
DECLARE
  original_sha constant text:='037a14afa252c52eaa130d7cbe2e08e649adf5bd';
  upgraded_sha constant text:='5512e798633eeb8163e8eab20c9ab9678b66f0cd';
  j_id uuid;
  s public.beagu_site_release_state_v1%ROWTYPE;
  jobs integer;
  histories integer;
BEGIN
  IF p_action NOT IN ('prepare','prepare_rollback','cleanup','status') THEN
    RAISE EXCEPTION 'not_an_allowed_stage38_fixture_action' USING ERRCODE='22023';
  END IF;
  SELECT * INTO s FROM public.beagu_site_release_state_v1 WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fixture_state_missing' USING ERRCODE='P0002'; END IF;
  SELECT count(*) INTO jobs FROM public.beagu_site_release_jobs_v1;
  SELECT count(*) INTO histories FROM public.beagu_site_release_history_v1;
  IF s.production_sha IS NOT NULL OR s.production_version IS NOT NULL OR
     s.public_data_blob_sha IS NOT NULL THEN
    RAISE EXCEPTION 'staging_contains_production_release_state' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.beagu_site_release_jobs_v1 j
    WHERE j.target IS DISTINCT FROM 'staging'
       OR j.action NOT IN ('stage_apply','stage_rollback')
       OR j.version NOT IN ('STAGE38-FAKE-B','STAGE38-FAKE-A')
       OR j.from_sha NOT IN (original_sha,upgraded_sha)
       OR j.to_sha NOT IN (original_sha,upgraded_sha)
  ) OR EXISTS (
    SELECT 1 FROM public.beagu_site_release_history_v1 h
    WHERE h.target IS DISTINCT FROM 'staging'
       OR h.action NOT IN ('stage_apply','stage_rollback')
       OR h.version NOT IN ('STAGE38-FAKE-B','STAGE38-FAKE-A')
       OR h.from_sha NOT IN (original_sha,upgraded_sha)
       OR h.to_sha NOT IN (original_sha,upgraded_sha)
  ) THEN
    RAISE EXCEPTION 'existing_release_rows_not_stage38_fixture' USING ERRCODE='23514';
  END IF;
  IF p_action='prepare' THEN
    IF jobs<>0 OR histories<>0 OR s.staging_sha IS NOT NULL OR s.draft_sha IS NOT NULL THEN
      RAISE EXCEPTION 'signed_worker_fixture_baseline_not_empty' USING ERRCODE='23514';
    END IF;
    UPDATE public.beagu_site_release_state_v1
      SET staging_sha=original_sha,staging_version='STAGE38-FAKE-A',
          draft_sha=upgraded_sha,draft_version='STAGE38-FAKE-B',
          draft_summary='Fictional branch A to B signed worker verification',
          updated_at=clock_timestamp()
      WHERE id=1;
    INSERT INTO public.beagu_site_release_jobs_v1
      (action,target,from_sha,to_sha,version,summary,status)
    VALUES ('stage_apply','staging',original_sha,upgraded_sha,
      'STAGE38-FAKE-B','Fictional previously published Git branch B','queued')
    RETURNING id INTO j_id;
    RETURN jsonb_build_object('ok',true,'queued_job',j_id,
      'from_sha',original_sha,'to_sha',upgraded_sha);
  END IF;
  IF p_action='prepare_rollback' THEN
    IF s.staging_sha IS DISTINCT FROM upgraded_sha OR jobs<>1 OR histories<>1 OR
       NOT EXISTS(SELECT 1 FROM public.beagu_site_release_jobs_v1 j
         WHERE j.action='stage_apply' AND j.status='deployed'
           AND j.from_sha=original_sha AND j.to_sha=upgraded_sha) THEN
      RAISE EXCEPTION 'cannot_rollback_unverified_staging_update' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.beagu_site_release_jobs_v1
      (action,target,from_sha,to_sha,version,summary,status)
    VALUES ('stage_rollback','staging',upgraded_sha,original_sha,
      'STAGE38-FAKE-A','Fictional previously published Git branch restored A','queued')
    RETURNING id INTO j_id;
    RETURN jsonb_build_object('ok',true,'queued_job',j_id,
      'from_sha',upgraded_sha,'to_sha',original_sha);
  END IF;
  IF p_action='cleanup' THEN
    IF (s.staging_sha IS NOT NULL AND s.staging_sha NOT IN (original_sha,upgraded_sha))
       OR (s.draft_sha IS NOT NULL AND s.draft_sha<>upgraded_sha) OR
       (jobs>2 OR histories>2)
    THEN RAISE EXCEPTION 'unsafe_fixture_cleanup_rejected' USING ERRCODE='23514';
    END IF;
    -- PostgREST's safe-update guard rejects unqualified DELETE. Only clean
    -- independently validated fictional staging release rows; never wildcard
    -- an unrelated production or staging job.
    DELETE FROM public.beagu_site_release_history_v1
      WHERE target='staging' AND version IN ('STAGE38-FAKE-B','STAGE38-FAKE-A');
    DELETE FROM public.beagu_site_release_jobs_v1
      WHERE target='staging' AND version IN ('STAGE38-FAKE-B','STAGE38-FAKE-A');
    UPDATE public.beagu_site_release_state_v1
      SET staging_sha=NULL,staging_version=NULL,draft_sha=NULL,
          draft_version=NULL,draft_summary=NULL,updated_at=clock_timestamp()
      WHERE id=1;
    RETURN jsonb_build_object('ok',true,'cleanup',true,'removed_jobs',jobs,
       'removed_history',histories);
  END IF;
  RETURN jsonb_build_object('ok',true,'staging_sha',s.staging_sha,
    'production_sha',s.production_sha,'jobs',jobs,'history',histories,
    'queued', (SELECT count(*) FROM public.beagu_site_release_jobs_v1
       WHERE status='queued'),'running',(SELECT count(*)
       FROM public.beagu_site_release_jobs_v1 WHERE status='running'));
END
$fixture$;
REVOKE ALL ON FUNCTION public.beagu_stage38_signed_publish_worker_fixture_v1(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_stage38_signed_publish_worker_fixture_v1(text)
  TO service_role;
