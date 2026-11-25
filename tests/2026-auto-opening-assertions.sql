do $$ begin
 if has_function_privilege('anon','public.beagu_2026_auto_percentiles(text[],integer)','EXECUTE') or has_function_privilege('authenticated','public.beagu_2026_auto_admin_action(uuid,uuid,text,text,timestamptz,uuid,text,text)','EXECUTE') or has_table_privilege('authenticated','beagu_private.beagu_2026_auto_evidence','INSERT') then raise exception 'private access bypass';end if;
end $$;
set role service_role;
do $$ declare a uuid:='11111111-1111-1111-1111-111111111111';s uuid:='22222222-2222-2222-2222-222222222222';r uuid;j jsonb;ts timestamptz;bad boolean;
begin
 if public.beagu_2026_auto_percentiles(array['1000004'],2)<>'{}'::jsonb then raise exception 'unverified notice/evidence';end if;
 perform public.beagu_2026_percentile_v13_scope_review('fixture-auto-version',a,s,'COMPATIBLE',true,true,'synthetic verified common notice');
 select updated_at into ts from public.beagu_school_report_yearly where school_id='1000004' and survey_year=2026;
 insert into beagu_private.beagu_2026_auto_evidence values('1000004','fixture-auto-version',40,1,'PERCENT_RANK_ASC_EXACT_MEAN_VI13_MIN9_A4_P2_R1',ts,7,repeat('c',64),repeat('a',64),true,true,false,false,true,true,true,clock_timestamp());
end $$;
do $$ declare a uuid:='11111111-1111-1111-1111-111111111111';s uuid:='22222222-2222-2222-2222-222222222222';r uuid;j jsonb;ts timestamptz;bad boolean;
begin
 if public.beagu_2026_auto_percentiles(array['1000004','1000005'],2)<>'{"1000004":40}'::jsonb or public.beagu_2026_auto_percentiles(array['1000004'],1)<>'{}'::jsonb or public.beagu_2026_auto_percentiles(array['1000004'],0)<>'{}'::jsonb then raise exception 'automatic gate';end if;
 j:=public.beagu_2026_auto_admin_status(a,s,0);
 if (j->>'auto_lv1')::int is distinct from 0 or (j->>'auto_lv2')::int is distinct from 1 then raise exception 'tier statistics mismatch';end if;
 if position('p_level=2' in pg_get_functiondef('public.beagu_2026_auto_percentiles(text[],integer)'::regprocedure))=0 then raise exception 'Lv1 may reopen after time delay';end if;
 if exists(select 1 from jsonb_array_elements(j->'suspects') i where i->>'school_id'='1000004') then raise exception 'normal school displayed';end if;
 r:=public.beagu_2026_simple_report('1000004','synthetic report for test only',repeat('e',64));
 if public.beagu_2026_auto_percentiles(array['1000004'],2)<>'{"1000004":40}'::jsonb then raise exception 'report alone withheld';end if;
 perform public.beagu_2026_simple_report('1000006','catalog school without survey',repeat('f',64));
 select updated_at into ts from public.beagu_school_report_yearly where school_id='1000004' and survey_year=2026;
 bad:=false;begin perform public.beagu_2026_auto_admin_action(a,null,'1000004','fixture-auto-version',ts,r,'HOLD','synthetic reason for hold');exception when others then bad:=true;end;if not bad then raise exception 'MFA bypass';end if;
 perform public.beagu_2026_auto_admin_action(a,s,'1000004','fixture-auto-version',ts,r,'HOLD','synthetic owner publication hold');
 if public.beagu_2026_auto_percentiles(array['1000004'],2)<>'{}'::jsonb or not ('1000004'=any(public.beagu_2026_auto_hidden_ids(array['1000004']))) then raise exception 'explicit hold bypass';end if;
 j:=public.beagu_2026_auto_admin_status(a,s,0);if (j->>'auto_lv2')::int is distinct from 0 then raise exception 'held school still counted';end if;
 perform public.beagu_2026_auto_admin_action(a,s,'1000004','fixture-auto-version',ts,r,'REAGGREGATE','synthetic request for recalculation');
 if public.beagu_2026_auto_percentiles(array['1000004'],2)<>'{}'::jsonb or not ('1000004'=any(public.beagu_2026_auto_hidden_ids(array['1000004']))) then raise exception 'hold bypass';end if;
 if not exists(select 1 from beagu_private.beagu_2026_auto_exception where school_id='1000004' and action='REAGGREGATE') then raise exception 'request missing';end if;
 if not exists(select 1 from public.beagu_school_report_yearly where school_id='1000004' and percentile=40 and publication_status='WITHHELD') then raise exception 'candidate mutated';end if;
 raise notice 'PASS auto verified evidence without individual identity/PII attestations, n=1, scope, Lv2-only, reports, exception queue, MFA, original preservation';
end $$;
reset role;
