-- Stage 18 isolated integration test. Never use production credentials.
do $t$
begin
 if not (select relrowsecurity from pg_class
  where oid='beagu_private.member_lv3_identity_links_v1'::regclass)
 or not (select relrowsecurity from pg_class
  where oid='beagu_private.member_lv3_link_events_v1'::regclass)
 then raise exception 'RLS absent on exclusive account linkage/audit';end if;
 if has_table_privilege('anon','beagu_private.member_lv3_identity_links_v1','SELECT')
 or has_table_privilege('authenticated','beagu_private.member_lv3_identity_links_v1','INSERT')
 or has_table_privilege('authenticated','beagu_private.member_lv3_link_events_v1','SELECT')
 then raise exception 'Browser roles must never access private identity links';end if;
 if has_function_privilege('anon','public.beagu_lv3_link_status_v1(uuid,uuid,uuid)','EXECUTE')
 or has_function_privilege('authenticated','public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid)','EXECUTE')
 or not has_function_privilege('service_role','public.beagu_lv3_link_status_v1(uuid,uuid,uuid)','EXECUTE')
 then raise exception 'Lv3 link status/binding exposed to browser';end if;
 if exists(select 1 from information_schema.columns
  where table_schema='beagu_private'
   and table_name in ('member_lv3_identity_links_v1','member_lv3_link_events_v1')
   and column_name in ('email','phone','password','token','device_secret','jwt','survey_response','code'))
 then raise exception 'Private linkage stores raw personal codes or credentials';end if;
end;$t$;

set role service_role;
do $t$
declare
 a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 b uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 c uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 anonymous uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 visitor1 uuid:='11111111-1111-4111-8111-111111111111';
 visitor2 uuid:='22222222-2222-4222-8222-222222222222';
 visitor3 uuid:='33333333-3333-4333-8333-333333333333';
 visitor4 uuid:='44444444-4444-4444-8444-444444444444';
 actor3 uuid:='99999999-9999-4999-8999-999999999999';
 actor4 uuid:='88888888-8888-4888-8888-888888888888';
 matched uuid;
 response jsonb;
begin
 -- Attested 2026 own-form answer + credited quality-review event.
 response:=public.beagu_2026_record_verified_response_v1(
  visitor3,repeat('3',64),now(),'approved');
 if response->>'ok'<>'true' then raise exception 'Own response attestation missing';end if;
 -- A second unrelated eligible visitor to exercise account/visitor uniqueness.
 insert into beagu_private.challenge_referral_profiles(
  campaign,visitor_id,identity_code_sha256,referral_token_sha256,
  access_level,valid_referrals,upgraded_at,disabled
 ) values (
  '2026',visitor4,encode(extensions.digest('P7K8M9X2T3','sha256'),'hex'),
  repeat('c',64),2,1,now(),false
 );
 insert into beagu_private.challenge_referral_events(
  event_sha256,campaign,referrer_visitor_id,referral_token_sha256,decision
 ) values(repeat('4',64),'2026',visitor4,repeat('c',64),'credited');
 insert into beagu_private.challenge_referral_quality_reviews(
  event_sha256,quality_status,form_quality_attested
 ) values(repeat('4',64),'MANUALLY_APPROVED',true);
 response:=public.beagu_2026_record_verified_response_v1(
   visitor4,repeat('4',64),now(),'approved');
 if response->>'ok'<>'true' then raise exception 'Second own response missing';end if;

 -- Only the trusted, original device with a verified qualified Lv2 may link.
 if public.beagu_postit_bind_verified_member(a,visitor1,repeat('d',64),actor3) is not null
 then raise exception 'Issued unverified Lv0 code linked to an Auth account';end if;
 if public.beagu_postit_bind_verified_member(a,visitor2,repeat('d',64),actor3) is not null
 then raise exception 'Lv1-only code linked as Lv3 candidate';end if;
 if public.beagu_postit_bind_verified_member(a,visitor3,repeat('f',64),actor3) is not null
 then raise exception 'Wrong device proof linked Auth account';end if;
 if public.beagu_postit_bind_verified_member(c,visitor3,repeat('d',64),actor3) is not null
 then raise exception 'Unconfirmed email linked account';end if;
 if public.beagu_postit_bind_verified_member(anonymous,visitor3,repeat('d',64),actor3) is not null
 then raise exception 'Anonymous Auth account linked Lv3';end if;

 matched:=public.beagu_postit_bind_verified_member(a,visitor3,repeat('d',64),actor3);
 if matched is distinct from actor3 then raise exception 'Verified original device+Auth not linked';end if;
 if public.beagu_lv3_link_status_v1(a,visitor3,actor3) is not true
 then raise exception 'Verified future Lv3 candidate not recorded';end if;
 if public.beagu_postit_bind_verified_member(a,visitor3,repeat('d',64),actor3)
   is distinct from actor3
 then raise exception 'Repeated identical linking should be idempotent';end if;
 if public.beagu_postit_bind_verified_member(b,visitor3,repeat('d',64),actor3) is not null
 then raise exception 'Other Auth account stole already linked Lv2 visitor';end if;
 if public.beagu_postit_bind_verified_member(a,visitor4,repeat('e',64),actor4) is not null
 then raise exception 'An account linked multiple Lv2 codes';end if;

 matched:=public.beagu_postit_bind_verified_member(b,visitor4,repeat('e',64),actor4);
 if matched is distinct from actor4 then raise exception 'Second independent original user link rejected';end if;
 if public.beagu_lv3_link_status_v1(b,visitor4,actor4) is not true
 then raise exception 'Second independent private account link missing';end if;
 if public.beagu_lv3_link_status_v1(b,visitor3,actor3) is true
 then raise exception 'Lv3 claim transferred to another account';end if;
 if (select count(*) from beagu_private.member_lv3_link_events_v1
  where event_kind='linked')<>2
 then raise exception 'Idempotent linking incorrectly created duplicate events';end if;

 -- A manually disqualified referral instantly invalidates the future Lv3
 -- candidate, while the audit and original stable author ID stay preserved.
 update beagu_private.challenge_referral_quality_reviews
  set quality_status='REVIEW_REQUIRED'
 where event_sha256=repeat('b',64);
 if public.beagu_lv3_link_status_v1(a,visitor3,actor3) is true
 then raise exception 'Rejected referral retains Lv3 eligibility';end if;
 if not exists(select 1 from public.beagu_postit_member_accounts
  where auth_user_id=a and identity_visitor_id=visitor3 and author_uid=actor3)
 then raise exception 'Stable original author attribution was erased';end if;
 update beagu_private.challenge_referral_quality_reviews
  set quality_status='AUTO_PASS' where event_sha256=repeat('b',64);
 update beagu_private.member_lv3_identity_links_v1
  set link_status='revoked' where auth_user_id=a;
 if public.beagu_lv3_link_status_v1(a,visitor3,actor3) is true
 then raise exception 'Revoked link still considered Lv3 ready';end if;
 if public.beagu_postit_bind_verified_member(a,visitor3,repeat('d',64),actor3) is not null
 then raise exception 'Revoked link was automatically restored without review';end if;

 if public.beagu_member_live_session_v1(
  a,'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa') is true
 then raise exception 'Expired original Supabase session still live';end if;
 if public.beagu_member_live_session_v1(
  a,'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa') is not true
 then raise exception 'Currently active Supabase session incorrectly rejected';end if;
 if public.beagu_member_live_session_v1(
  b,'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa') is true
 then raise exception 'Cross-account Auth session hijack accepted';end if;
end;$t$;
reset role;

do $t$
begin
 if (select count(*) from beagu_private.member_lv3_identity_links_v1)<>2
 then raise exception 'Failed claim attempts inserted extra links';end if;
 if (select count(*) from public.beagu_postit_member_accounts)<>2
 then raise exception 'Post-it writer links diverged from private identity ledger';end if;
 if not exists(select 1 from beagu_private.challenge_identity_codes
  where visitor_id='33333333-3333-4333-8333-333333333333'
    and identity_code='BG26-ABCDEF-GHJKLM')
 then raise exception 'Existing 2026 code was rewritten';end if;
end;$t$;

select 'PASS: Lv2+verified-email+original-device exclusive account binding, anti-theft, live Auth, idempotency, quality revocation and no Lv3 grant' as result;
