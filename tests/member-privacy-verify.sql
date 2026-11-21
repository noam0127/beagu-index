-- Synthetic cases ONLY, PostgreSQL 16 disposable container.
do $t$
begin
 if not (select relrowsecurity from pg_class
  where oid='beagu_private.member_privacy_requests_v1'::regclass)
 then raise exception 'Private request table RLS missing';end if;
 if has_table_privilege('anon','beagu_private.member_privacy_requests_v1','SELECT')
   or has_table_privilege('authenticated','beagu_private.member_privacy_requests_v1','SELECT')
   or has_table_privilege('authenticated','beagu_private.member_privacy_requests_v1','INSERT')
 then raise exception 'Browser role has access to private privacy requests';end if;
 if has_function_privilege('anon','public.beagu_member_privacy_request_v1(uuid,text,uuid)','EXECUTE')
  or has_function_privilege('authenticated','public.beagu_member_privacy_cancel_v1(uuid,text)','EXECUTE')
  or has_function_privilege('authenticated','public.beagu_member_privacy_status_v1(uuid)','EXECUTE')
  or not has_function_privilege('service_role','public.beagu_member_privacy_request_v1(uuid,text,uuid)','EXECUTE')
 then raise exception 'Privacy RPC ACL not service-only';end if;
 if exists(select 1 from information_schema.columns
  where table_schema='beagu_private'
    and table_name='member_privacy_requests_v1'
    and column_name in ('email','phone','phone_e164','password','jwt','token','ip_address','body'))
 then raise exception 'Sensitive original data column found in privacy queue';end if;
 if has_function_privilege('anon','public.beagu_admin_privacy_queue_v1(int)','EXECUTE')
    or has_function_privilege('authenticated','public.beagu_admin_privacy_queue_v1(int)','EXECUTE')
    or not has_function_privilege('service_role','public.beagu_admin_privacy_queue_v1(int)','EXECUTE')
 then raise exception 'Owner privacy queue RPC incorrectly exposed';end if;
 if not exists(select 1 from pg_indexes
  where schemaname='beagu_private' and tablename='member_privacy_requests_v1'
    and indexname='member_privacy_active_one_v1')
 then raise exception 'Concurrent duplicate request constraint missing';end if;
end;$t$;

set role service_role;
do $t$
declare
 request jsonb;
 request2 jsonb;
 current_status jsonb;
begin
 if public.beagu_member_live_session_v1(
  '11111111-1111-4111-8111-111111111111',
  '99999999-9999-4999-8999-999999999999') is not true
 then raise exception 'Active identity session failed';end if;
 if public.beagu_member_live_session_v1(
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is true
 then raise exception 'Expired Auth session accepted';end if;
 if public.beagu_member_live_session_v1(
  '22222222-2222-4222-8222-222222222222',
  '99999999-9999-4999-8999-999999999999') is true
 then raise exception 'Cross-account Auth session accepted';end if;

 request := public.beagu_member_privacy_request_v1(
  '11111111-1111-4111-8111-111111111111',
  'deletion','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 if request->>'status'<>'pending' then raise exception 'Deletion queue request failed';end if;
 request2 := public.beagu_member_privacy_request_v1(
  '11111111-1111-4111-8111-111111111111',
  'deletion','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
 if request2->>'status'<>'already_pending'
 then raise exception 'Duplicate delete request not idempotent';end if;
 if not exists(select 1 from public.beagu_admin_privacy_queue_v1(30)
   where user_id='11111111-1111-4111-8111-111111111111' and kind='deletion'
     and status='pending')
 then raise exception 'Owner privacy inbox does not show pending request';end if;
 current_status := public.beagu_member_privacy_status_v1(
  '11111111-1111-4111-8111-111111111111');
 if current_status->'deletion'->>'status'<>'pending'
 then raise exception 'Owner status does not report pending delete request';end if;

 request := public.beagu_member_privacy_request_v1(
  '11111111-1111-4111-8111-111111111111',
  'access','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 if request->>'status'<>'pending' then raise exception 'Access request rejected';end if;

 request := public.beagu_member_privacy_request_v1(
  '22222222-2222-4222-8222-222222222222',
  'deletion','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 if request->>'ok'<>'false' or request->>'code'<>'AUTH_REQUIRED'
 then raise exception 'Unconfirmed user could create privacy request';end if;

 request := public.beagu_member_privacy_request_v1(
  '33333333-3333-4333-8333-333333333333',
  'access','ffffffff-ffff-4fff-8fff-ffffffffffff');
 if request->>'ok'<>'false' or request->>'code'<>'AUTH_REQUIRED'
 then raise exception 'Anonymous account could create access request';end if;

 request := public.beagu_member_privacy_request_v1(
  '44444444-4444-4444-8444-444444444444',
  'deletion','12345678-1234-4234-8234-123456789012');
 if request->>'ok'<>'false' or request->>'code'<>'ADMIN_REVIEW_REQUIRED'
 then raise exception 'Owner self-service deletion request was not blocked';end if;

 request := public.beagu_member_privacy_cancel_v1(
  '11111111-1111-4111-8111-111111111111','deletion');
 if request->>'status'<>'cancelled' then raise exception 'Deletion cancellation failed';end if;
 request2 := public.beagu_member_privacy_cancel_v1(
  '11111111-1111-4111-8111-111111111111','deletion');
 if request2->>'ok'<>'false' or request2->>'code'<>'NOT_PENDING'
 then raise exception 'Repeated cancellation should not falsely succeed';end if;
end;$t$;
reset role;

do $t$
declare
 c integer;
begin
 if not exists(select 1 from auth.users
  where id='11111111-1111-4111-8111-111111111111')
 then raise exception 'Privacy deletion request accidentally deleted Auth account';end if;
 select count(*) into c from beagu_private.member_privacy_requests_v1
  where user_id='11111111-1111-4111-8111-111111111111'
    and kind='deletion' and status='cancelled';
 if c<>1 then raise exception 'Cancellation request audit missing';end if;

 update beagu_private.member_privacy_requests_v1
  set status='processing',updated_at=now()
 where user_id='11111111-1111-4111-8111-111111111111'
  and kind='access' and status='pending';
end;$t$;

set role service_role;
do $t$
declare response jsonb;
begin
 response:=public.beagu_member_privacy_cancel_v1(
  '11111111-1111-4111-8111-111111111111','access');
 if response->>'code'<>'PROCESSING'
 then raise exception 'Processing access request should not be cancelled';end if;
end;$t$;
reset role;

select 'PASS: private privacy queue, verified live session, dedup, owner exclusion, safe cancellation and no deletion' as result;
