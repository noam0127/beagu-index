-- All decisions in disposable fixture only, never against a live database.
do $$ begin
 if has_function_privilege('anon','public.beagu_2026_percentile_v13_values(text[],integer)','execute')
 or has_function_privilege('authenticated','public.beagu_2026_percentile_v13_decide(text,text,numeric,integer,integer,uuid,uuid,text,text)','execute')
 or has_table_privilege('authenticated','beagu_private.beagu_2026_percentile_v13_decisions','SELECT') then raise exception 'private approval exposed'; end if;
end $$;
set role service_role;
do $$
declare a uuid:='11111111-1111-1111-1111-111111111111'; s uuid:='22222222-2222-2222-2222-222222222222';
 checks jsonb:='{"technical_reviewed":true,"school_identity_reviewed":true,"unique_respondents_reviewed":true,"personal_data_reviewed":true,"small_sample_reviewed":true,"reidentification_reviewed":true,"prior_data_combination_reviewed":true}';
 bad boolean;
begin
 if public.beagu_2026_percentile_v13_values(array['1000002'],2)<>'{}'::jsonb then raise exception 'unapproved leak'; end if;
 bad:=false;begin perform public.beagu_2026_percentile_v13_decide('1000002','fixture-version',20,1,2,a,s,'APPROVE','APPROVE_PERCENTILE_ONLY');exception when others then bad:=true;end;
 if not bad then raise exception 'incomplete school review bypass';end if;
 perform public.beagu_2026_percentile_v13_school_review('1000002','fixture-version',20,1,a,s,checks,'synthetic complete individual review');
 bad:=false;begin perform public.beagu_2026_percentile_v13_decide('1000002','fixture-version',20,1,2,a,s,'APPROVE','wrong');exception when others then bad:=true;end;
 if not bad then raise exception 'confirmation bypass';end if;
 bad:=false;begin perform public.beagu_2026_percentile_v13_decide('1000002','fixture-version',21,1,2,a,s,'APPROVE','APPROVE_PERCENTILE_ONLY');exception when others then bad:=true;end;
 if not bad then raise exception 'stale candidate bypass';end if;
 bad:=false;begin perform public.beagu_2026_percentile_v13_decide('1000002','fixture-version',20,1,2,a,'33333333-3333-4333-8333-333333333333','APPROVE','APPROVE_PERCENTILE_ONLY');exception when others then bad:=true;end;
 if not bad then raise exception 'MFA bypass';end if;
 perform public.beagu_2026_percentile_v13_decide('1000002','fixture-version',20,1,2,a,s,'APPROVE','APPROVE_PERCENTILE_ONLY');
 perform public.beagu_2026_percentile_v13_decide('1000002','fixture-version',20,1,1,a,s,'APPROVE','APPROVE_PERCENTILE_ONLY');
end $$;
-- Separate transactions: committed decisions are visible, immediate Lv2 only.
do $$ begin
 if public.beagu_2026_percentile_v13_values(array['1000002'],2)<>'{"1000002":20}'::jsonb then raise exception 'approved Lv2 percentile missing';end if;
 if public.beagu_2026_percentile_v13_values(array['1000002'],1)<>'{}'::jsonb or public.beagu_2026_percentile_v13_values(array['1000002'],0)<>'{}'::jsonb then raise exception 'tier delay or boundary bypass';end if;
 if public.beagu_2026_percentile_v13_values(array['1000001','1000002'],2)<>'{"1000002":20}'::jsonb then raise exception 'unreviewed second school exposed';end if;
end $$;
reset role;
-- Fixture-only manipulate timestamps to exercise the 24h path and hold invalidation.
update beagu_private.beagu_2026_percentile_v13_decisions set decided_at=now()-interval '25 hours' where access_level=1;
set role service_role;
do $$ begin if public.beagu_2026_percentile_v13_values(array['1000002'],1)<>'{"1000002":20}'::jsonb then raise exception 'Lv1 delay failed';end if;end $$;
reset role;
insert into beagu_private.beagu_2026_civic_publication_hold values('1000002',true,clock_timestamp());
set role service_role;
do $$ begin if public.beagu_2026_percentile_v13_values(array['1000002'],2)<>'{}'::jsonb then raise exception 'hold bypass';end if;end $$;
reset role;
update beagu_private.beagu_2026_civic_publication_hold set active=false,updated_at=clock_timestamp();
set role service_role;
do $$ begin if public.beagu_2026_percentile_v13_values(array['1000002'],2)<>'{}'::jsonb then raise exception 'hold release resurrected approval';end if;end $$;
select public.beagu_2026_percentile_v13_decide('1000002','fixture-version',20,1,2,'11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','APPROVE','APPROVE_PERCENTILE_ONLY');
select public.beagu_2026_percentile_v13_decide('1000002','fixture-version',20,1,2,'11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','REVOKE','REVOKE_PERCENTILE_ONLY');
do $$ begin
 if public.beagu_2026_percentile_v13_values(array['1000002'],2)<>'{}'::jsonb then raise exception 'revocation bypass';end if;
 if exists(select 1 from public.beagu_school_report_yearly where survey_year=2026 and publication_status<>'WITHHELD') then raise exception 'annual candidate altered';end if;
 if not exists(select 1 from public.beagu_school_report_yearly where survey_year=2025 and publication_status='PUBLISHED') then raise exception 'legacy altered';end if;
 raise notice 'PASS exact narrow decisions, owner MFA, tier boundaries, delay, holds, revoke, legacy isolation';
end $$;
reset role;
