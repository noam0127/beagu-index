-- Stage 28: disposable PostgreSQL fixture ONLY; no real people or schools.
-- The Stage21 fixture and approval/revocation checks must run first.
do $test$
begin
 if has_function_privilege('anon',
   'public.beagu_2026_released_question_results(text)','EXECUTE')
 or has_function_privilege('authenticated',
   'public.beagu_2026_released_question_results(text)','EXECUTE')
 or has_function_privilege('anon',
   'public.beagu_2026_lv2_released_question_results(text)','EXECUTE')
 or has_function_privilege('authenticated',
   'public.beagu_2026_tiered_released_question_results_v1(text,integer)','EXECUTE')
 then raise exception 'Public/anon/authenticated can call private review RPC';end if;
 if not has_function_privilege('service_role',
   'public.beagu_2026_released_question_results(text)','EXECUTE')
 then raise exception 'Server-only Lv1 gateway unavailable';end if;
end;$test$;

-- The existing synthetic 25-hour school is still exact-reviewed.
-- Inject Q31 / Q51 aliases, unknown IDs and a valid Q20 aggregate;
-- approval status, consent and independent review remain unchanged.
update public.beagu_2026_results_snapshot
 set questions=questions||'[
   {"id":"Q31.1","row":-1,"valid":1,"invalid":0,"counts":[1],"minutes_sum":0},
   {"id":"Q31_sensitive","row":-1,"valid":1,"invalid":0,"counts":[1],"minutes_sum":0},
   {"id":"Q51_FREE","row":-1,"valid":1,"invalid":0,"counts":[1],"minutes_sum":0},
   {"id":"Q99","row":-1,"valid":1,"invalid":0,"counts":[1],"minutes_sum":0},
   {"id":"respondent_email","row":-1,"valid":1,"invalid":0,"counts":[1],"minutes_sum":0},
   {"id":"Q20","row":-1,"valid":1,"invalid":0,"counts":[0,1],"minutes_sum":0}
 ]'::jsonb,
 updated_at=now()-interval '26 hours',
 approved_at=now()-interval '25 hours'
 where school_id='A000003';
set role service_role;
do $test$
declare
 q1 jsonb;q2 jsonb;q3 jsonb; legacy jsonb;
 tier integer;
begin
 q1:=public.beagu_2026_tiered_released_question_results_v1('A000003',1);
 q2:=public.beagu_2026_tiered_released_question_results_v1('A000003',2);
 q3:=public.beagu_2026_tiered_released_question_results_v1('A000003',3);
 legacy:=public.beagu_2026_released_question_results('A000003');
 if q1 is null or q2 is null or q3 is null or legacy is null
 then raise exception 'Synthetic reviewed 25h school not available';end if;
 if q1<>q2 or q1<>q3 or q1<>legacy
 then raise exception 'Legacy Lv1 and tiered 2026 projections differ';end if;
 if pg_catalog.jsonb_array_length(q1)<>2
 then raise exception 'Nonpublic survey item crossed server RPC';end if;
 if (select pg_catalog.string_agg(x->>'id',',')
      from pg_catalog.jsonb_array_elements(q1) x) not like '%Q01%'
 or (select pg_catalog.string_agg(x->>'id',',')
      from pg_catalog.jsonb_array_elements(q1) x) not like '%Q20%'
 then raise exception 'Valid public survey items vanished';end if;
 if exists(
   select 1 from pg_catalog.jsonb_array_elements(q1) q
   where q->>'id' not in('Q01','Q20')
 )then raise exception 'Private survey alias emitted';end if;
 if public.beagu_2026_released_question_results('A000001') is not null
 or public.beagu_2026_released_question_results('A000002') is not null
 then raise exception 'Old Lv1 RPC bypasses 24-hour cooldown';end if;
 if public.beagu_2026_lv2_released_question_results('A000002') is null
 or public.beagu_2026_lv2_released_question_results('A000001') is not null
 then raise exception 'Old Lv2 RPC bypasses 6-hour cooldown';end if;
end;$test$;
reset role;

-- A revoked legal/privacy review MUST revoke all versions of the route.
update beagu_private.beagu_2026_publication_basis_review
 set review_status='REJECTED' where school_id='A000003';
set role service_role;
do $test$
begin
 if public.beagu_2026_released_question_results('A000003') is not null
 or public.beagu_2026_lv2_released_question_results('A000003') is not null
 or public.beagu_2026_tiered_released_question_results_v1('A000003',3) is not null
 then raise exception 'Revoked independent privacy review bypassed';end if;
end;$test$;
reset role;

select 'PASS: B-01 private Q31/Q51 suffixes and unknown survey IDs blocked across Lv1/Lv2/Lv3, raw responses never public, rollback on revoked consent' as result;
