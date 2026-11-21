-- Stage 19 synthetic-only DB verification. Release gate is toggled ONLY
-- inside disposable CI PostgreSQL, NEVER in production/staging Supabase.
do $t$
begin
 if not (select relrowsecurity from pg_class
   where oid='beagu_private.lv3_release_control_v1'::regclass)
 or not (select relrowsecurity from pg_class
   where oid='beagu_private.lv3_member_sessions_v1'::regclass)
 then raise exception 'Lv3 session or release RLS missing';end if;
 if has_table_privilege('anon','beagu_private.lv3_release_control_v1','SELECT')
 or has_table_privilege('authenticated','beagu_private.lv3_member_sessions_v1','SELECT')
 or has_table_privilege('service_role','beagu_private.lv3_release_control_v1','UPDATE')
 then raise exception 'Release control or session table exposed';end if;
 if has_function_privilege('authenticated','public.beagu_lv3_issue_session_v1(text,uuid,uuid,uuid)','EXECUTE')
 or has_function_privilege('anon','public.beagu_lv3_verify_session_v1(text,uuid,uuid,uuid)','EXECUTE')
 or has_function_privilege('authenticated','public.beagu_lv3_revoke_session_v1(text,uuid,uuid)','EXECUTE')
 or not has_function_privilege('service_role','public.beagu_lv3_issue_session_v1(text,uuid,uuid,uuid)','EXECUTE')
 then raise exception 'Lv3 service-only RPC grants are unsafe';end if;
 if exists(select 1 from information_schema.columns
  where table_schema='beagu_private' and table_name='lv3_member_sessions_v1'
  and column_name in ('token','raw_token','email','phone','identity_code','password','jwt','device_secret'))
 then raise exception 'Lv3 secret stored in cleartext';end if;
 if exists(select 1 from beagu_private.lv3_release_control_v1
    where enabled=true)
 then raise exception 'Lv3 unexpectedly enabled by migration';end if;
end;$t$;

-- Stage 18 test left the first synthetic link revoked: reinstate it
-- as a separately reviewed fake account to test stage 19. Real accounts
-- cannot be unilaterally restored by this migration.
update beagu_private.member_lv3_identity_links_v1
 set link_status='linked'
where auth_user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 and visitor_id='33333333-3333-4333-8333-333333333333';
set role service_role;
do $t$
declare
 a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 b uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 v uuid:='33333333-3333-4333-8333-333333333333';
 sid uuid:='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
 result jsonb;
begin
 result:=public.beagu_lv3_issue_session_v1(repeat('a',64),a,sid,v);
 if result->>'reason'<>'NOT_RELEASED'
 then raise exception 'Lv3 minted before administrator release gate';end if;
 if exists(select 1 from beagu_private.lv3_member_sessions_v1)
 then raise exception 'Release-disabled Lv3 session should not exist';end if;
 if public.beagu_lv3_verify_session_v1(repeat('a',64),a,sid,v) is true
 then raise exception 'Unreleased token verified';end if;
end;$t$;
reset role;

-- Fake approval strictly within disposable CI database.
update beagu_private.lv3_release_control_v1
 set enabled=true,
     approved_at=now(),
     approved_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
     reason='synthetic isolated database approval for test only',
     updated_at=now()
where singleton=true;

set role service_role;
do $t$
declare
 a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 b uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 v uuid:='33333333-3333-4333-8333-333333333333';
 wrong_v uuid:='44444444-4444-4444-8444-444444444444';
 sid uuid:='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
 sid_other uuid:='bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
 expired uuid:='aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';
 result jsonb;
begin
 if public.beagu_lv3_issue_session_v1(
  repeat('g',64),a,sid,v)->>'reason' <> 'INVALID_PROOF'
 then raise exception 'Invalid fake token hash accepted';end if;
 result:=public.beagu_lv3_issue_session_v1(repeat('1',64),a,expired,v);
 if result->>'reason'<>'NOT_ELIGIBLE'
 then raise exception 'Expired Auth session minted Lv3';end if;
 result:=public.beagu_lv3_issue_session_v1(repeat('1',64),b,sid_other,v);
 if result->>'reason'<>'NOT_ELIGIBLE'
 then raise exception 'Another Auth user stole visitor Lv3';end if;
 result:=public.beagu_lv3_issue_session_v1(repeat('1',64),a,sid,wrong_v);
 if result->>'reason'<>'NOT_ELIGIBLE'
 then raise exception 'Auth user issued a token for another visitor';end if;
 result:=public.beagu_lv3_issue_session_v1(repeat('1',64),a,sid,v);
 if result->>'ok'<>'true' or (result->>'level')::int<>3
 then raise exception 'Qualified Auth and Lv2 user could not issue Lv3';end if;
 if public.beagu_lv3_verify_session_v1(repeat('1',64),a,sid,v) is not true
 then raise exception 'Fresh Lv3 session not verified';end if;
 if public.beagu_lv3_verify_session_v1(repeat('1',64),b,sid_other,v) is true
 then raise exception 'Stolen token accepted by another Auth account';end if;
 if public.beagu_lv3_verify_session_v1(repeat('1',64),a,sid,wrong_v) is true
 then raise exception 'Token used for different 2026 visitor';end if;
 if public.beagu_lv3_verify_session_v1(repeat('2',64),a,sid,v) is true
 then raise exception 'Unknown bearer token verified';end if;
 if public.beagu_lv3_verify_session_v1(repeat('1',64),a,expired,v) is true
 then raise exception 'Expired Auth session reused Lv3 token';end if;

 result:=public.beagu_lv3_issue_session_v1(repeat('2',64),a,sid,v);
 if result->>'ok'<>'true' then raise exception 'Reissue failed';end if;
 if public.beagu_lv3_verify_session_v1(repeat('1',64),a,sid,v) is true
 then raise exception 'Reissued Lv3 token failed to revoke previous';end if;
 if public.beagu_lv3_verify_session_v1(repeat('2',64),a,sid,v) is not true
 then raise exception 'Reissued Lv3 not accepted';end if;

 -- Realtime quality invalidation must override unexpired bearer.
 update beagu_private.challenge_referral_quality_reviews
  set quality_status='REVIEW_REQUIRED'
 where event_sha256=repeat('b',64);
 if public.beagu_lv3_verify_session_v1(repeat('2',64),a,sid,v) is true
 then raise exception 'Disqualified referral continued authorizing Lv3';end if;
 update beagu_private.challenge_referral_quality_reviews
  set quality_status='AUTO_PASS'
 where event_sha256=repeat('b',64);
 if public.beagu_lv3_verify_session_v1(repeat('2',64),a,sid,v) is not true
 then raise exception 'Reinstated qualified referral not verified';end if;

 -- Stage 18 link suspension invalidates token immediately without
 -- clearing immutable author attribution or referral audit evidence.
 update beagu_private.member_lv3_identity_links_v1
 set link_status='suspended'
 where auth_user_id=a;
 if public.beagu_lv3_verify_session_v1(repeat('2',64),a,sid,v) is true
 then raise exception 'Suspended account retained Lv3';end if;
 update beagu_private.member_lv3_identity_links_v1
 set link_status='linked'
 where auth_user_id=a;
 if public.beagu_lv3_verify_session_v1(repeat('2',64),a,sid,v) is not true
 then raise exception 'Unsuspended test account unable to verify';end if;

 if public.beagu_lv3_revoke_session_v1(repeat('2',64),b,sid_other) is true
 then raise exception 'Other Auth account revoked a token';end if;
 if public.beagu_lv3_revoke_session_v1(repeat('2',64),a,sid) is not true
 then raise exception 'Own-session logout failed';end if;
 if public.beagu_lv3_verify_session_v1(repeat('2',64),a,sid,v) is true
 then raise exception 'Revoked token retained Lv3';end if;
 if public.beagu_lv3_revoke_session_v1(repeat('2',64),a,sid) is true
 then raise exception 'Repeated logout incorrectly says newly revoked';end if;
end;$t$;
reset role;

-- Release OFF must invalidate *even an otherwise valid, unexpired* token.
set role service_role;
do $t$
declare
 result jsonb;
begin
 result:=public.beagu_lv3_issue_session_v1(
  repeat('3',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333');
 if result->>'ok'<>'true' then raise exception 'Final token mint failed';end if;
end;$t$;
reset role;
update beagu_private.lv3_release_control_v1
 set enabled=false,updated_at=now() where singleton;
set role service_role;
do $t$
begin
 if public.beagu_lv3_verify_session_v1(
   repeat('3',64),
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
   '33333333-3333-4333-8333-333333333333') is true
 then raise exception 'Global Lv3 emergency-disable did not revoke live access';end if;
 if public.beagu_lv3_issue_session_v1(
   repeat('4',64),
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
   '33333333-3333-4333-8333-333333333333')->>'reason'<>'NOT_RELEASED'
 then raise exception 'Lv3 release switch did not block issuance';end if;
end;$t$;
reset role;
select 'PASS: default-off release, Auth/visitor binding, dual token, 30m expiry, reissue, quality demotion, suspension, logout and emergency revoke' as result;
