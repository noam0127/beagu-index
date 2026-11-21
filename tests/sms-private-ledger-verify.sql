-- Run ONLY against the disposable GitHub Actions Postgres service.
-- Every UUID and phone is synthetic; zero production database calls.
do $test$
declare
  profile beagu_private.member_sms_subscriptions_v1%rowtype;
  events_count int;
  has_direct boolean;
begin
  if exists (
    select 1 from pg_trigger t
    where t.tgrelid='auth.users'::regclass
    and t.tgname='capture_member_sms_consent_v1' and not t.tgisinternal
  ) then raise exception 'Legacy user-metadata consent trigger still active'; end if;
  if to_regprocedure('beagu_private.capture_member_sms_consent_v1()') is not null
  then raise exception 'Legacy metadata consent function still exists'; end if;
  if not (select relrowsecurity from pg_class
    where oid='beagu_private.member_sms_subscriptions_v1'::regclass)
  then raise exception 'Private subscriber table lacks RLS'; end if;
  if not (select relrowsecurity from pg_class
    where oid='beagu_private.member_sms_consent_events_v2'::regclass)
  then raise exception 'Private audit table lacks RLS'; end if;
  if has_table_privilege('anon','beagu_private.member_sms_subscriptions_v1','SELECT')
    or has_table_privilege('authenticated','beagu_private.member_sms_subscriptions_v1','SELECT')
    or has_table_privilege('authenticated','beagu_private.member_sms_subscriptions_v1','INSERT')
    or has_table_privilege('authenticated','beagu_private.member_sms_consent_events_v2','SELECT')
  then raise exception 'Browser role can read or modify private SMS data'; end if;
  if has_function_privilege('anon',
     'public.beagu_member_sms_grant_v2(uuid,text,boolean,boolean,uuid)','EXECUTE')
    or has_function_privilege('authenticated',
     'public.beagu_member_sms_grant_v2(uuid,text,boolean,boolean,uuid)','EXECUTE')
    or has_function_privilege('authenticated',
     'public.beagu_member_sms_withdraw_v2(uuid,uuid)','EXECUTE')
    or not has_function_privilege('service_role',
     'public.beagu_member_sms_grant_v2(uuid,text,boolean,boolean,uuid)','EXECUTE')
  then raise exception 'SMS RPC function EXECUTE ACL is wrong'; end if;
  select * into profile from beagu_private.member_sms_subscriptions_v1
    where user_id='11111111-1111-4111-8111-111111111111';
  if profile.phone_e164 is not null or profile.sms_consent is true
    or profile.phone_verified_at is not null
  then raise exception 'Synthetic legacy number not purged'; end if;
  select count(*) into events_count from beagu_private.member_sms_consent_events_v2
    where event_type='legacy_purged';
  if events_count<>1 then raise exception 'Legacy purge audit missing'; end if;
  if exists (select 1 from information_schema.columns
    where table_schema='beagu_private' and table_name='member_sms_consent_events_v2'
      and column_name in ('phone_e164','phone','email','token','ip_address','request_body')
  ) then raise exception 'Sensitive data column found in audit events'; end if;
end;
$test$;

-- Even the database owner modifying mutable Auth metadata cannot recreate consent.
update auth.users
set raw_user_meta_data='{"beagu_sms_opt_in":true,"beagu_sms_phone":"010-1111-2222"}'
where id='11111111-1111-4111-8111-111111111111';
do $test$
begin
 if exists(select 1 from beagu_private.member_sms_subscriptions_v1
   where user_id='11111111-1111-4111-8111-111111111111'
     and (sms_consent or phone_e164 is not null))
 then raise exception 'Mutable metadata unexpectedly re-enabled consent'; end if;
end;$test$;

-- Simulate the trusted Edge Function calling the server-only RPC.
set role service_role;
do $test$
declare
 grant_result jsonb;
 status_result jsonb;
 withdraw_result jsonb;
begin
 grant_result := public.beagu_member_sms_grant_v2(
  '11111111-1111-4111-8111-111111111111','010-2345-6789',true,true,
  '44444444-4444-4444-8444-444444444444'
 );
 if grant_result->>'ok' <> 'true' then raise exception 'Explicit grant rejected'; end if;
 status_result := public.beagu_member_sms_status_v2(
   '11111111-1111-4111-8111-111111111111');
 if status_result->>'consented' <> 'true'
   or status_result->>'phone_verified'<>'false'
   or status_result->>'send_eligible'<>'false'
 then raise exception 'Unverified phone incorrectly sendable'; end if;
 grant_result := public.beagu_member_sms_grant_v2(
  '11111111-1111-4111-8111-111111111111','010-2345-6789',false,true,
  '55555555-5555-4555-8555-555555555555');
 if grant_result->>'ok' <> 'false'
 then raise exception 'Incomplete consent accepted'; end if;
 grant_result := public.beagu_member_sms_grant_v2(
  '22222222-2222-4222-8222-222222222222','010-2345-6789',true,true,
  '66666666-6666-4666-8666-666666666666');
 if grant_result->>'ok' <> 'false'
 then raise exception 'Unconfirmed email was allowed to consent'; end if;
 grant_result := public.beagu_member_sms_grant_v2(
  '33333333-3333-4333-8333-333333333333','010-2345-6789',true,true,
  '77777777-7777-4777-8777-777777777777');
 if grant_result->>'ok' <> 'false'
 then raise exception 'Anonymous Auth user was allowed to consent'; end if;
 withdraw_result := public.beagu_member_sms_withdraw_v2(
  '11111111-1111-4111-8111-111111111111',
  '88888888-8888-4888-8888-888888888888'
 );
 if withdraw_result->>'ok' <> 'true'
 then raise exception 'Consent withdrawal failed'; end if;
 status_result := public.beagu_member_sms_status_v2(
   '11111111-1111-4111-8111-111111111111');
 if status_result->>'consented' <> 'false' or status_result->>'send_eligible' <> 'false'
 then raise exception 'Withdrawal left SMS consent active'; end if;
end;
$test$;
reset role;

do $test$
declare
 profile beagu_private.member_sms_subscriptions_v1%rowtype;
 audit_count integer;
begin
 select * into profile from beagu_private.member_sms_subscriptions_v1
   where user_id='11111111-1111-4111-8111-111111111111';
 if profile.phone_e164 is not null or profile.sms_consent is true
   or profile.phone_collection_consent is true
   or profile.phone_verified_at is not null
 then raise exception 'Withdrawal failed to erase private phone'; end if;
 if profile.withdrawn_at is null then raise exception 'Withdrawal timestamp missing'; end if;
 select count(*) into audit_count from beagu_private.member_sms_consent_events_v2
   where user_id='11111111-1111-4111-8111-111111111111';
 if audit_count<>3 then raise exception 'Expected legacy, grant, withdraw audit events'; end if;
 -- Synthetic Auth user deletion MUST cascade to the subscription and audit data.
 delete from auth.users where id='11111111-1111-4111-8111-111111111111';
 if exists(select 1 from beagu_private.member_sms_subscriptions_v1
   where user_id='11111111-1111-4111-8111-111111111111')
   or exists(select 1 from beagu_private.member_sms_consent_events_v2
   where user_id='11111111-1111-4111-8111-111111111111')
 then raise exception 'Account deletion failed to cascade'; end if;
end;$test$;

select 'PASS: disposable PostgreSQL SMS private consent, RLS, authorization and erasure checks' as result;
