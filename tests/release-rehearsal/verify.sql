set role service_role;
do $t$ begin
 if public.beagu_2026_master_values_v1(array['1000004','1000005'],2) is distinct from '{"1000004":0}'::jsonb then raise exception 'master backup data mismatch';end if;
 if public.beagu_2026_master_questions_v1('1000004',2) is distinct from '[{"id":"Q01","invalid":0}]'::jsonb then raise exception 'question backup mismatch';end if;
 if public.beagu_2026_master_questions_v1('1000004',0) is not null then raise exception 'level bypass';end if;
 if not exists(select 1 from public.beagu_school_report_yearly where school_id='1000001' and survey_year=2025 and percentile=30) then raise exception 'old record lost';end if;
end$t$;
reset role;
do $t$ begin
 if has_function_privilege('anon','public.beagu_2026_master_questions_v1(text,integer)','EXECUTE') then raise exception 'restored permission mismatch';end if;
 raise notice 'PASS real predecessor view, restored master, question privacy, legacy record and privileges';
end$t$;
