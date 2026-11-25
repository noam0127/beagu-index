insert into public.beagu_2026_official_school_profiles
 (school_id,disclosure_code,profile,teacher_total,source_sha256,mapping_rule)
 values('1000001','S000000001','{"school_name":"fixture"}',20,repeat('a',64),'EXACT'),
 ('1000002','S000000002','{"school_name":"fixture"}',7,repeat('b',64),'EXACT');
do $$ begin
 if has_table_privilege('anon','public.beagu_2026_official_school_profiles','SELECT')
 or has_table_privilege('authenticated','public.beagu_2026_official_school_profiles','SELECT')
 or has_function_privilege('anon','public.beagu_2026_percentile_v13_preview(text)','execute')
 or has_function_privilege('authenticated','public.beagu_2026_percentile_v13_scope_review(text,uuid,uuid,text,boolean,boolean,text)','execute')
 then raise exception 'private source/review exposed'; end if;
end $$;
set role service_role;
do $$
declare actor uuid:='11111111-1111-1111-1111-111111111111'; sess uuid:='22222222-2222-2222-2222-222222222222';
 checks jsonb:='{"technical_reviewed":true,"school_identity_reviewed":true,"unique_respondents_reviewed":true,"personal_data_reviewed":true,"small_sample_reviewed":true,"reidentification_reviewed":true,"prior_data_combination_reviewed":true}';
 r jsonb; rejected boolean:=false;
begin
 r:=public.beagu_2026_percentile_v13_preview('fixture-version');
 if (r->>'candidate_schools')::int<>3 or (r->>'eligible_for_percentile_only_approval')::int<>0 then raise exception 'initial fail closed'; end if;
 begin
 perform public.beagu_2026_percentile_v13_scope_review('fixture-version',actor,'33333333-3333-3333-3333-333333333333','COMPATIBLE',true,true,'synthetic fixture only');
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'MFA bypass'; end if;
 perform public.beagu_2026_percentile_v13_scope_review('fixture-version',actor,sess,'INCOMPATIBLE',false,false,'synthetic incompatible notice');
 perform public.beagu_2026_percentile_v13_school_review('1000001','fixture-version',70,1,actor,sess,checks,'synthetic school review');
 r:=public.beagu_2026_percentile_v13_preview('fixture-version');
 if (r->>'eligible_for_percentile_only_approval')::int<>0 then raise exception 'incompatible notice bypass'; end if;
 perform public.beagu_2026_percentile_v13_scope_review('fixture-version',actor,sess,'COMPATIBLE',true,true,'synthetic compatible notice only');
 perform public.beagu_2026_percentile_v13_school_review('1000002','fixture-version',20,2,actor,sess,checks,'synthetic small school review');
 r:=public.beagu_2026_percentile_v13_preview('fixture-version');
 if (r->>'eligible_for_percentile_only_approval')::int<>1 then raise exception 'privacy or teacher count gate failure: %',r; end if;
 perform public.beagu_2026_percentile_v13_school_review('1000001','fixture-version',70,1,actor,sess,checks||'{"reidentification_reviewed":false}'::jsonb,'synthetic incomplete school review');
 r:=public.beagu_2026_percentile_v13_preview('fixture-version');
 if (r->>'eligible_for_percentile_only_approval')::int<>0 then raise exception 'privacy review bypass'; end if;
 if exists(select 1 from public.beagu_school_report_yearly where survey_year=2026 and publication_status<>'WITHHELD')
 then raise exception 'preflight published data'; end if;
 if not exists(select 1 from public.beagu_school_report_yearly where survey_year=2025 and publication_status='PUBLISHED')
 then raise exception 'legacy data changed'; end if;
 raise notice 'PASS private grants, MFA, incompatible notice, teacher count, school privacy and no publication side effects';
end $$;
reset role;
