-- Stage38 atomic DB release state-machine regression ONLY for independent
-- Supabase project ycwuugggqbunlbwuzvbx, NEVER production snvzwrexuqavnfvzgxqj.
-- All job IDs, release SHAs and URLs are synthetic; the entire test ROLLBACKs.
-- Real GitHub deploy/rollback and releases are NOT executed by this test.
BEGIN;
DO $regress$
DECLARE
  base text:=repeat('1',40);
  candidate text:=repeat('2',40);
  alternate text:=repeat('3',40);
  source_blob text:=repeat('d',40);
  new_blob text:=repeat('e',40);
  job_id uuid;
  stage_id uuid;
  result jsonb;
  blocked boolean;
  hist_count integer;
  stage_pointer text;
  prod_pointer text;
BEGIN
  IF (SELECT count(*) FROM public.beagu_site_release_state_v1) <> 1
   OR (SELECT count(*) FROM public.beagu_site_release_jobs_v1) <> 0
   OR (SELECT count(*) FROM public.beagu_site_release_history_v1) <> 0
   OR (SELECT count(*) FROM public.beagu_site_release_state_v1
       WHERE id=1 AND production_sha IS NULL AND staging_sha IS NULL
         AND draft_sha IS NULL) <> 1
  THEN RAISE EXCEPTION 'Refusing nonempty or nonisolated release baseline'; END IF;
  IF has_function_privilege('anon','public.beagu_site_release_finalize_v1(uuid,text,text)','EXECUTE')
   OR has_function_privilege('authenticated','public.beagu_site_release_finalize_v1(uuid,text,text)','EXECUTE')
   OR NOT has_function_privilege('service_role','public.beagu_site_release_finalize_v1(uuid,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Release finalizer leaked to browser roles'; END IF;

  -- Model an already-deployed fictional baseline inside a rolled-back transaction.
  UPDATE public.beagu_site_release_state_v1 SET production_sha=base,
    production_version='SIM-BASE',staging_sha=base,staging_version='SIM-BASE',
    public_data_blob_sha=source_blob,draft_sha=candidate,
    draft_version='SIM-CANDIDATE',draft_summary='Synthetic stage38 state-machine test'
  WHERE id=1;

  -- Test real constraint: one active queued/running release at a time.
  INSERT INTO public.beagu_site_release_jobs_v1
    (action,target,from_sha,to_sha,version,summary,status,public_data_blob_sha)
  VALUES('stage_apply','staging',base,candidate,'SIM-1','Synthetic stage apply','running',source_blob)
  RETURNING id INTO stage_id;
  blocked:=false;
  BEGIN
    INSERT INTO public.beagu_site_release_jobs_v1
      (action,target,from_sha,to_sha,version,summary,status)
    VALUES('prod_apply','production',base,candidate,'SIM-DUP','Must reject overlapping queue','queued');
  EXCEPTION WHEN unique_violation THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Overlapping release jobs were not blocked'; END IF;

  -- A bad URL must fail without changing the staging pointer or job.
  BEGIN
    PERFORM public.beagu_site_release_finalize_v1(stage_id,'deployed','http://unsafe.example.invalid');
    RAISE EXCEPTION 'Non-HTTPS target accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (SELECT staging_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> base
   OR (SELECT status FROM public.beagu_site_release_jobs_v1 WHERE id=stage_id) <> 'running'
  THEN RAISE EXCEPTION 'Invalid URL mutated state'; END IF;

  result:=public.beagu_site_release_finalize_v1(stage_id,'deployed','https://staging.example.invalid/rc');
  IF result->>'status'<>'deployed'
    OR (SELECT staging_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> candidate
    OR (SELECT status FROM public.beagu_site_release_jobs_v1 WHERE id=stage_id) <> 'deployed'
    OR (SELECT count(*) FROM public.beagu_site_release_history_v1) <> 1
  THEN RAISE EXCEPTION 'Atomic stage-apply failed'; END IF;
  result:=public.beagu_site_release_finalize_v1(stage_id,'deployed','https://staging.example.invalid/rc');
  IF (result->>'already_complete')::boolean IS NOT TRUE
    OR (SELECT count(*) FROM public.beagu_site_release_history_v1) <> 1
  THEN RAISE EXCEPTION 'Repeat delivery was not idempotent'; END IF;

  -- Worker must refuse a stale production pointer even after staging passes.
  INSERT INTO public.beagu_site_release_jobs_v1
    (action,target,from_sha,to_sha,version,summary,status)
  VALUES('prod_apply','production',alternate,candidate,'SIM-STALE','Reject stale release','running')
  RETURNING id INTO job_id;
  BEGIN
    PERFORM public.beagu_site_release_finalize_v1(job_id,'deployed','https://sandbox.example.invalid/rejected');
    RAISE EXCEPTION 'Stale pointer accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  IF (SELECT production_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> base
     OR (SELECT status FROM public.beagu_site_release_jobs_v1 WHERE id=job_id) <> 'running'
  THEN RAISE EXCEPTION 'Stale pointer changed release state'; END IF;
  PERFORM public.beagu_site_release_finalize_v1(job_id,'failed');
  IF (SELECT status FROM public.beagu_site_release_jobs_v1 WHERE id=job_id)<>'failed'
  THEN RAISE EXCEPTION 'Worker failure did not persist failed status'; END IF;

  -- Real eligible promotion: the reviewed staging SHA must equal the job's SHA.
  INSERT INTO public.beagu_site_release_jobs_v1
    (action,target,from_sha,to_sha,version,summary,status,public_data_blob_sha)
  VALUES('prod_apply','production',base,candidate,'SIM-1','Synthetic confirmed promotion','running',source_blob)
  RETURNING id INTO job_id;
  result:=public.beagu_site_release_finalize_v1(job_id,'deployed','https://sandbox.example.invalid/version2');
  IF (SELECT production_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> candidate
   OR (SELECT count(*) FROM public.beagu_site_release_history_v1 WHERE target='production') <> 1
  THEN RAISE EXCEPTION 'Atomic simulated production promotion failed'; END IF;

  -- An independently confirmed rollback points back to previous immutable SHA.
  INSERT INTO public.beagu_site_release_jobs_v1
    (action,target,from_sha,to_sha,version,summary,status)
  VALUES('prod_rollback','production',candidate,base,'SIM-BASE','Synthetic rollback','running')
  RETURNING id INTO job_id;
  PERFORM public.beagu_site_release_finalize_v1(job_id,'deployed','https://sandbox.example.invalid/rolledback');
  IF (SELECT production_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> base
   OR (SELECT staging_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> candidate
  THEN RAISE EXCEPTION 'Production rollback improperly changed staging'; END IF;

  INSERT INTO public.beagu_site_release_jobs_v1
    (action,target,from_sha,to_sha,version,summary,status)
  VALUES('stage_rollback','staging',candidate,base,'SIM-BASE','Synthetic test rollback','running')
  RETURNING id INTO job_id;
  PERFORM public.beagu_site_release_finalize_v1(job_id,'deployed','https://staging.example.invalid/restored');
  IF (SELECT staging_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> base
   OR (SELECT count(*) FROM public.beagu_site_release_history_v1) <> 4
  THEN RAISE EXCEPTION 'Staging rollback or deployment history mismatch'; END IF;

  -- Inject a history UNIQUE violation AFTER the function updates state.
  -- Only one PostgreSQL transaction can recover the state and job consistently.
  INSERT INTO public.beagu_site_release_jobs_v1
    (action,target,from_sha,to_sha,version,summary,status)
  VALUES('stage_apply','staging',base,alternate,'SIM-FAULT','Simulated DB fault','running')
  RETURNING id INTO job_id;
  INSERT INTO public.beagu_site_release_history_v1
    (job_id,target,action,version,summary,from_sha,to_sha,deployed_url)
  VALUES (job_id,'staging','stage_apply','SIM-FAULT','Injected duplicate row',
          base,alternate,'https://staging.example.invalid/preexisting');
  blocked:=false;
  BEGIN
    PERFORM public.beagu_site_release_finalize_v1(job_id,'deployed','https://staging.example.invalid/fault');
  EXCEPTION WHEN unique_violation THEN blocked:=true;
  END;
  IF NOT blocked
   OR (SELECT staging_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> base
   OR (SELECT status FROM public.beagu_site_release_jobs_v1 WHERE id=job_id) <> 'running'
  THEN RAISE EXCEPTION 'History insert error left a half-applied release'; END IF;
  DELETE FROM public.beagu_site_release_history_v1 WHERE job_id=job_id;
  PERFORM public.beagu_site_release_finalize_v1(job_id,'failed');
  IF (SELECT count(*) FROM public.beagu_site_release_history_v1) <> 4
  THEN RAISE EXCEPTION 'DB fault injection polluted history'; END IF;

  -- A data-only refresh is not a code release; preserve both immutable pointers.
  INSERT INTO public.beagu_site_release_jobs_v1
    (action,target,from_sha,to_sha,version,summary,status,public_data_blob_sha)
  VALUES('data_refresh','production',base,base,'SIM-DATA','Only fictional public data blob','running',new_blob)
  RETURNING id INTO job_id;
  PERFORM public.beagu_site_release_finalize_v1(job_id,'deployed','https://sandbox.example.invalid/data');
  IF (SELECT production_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> base
   OR (SELECT staging_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> base
   OR (SELECT public_data_blob_sha FROM public.beagu_site_release_state_v1 WHERE id=1) <> new_blob
   OR (SELECT count(*) FROM public.beagu_site_release_history_v1) <> 5
  THEN RAISE EXCEPTION 'Data refresh changed released code or lost history'; END IF;
  IF (SELECT count(*) FROM public.beagu_site_release_jobs_v1 WHERE status='deployed') <> 5
   OR (SELECT count(*) FROM public.beagu_site_release_jobs_v1 WHERE status='failed') <> 2
   OR (SELECT count(*) FROM public.beagu_site_release_jobs_v1 WHERE status IN ('queued','running')) <> 0
  THEN RAISE EXCEPTION 'Final state machine counts invalid'; END IF;
END $regress$;
SET LOCAL ROLE anon;
DO $deny$
BEGIN
  BEGIN
    PERFORM public.beagu_site_release_finalize_v1(
      '00000000-0000-4000-8000-000000000038'::uuid, 'failed');
    RAISE EXCEPTION 'Anon reached service-only release finalizer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $deny$;
RESET ROLE;
ROLLBACK;
-- A separate query MUST confirm no synthetic jobs/history/pointers persisted.
