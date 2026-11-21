-- Run against isolated PostgreSQL service only.
do $test$
declare constraint_text text;
begin
 select pg_get_constraintdef(oid) into constraint_text
 from pg_constraint
 where conrelid='public.beagu_admin_audit_events'::regclass
  and conname='beagu_admin_audit_events_outcome_check';
 if constraint_text not like '%pending%'
 then raise exception 'Stage-15 pending audit outcome unavailable'; end if;
 if not exists(select 1 from pg_indexes where schemaname='public'
    and tablename='beagu_admin_audit_events'
    and indexname='beagu_member_moderation_request_v2_unique')
 then raise exception 'Atomic moderation request uniqueness index missing'; end if;
 if has_table_privilege('anon','public.beagu_admin_audit_events','SELECT')
   or has_table_privilege('authenticated','public.beagu_admin_audit_events','SELECT')
   or has_table_privilege('anon','public.beagu_admin_audit_events','INSERT')
   or has_table_privilege('authenticated','public.beagu_admin_audit_events','INSERT')
 then raise exception 'Public role can directly read/modify admin audit'; end if;
 if has_function_privilege('anon','public.beagu_admin_member_sms_status_v2(uuid[])','EXECUTE')
  or has_function_privilege('authenticated','public.beagu_admin_member_sms_status_v2(uuid[])','EXECUTE')
  or not has_function_privilege('service_role','public.beagu_admin_member_sms_status_v2(uuid[])','EXECUTE')
 then raise exception 'Verified SMS status RPC improperly exposed'; end if;
 if not (select relrowsecurity from pg_class
    where oid='public.beagu_admin_audit_events'::regclass)
 then raise exception 'Admin audit RLS missing'; end if;
end;
$test$;

-- Test audit intent write (before any Auth ban), duplicate-safe retries.
insert into public.beagu_admin_audit_events(
  actor_user_id,event_type,outcome,details
) values(
  '11111111-1111-4111-8111-111111111111',
  'member_moderation_requested','pending',
  '{"target_user_id":"22222222-2222-4222-8222-222222222222","request_id":"44444444-4444-4444-8444-444444444444","operation":"suspend_24h","reason":"서버 테스트 감사 기록"}'::jsonb
);
do $test$
declare blocked boolean:=false;
begin
 begin
  insert into public.beagu_admin_audit_events(
   actor_user_id,event_type,outcome,details
  ) values (
   '11111111-1111-4111-8111-111111111111',
   'member_moderation_requested','pending',
   '{"request_id":"44444444-4444-4444-8444-444444444444","target_user_id":"22222222-2222-4222-8222-222222222222"}'::jsonb
  );
 exception when unique_violation then blocked:=true;
 end;
 if blocked is not true then raise exception 'Duplicate request did not fail closed'; end if;
end;
$test$;

-- No user phone is returned even for service_role staff operations.
set role service_role;
do $test$
declare eligible integer;
begin
 select count(*) into eligible
 from public.beagu_admin_member_sms_status_v2(
  array['11111111-1111-4111-8111-111111111111']::uuid[]
 );
 if eligible<>1 then raise exception 'SMS status row missing'; end if;
 if exists(
  select 1 from public.beagu_admin_member_sms_status_v2(
   array['11111111-1111-4111-8111-111111111111']::uuid[]
  ) where sms_consent is true or phone_verified is true
 ) then raise exception 'Legacy SMS consent incorrectly marked verified'; end if;
end;
$test$;
reset role;

-- Confirming both opt-ins does NOT verify the phone automatically.
select public.beagu_member_sms_grant_v2(
 '11111111-1111-4111-8111-111111111111','01023456789',true,true,
 '55555555-5555-4555-8555-555555555555'
);
set role service_role;
do $test$
begin
 if not exists(
  select 1 from public.beagu_admin_member_sms_status_v2(
   array['11111111-1111-4111-8111-111111111111']::uuid[]
  ) where sms_consent is true and phone_verified is false and withdrawn_at is null
 ) then raise exception 'Verified opt-in was not represented without claiming phone verified'; end if;
end;
$test$;
reset role;
select public.beagu_member_sms_withdraw_v2(
 '11111111-1111-4111-8111-111111111111',
 '66666666-6666-4666-8666-666666666666'
);
set role service_role;
do $test$
begin
 if exists(
  select 1 from public.beagu_admin_member_sms_status_v2(
   array['11111111-1111-4111-8111-111111111111']::uuid[]
  ) where sms_consent is true or phone_verified is true
 ) then raise exception 'Withdrawn consent continues to show as active'; end if;
end;
$test$;
reset role;

select 'PASS: owner-only member management migration, audit idempotency, private SMS status' as result;
