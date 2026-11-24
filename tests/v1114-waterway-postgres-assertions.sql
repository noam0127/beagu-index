-- Run after telemetry and status SQL in an isolated PostgreSQL database.
do $$ begin
 if has_function_privilege('anon','public.beagu_2026_waterway_record_run_v1(jsonb)','execute')
 or has_function_privilege('authenticated','public.beagu_2026_waterway_status_v1()','execute')
 or not has_function_privilege('service_role','public.beagu_2026_waterway_status_v1()','execute') then raise exception 'invalid privileges'; end if;
end $$;
set role service_role;
do $$ declare r jsonb; t timestamptz:=now(); d jsonb; begin
 d:=public.beagu_2026_waterway_status_v1();
 if d->'source'->'live_raw_rows' is distinct from 'null'::jsonb or d->'preflight'->>'TECHNICAL_REVIEW_REQUIRED'<>'1' then raise exception 'initial status invalid'; end if;
 r:=jsonb_build_object('kind','WATERWAY_RUN_V1','started_at',t-interval '1 minute','finished_at',t,'source_rows',2,'basic_review_rows',1,'stages',jsonb_build_array(jsonb_build_object('stage','QUESTION_RESULTS','status','ERROR','reason','HTTP_409','duration_ms',1)));
 perform public.beagu_2026_waterway_record_run_v1(r);
 perform public.beagu_2026_waterway_record_run_v1(r||jsonb_build_object('finished_at',t-interval '5 seconds','source_rows',1));
 d:=public.beagu_2026_waterway_status_v1();
 if d->'source'->>'live_raw_rows'<>'2' or d->'sync'->>'last_failure_reason'<>'QUESTION_RESULTS:HTTP_409' then raise exception 'run or ordering invalid'; end if;
 perform public.beagu_2026_waterway_record_run_v1(r||jsonb_build_object('finished_at',t+interval '1 second','stages',jsonb_build_array(jsonb_build_object('stage','QUESTION_RESULTS','status','SUCCESS','reason','NONE','duration_ms',1))));
 d:=public.beagu_2026_waterway_status_v1();
 if d->'sync'->>'last_failure_reason'<>'QUESTION_RESULTS:HTTP_409' or d->'run'->'stages'->0->>'status'<>'SUCCESS' then raise exception 'failure retention invalid'; end if;
 if (select count(*) from beagu_private.beagu_2026_waterway_runs_v1)<>2 then raise exception 'unbounded storage'; end if;
 if (select approval_status from public.beagu_2026_results_snapshot where school_id='A000001')<>'WITHHELD' then raise exception 'approval mutated'; end if;
 if (d->'release'->2->>'released_schools')::integer<>0 then raise exception 'Q45 release bypass'; end if;
 raise notice 'PASS: service role, actual SQL RPC, two-slot monotonic telemetry, last failure retention, no approval changes';
end $$;
reset role;
