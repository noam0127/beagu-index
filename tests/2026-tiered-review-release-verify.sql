-- SQL proof must execute only against disposable Postgres test fixture.
do $test$
begin
 if has_function_privilege('anon',
   'public.beagu_2026_tiered_released_question_results_v1(text,smallint)','EXECUTE')
 or has_function_privilege('authenticated',
   'public.beagu_2026_tiered_released_question_results_v1(text,smallint)','EXECUTE')
 or has_function_privilege('anon',
   'public.beagu_2026_lv2_released_question_results(text)','EXECUTE')
 or not has_function_privilege('service_role',
   'public.beagu_2026_tiered_released_question_results_v1(text,smallint)','EXECUTE')
 then raise exception 'Server release gate exposed to client RPC';end if;
 if has_table_privilege('anon','public.beagu_2026_results_snapshot','SELECT')
 or has_table_privilege('authenticated',
  'beagu_private.beagu_2026_publication_basis_review','SELECT')
 then raise exception 'Source aggregates or private consent review exposed';end if;
end;$test$;

set role service_role;
do $test$
declare
 q jsonb;
begin
 -- Approval happened 2 hours ago: Lv3 only, never before exact approval.
 if public.beagu_2026_tiered_released_question_results_v1('A000001',1) is not null
 or public.beagu_2026_tiered_released_question_results_v1('A000001',2) is not null
 then raise exception 'Lv1/Lv2 escaped before 24h/6h';end if;
 q:=public.beagu_2026_tiered_released_question_results_v1('A000001',3);
 if pg_catalog.jsonb_typeof(q)<>'array'
 then raise exception 'Owner/independent approved Lv3 should release immediately';end if;
 -- 7h: only verified Lv2 and Lv3, never Lv1.
 if public.beagu_2026_tiered_released_question_results_v1('A000002',1) is not null
 then raise exception 'Lv1 early release before 24h';end if;
 if public.beagu_2026_tiered_released_question_results_v1('A000002',2) is null
 or public.beagu_2026_lv2_released_question_results('A000002') is null
 then raise exception 'Lv2 6h release/legacy RPC bridge failed';end if;
 if public.beagu_2026_lv2_released_question_results('A000001') is not null
 then raise exception 'Legacy Lv2 immediate bypass retained';end if;

 -- 25h: all tiers see only the reviewed exact snapshot.
 if public.beagu_2026_tiered_released_question_results_v1('A000003',1) is null
 or public.beagu_2026_tiered_released_question_results_v1('A000003',2) is null
 or public.beagu_2026_tiered_released_question_results_v1('A000003',3) is null
 then raise exception 'Properly approved 24h release missing';end if;

 q:=public.beagu_2026_tiered_released_question_results_v1('A000003',3);
 if pg_catalog.jsonb_array_length(q)<>1 or q->0->>'id'<>'Q01'
 then raise exception 'Q31/Q51 privacy exclusions missing';end if;
 for i in 0..4 loop
  if public.beagu_2026_tiered_released_question_results_v1('A000003',i::smallint)
    is not null and i not in(1,2,3)
  then raise exception 'Unknown tier bypass';end if;
 end loop;
 if public.beagu_2026_tiered_released_question_results_v1('A00000!',3) is not null
 or public.beagu_2026_tiered_released_question_results_v1('NOTSCHOOL',3) is not null
 then raise exception 'Invalid school id accepted';end if;
end;$test$;
reset role;

update beagu_private.beagu_2026_publication_basis_review
 set review_status='PENDING' where school_id='A000004';
update public.beagu_2026_results_snapshot set approved_payload_sha256=repeat('c',64)
 where school_id='A000005';
update beagu_private.beagu_2026_publication_basis_review
 set reidentification_reviewed=false where school_id='A000006';

set role service_role;
do $test$
declare id text;tier integer;
begin
 foreach id in array array['A000004','A000005','A000006'] loop
  for tier in 1..3 loop
   if public.beagu_2026_tiered_released_question_results_v1(
      id,tier::smallint) is not null
   then raise exception 'Invalid basis/hash/privacy leaked % Lv%',id,tier;end if;
  end loop;
 end loop;
end;$test$;
reset role;

-- Invalidate an already released school: privilege must disappear on the
-- next server request, not after a 6-hour cache window.
update beagu_private.beagu_2026_publication_basis_review
 set review_status='REJECTED' where school_id='A000003';
set role service_role;
do $test$
begin
 if public.beagu_2026_tiered_released_question_results_v1('A000003',3) is not null
 or public.beagu_2026_tiered_released_question_results_v1('A000003',1) is not null
 then raise exception 'Rejected consent review did not revoke access';end if;
end;$test$;
reset role;
update beagu_private.beagu_2026_publication_basis_review
 set review_status='VERIFIED' where school_id='A000003';

-- A changed exact snapshot, a late update or future approval cannot inherit
-- a previous 24h/6h/instant approval.
update public.beagu_2026_results_snapshot
 set updated_at=now() where school_id='A000003';
set role service_role;
do $test$
begin
 if public.beagu_2026_tiered_released_question_results_v1('A000003',3) is not null
 then raise exception 'Changed source reused stale approval';end if;
end;$test$;
reset role;

select 'PASS: Lv1 24h, Lv2 6h, Lv3 approved-immediate, old Lv2 bridge, privacy revocation, stale snapshot, Q31/Q51 hidden' as result;
