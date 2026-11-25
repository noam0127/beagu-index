-- Synthetic data only; actual prior view, not a replacement stub.
set role service_role;
select public.beagu_2026_percentile_v13_scope_review('fixture-auto-version','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','COMPATIBLE',true,true,'synthetic verified notice only');
insert into beagu_private.beagu_2026_auto_evidence
select school_id,source_version,percentile,valid_observation_count,percentile_method,updated_at,7,repeat('c',64),repeat('a',64),true,true,false,false,true,true,true,clock_timestamp()
from public.beagu_school_report_yearly where school_id='1000004' and survey_year=2026;
do $t$ declare r jsonb; begin
 r:=public.beagu_2026_master_publish_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','fixture-auto-version','[{"school_id":"1000004","observations":1,"sum_units":360360,"percentile":0},{"school_id":"1000005","observations":1,"sum_units":720720,"percentile":100}]',jsonb_build_array(jsonb_build_object('school_id','1000004','payload_sha256',repeat('a',64))));
 if r->>'eligible'<>'1' or r->>'question_eligible'<>'1' then raise exception 'actual prerequisite gate mismatch: %',r;end if;
end$t$;
reset role;
