-- Fixture-only after existing final assertions.
do $$ begin
 if has_function_privilege('anon','public.beagu_2026_percentile_v13_bulk(text,integer[],uuid,uuid,boolean,text,text)','execute') or has_function_privilege('authenticated','public.beagu_2026_percentile_v13_bulk(text,integer[],uuid,uuid,boolean,text,text)','execute') then raise exception 'bulk exposed';end if;
end $$;
set role service_role;
do $$
declare a uuid:='11111111-1111-1111-1111-111111111111';s uuid:='22222222-2222-2222-2222-222222222222';j jsonb;bad boolean;token text;
 checks jsonb:='{"technical_reviewed":true,"school_identity_reviewed":true,"unique_respondents_reviewed":true,"personal_data_reviewed":true,"small_sample_reviewed":true,"reidentification_reviewed":true,"prior_data_combination_reviewed":true}';
begin
 j:=public.beagu_2026_percentile_v13_bulk('fixture-version',array[1,2],a,s,true,null,null);
 if (j->>'eligible_pairs')::int<>0 or (j->>'structure_ok')::int<>2 then raise exception 'unreviewed batch or prior revoke bypass: %',j;end if;
 perform public.beagu_2026_percentile_v13_school_review('1000001','fixture-version',70,1,a,s,checks,'synthetic complete bulk fixture');
 j:=public.beagu_2026_percentile_v13_bulk('fixture-version',array[1,2],a,s,true,null,null);
 if (j->>'eligible_pairs')::int<>2 or (j->>'eligible_schools')::int<>1 then raise exception 'unexpected batch: %',j;end if;
 token:=j->>'token';
 bad:=false;begin perform public.beagu_2026_percentile_v13_bulk('fixture-version',array[1,2],a,s,false,token,'wrong');exception when others then bad:=true;end;if not bad then raise exception 'confirmation bypass';end if;
 bad:=false;begin perform public.beagu_2026_percentile_v13_bulk('fixture-version',array[1,2],a,null,false,token,'APPROVE_REVIEWED_PERCENTILES_ONLY');exception when others then bad:=true;end;if not bad then raise exception 'MFA bypass';end if;
 bad:=false;begin perform public.beagu_2026_percentile_v13_bulk('fixture-version',array[2],a,s,false,token,'APPROVE_REVIEWED_PERCENTILES_ONLY');exception when others then bad:=true;end;if not bad then raise exception 'tier token bypass';end if;
 perform public.beagu_2026_percentile_v13_school_review('1000001','fixture-version',70,1,a,s,checks||'{"reidentification_reviewed":false}'::jsonb,'synthetic withdrawn evidence');
 bad:=false;begin perform public.beagu_2026_percentile_v13_bulk('fixture-version',array[1,2],a,s,false,token,'APPROVE_REVIEWED_PERCENTILES_ONLY');exception when others then bad:=true;end;if not bad then raise exception 'stale preview bypass';end if;
 perform public.beagu_2026_percentile_v13_school_review('1000001','fixture-version',70,1,a,s,checks,'synthetic renewed complete evidence');
 j:=public.beagu_2026_percentile_v13_bulk('fixture-version',array[1,2],a,s,true,null,null);token:=j->>'token';
 j:=public.beagu_2026_percentile_v13_bulk('fixture-version',array[1,2],a,s,false,token,'APPROVE_REVIEWED_PERCENTILES_ONLY');
 if (j->>'approved_pairs')::int<>2 then raise exception 'batch approval count';end if;
 bad:=false;begin perform public.beagu_2026_percentile_v13_bulk('fixture-version',array[1,2],a,s,false,token,'APPROVE_REVIEWED_PERCENTILES_ONLY');exception when others then bad:=true;end;if not bad then raise exception 'duplicate approval';end if;
end $$;
do $$ begin
 if public.beagu_2026_percentile_v13_values(array['1000001','1000002','1000003'],2)<>'{"1000001":70}'::jsonb then raise exception 'unexpected publication';end if;
 if public.beagu_2026_percentile_v13_values(array['1000001'],1)<>'{}'::jsonb or public.beagu_2026_percentile_v13_values(array['1000001'],0)<>'{}'::jsonb then raise exception 'delay bypass';end if;
 if exists(select 1 from public.beagu_school_report_yearly where survey_year=2026 and publication_status<>'WITHHELD') then raise exception 'annual data changed';end if;
 raise notice 'PASS batch preview, owner MFA, exact token, stale review, revocation exclusion, duplicate prevention, tier isolation';
end $$;
reset role;
