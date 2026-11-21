-- Stage22 isolated integration test: fabricated 2026 sources only.
do $test$
begin
 if not (select relrowsecurity from pg_class where
  oid='beagu_private.lv3_official_school_facts_2026_v1'::regclass)
 then raise exception 'private source RLS is missing';end if;
 if has_table_privilege('anon','beagu_private.lv3_official_school_facts_2026_v1','SELECT')
 or has_table_privilege('authenticated','public.beagu_lv3_2026_school_facts_v1','SELECT')
 or has_table_privilege('service_role','beagu_private.lv3_official_school_facts_2026_v1','UPDATE')
 then raise exception 'Lv3-only records exposed to clients or mutable via service API';end if;
 if not exists(select 1 from pg_class where oid=
  'public.beagu_lv3_2026_school_facts_v1'::regclass
  and reloptions @> array['security_invoker=true'])
 then raise exception 'Lv3 view must use security_invoker';end if;
end;$test$;

insert into beagu_private.lv3_official_school_facts_2026_v1(
 school_id,school_name,sido_standard,support_office,address,establishment,
 school_kind,status,neis_source_ref,neis_source_digest,neis_as_of,
 neis_reviewed,student_count,junior_teacher_ratio,male_teacher_ratio,
 school_info_source_ref,school_info_source_digest,school_info_as_of,
 school_info_reviewed,housing_price_won,housing_source_ref,
 housing_source_digest,housing_as_of,housing_reviewed,review_status,
 reviewer_user_id,reviewed_at,school_identity_reviewed,
 personal_data_reviewed,reidentification_reviewed,
 prior_data_combination_reviewed,updated_at
)values
('A000001','가상검증초','부산','검증교육지원청','부산 테스트로 10',
 '공립','초등학교','운영','NEIS-2026-test-reference',repeat('a',64),
 date '2026-10-31',true,650,35.5,25,
 '2026-school-info-proof-1',repeat('b',64),date '2026-10-31',
 true,10000000,'2026-property-proof-1',repeat('c',64),
 date '2026-10-31',true,'APPROVED',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '1 day',
 true,true,true,true,now()-interval '2 days'),
('A000002','가상부분초','부산','검증교육지원청','부산 테스트로 20',
 '공립','초등학교','운영','NEIS-2026-test-reference',repeat('d',64),
 date '2026-10-31',true,999,100,90,
 null,null,null,false,200000000,null,null,null,false,'APPROVED',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '1 day',
 true,true,true,true,now()-interval '2 days'),
('A000003','가상보류초','부산','검증교육지원청','부산 테스트로 30',
 '공립','초등학교','운영','NEIS-2026-test-reference',repeat('e',64),
 date '2026-10-31',true,33,10,11,
 null,null,null,false,40000,null,null,null,false,'PENDING',
 null,null,false,false,false,false,now()-interval '2 days'),
('A000004','가상미래초','부산','검증교육지원청','부산 테스트로 40',
 '공립','초등학교','운영','NEIS-2026-test-reference',repeat('f',64),
 date '2026-12-31',true,35,12,14,
 null,null,null,false,50000,null,null,null,false,'APPROVED',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '1 day',
 true,true,true,true,now()-interval '2 days');

set role service_role;
do $test$
begin
 if exists(select 1 from public.beagu_lv3_2026_school_facts_v1)
 then raise exception 'Lv3 OFF switch leaked official 2026 data';end if;
end;$test$;
reset role;

-- Synthesized authorization is deliberately only in this throwaway DB.
update beagu_private.lv3_release_control_v1 set enabled=true;
set role service_role;
do $test$
declare approved public.beagu_lv3_2026_school_facts_v1%rowtype;
 partial public.beagu_lv3_2026_school_facts_v1%rowtype;
begin
 if (select count(*) from public.beagu_lv3_2026_school_facts_v1)<>2
 then raise exception 'Unreviewed, future or malformed source leaked';end if;
 select * into approved from public.beagu_lv3_2026_school_facts_v1
  where school_id='A000001';
 if approved.student_count<>650 or approved.junior_teacher_ratio<>35.5
 or approved.housing_price_won<>10000000 or approved.reference_year<>2026
 or approved.student_reference_date<>date '2026-10-31'
 or approved.neis_as_of<>date '2026-10-31'
 or approved.beagu_percentile_2025<>42
 then raise exception 'Verified 2026 provenance/rates lost or 2025 percentile mislabeled';end if;
 select * into partial from public.beagu_lv3_2026_school_facts_v1
 where school_id='A000002';
 if partial.school_name<>'가상부분초'
 or partial.student_count is not null
 or partial.junior_teacher_ratio is not null
 or partial.male_teacher_ratio is not null
 or partial.housing_price_won is not null
 then raise exception 'Unverified fact was disguised as a confirmed 2026 number';end if;
end;$test$;
reset role;

-- Revoking the review owner's role immediately hides previously reviewed data.
update public.beagu_admin_accounts set enabled=false;
set role service_role;
do $test$
begin
 if exists(select 1 from public.beagu_lv3_2026_school_facts_v1)
 then raise exception 'Disabled owner still authorized publication';end if;
end;$test$;
reset role;
update public.beagu_admin_accounts set enabled=true;

-- Fresh source edits MUST reopen review rather than inherit prior approvals.
update beagu_private.lv3_official_school_facts_2026_v1
 set student_count=651 where school_id='A000001';
do $test$
begin
 if (select review_status from beagu_private.lv3_official_school_facts_2026_v1
  where school_id='A000001')<>'PENDING'
 then raise exception 'Source revision reused obsolete approval';end if;
end;$test$;
set role service_role;
do $test$
begin
 if exists(select 1 from public.beagu_lv3_2026_school_facts_v1
  where school_id='A000001')
 then raise exception 'Updated source without renewed review visible';end if;
end;$test$;
reset role;
update beagu_private.lv3_release_control_v1 set enabled=false;
select 'PASS: Lv3 gated 2026 official sources, 2025 baseline isolated, rejected/missing/future sources hidden, owner revocation and source revision invalidate' as result;
