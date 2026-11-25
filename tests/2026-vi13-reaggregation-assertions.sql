set role service_role;
do $$ declare j jsonb; bad boolean:=false; begin
 j:=public.beagu_2026_vi13_stage(jsonb_build_object('kind','VI13_REAGGREGATE_V1','source_spreadsheet_id','1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4','started_at',clock_timestamp(),'schools','[{"school_id":"1000004","observations":1,"sum_units":18018000,"flags":0},{"school_id":"1000005","observations":2,"sum_units":36036000,"flags":0},{"school_id":"1000001","observations":1,"sum_units":36036000,"flags":0}]'::jsonb,'unmatched',0,'invalid',0,'excluded',0,'suspect',0));
 if (j->>'schools')::int<>3 then raise exception 'stage failed';end if;
 if public.beagu_2026_vi13_pending()<>0 or not exists(select 1 from beagu_private.beagu_2026_vi13_request_state where school_id='1000004' and state='STAGED') then raise exception 'request completion not linked';end if;
 if not ('1000004'=any(public.beagu_2026_auto_hidden_ids(array['1000004']))) then raise exception 'staged hold was removed';end if;
 if not exists(select 1 from beagu_private.beagu_2026_vi13_runs r,jsonb_array_elements(r.candidates) x where x->>'school_id'='1000001' and (x->>'percentile')::numeric=100) then raise exception 'rank wrong';end if;
 if (select count(*) from beagu_private.beagu_2026_vi13_runs r,jsonb_array_elements(r.candidates) x where (x->>'percentile')::numeric=0)<>2 then raise exception 'tie wrong';end if;
 if not exists(select 1 from public.beagu_school_report_yearly where school_id='1000004' and percentile=40 and publication_status='WITHHELD') then raise exception 'live candidate changed';end if;
 raise notice 'PASS private nationwide recomputation, exact ties, original preservation';
end $$;
reset role;
