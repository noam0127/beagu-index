-- Do not run against production. Exercises synthetic database only.
do $test$
begin
 if not (select relrowsecurity from pg_class
  where oid='beagu_private.challenge_2026_verified_responses_v1'::regclass)
 then raise exception 'Verified response ledger lacks RLS';end if;
 if not (select relrowsecurity from pg_class
  where oid='beagu_private.challenge_2026_verification_events_v1'::regclass)
 then raise exception 'Attestation event ledger lacks RLS';end if;
 if has_table_privilege('anon','beagu_private.challenge_2026_verified_responses_v1','SELECT')
 or has_table_privilege('authenticated','beagu_private.challenge_2026_verified_responses_v1','INSERT')
 or has_table_privilege('authenticated','beagu_private.challenge_2026_verification_events_v1','SELECT')
 then raise exception 'Browser roles can read/write private verification';end if;
 if has_function_privilege('anon','public.beagu_2026_verified_code_level_v1(text)','EXECUTE')
 or has_function_privilege('authenticated','public.beagu_2026_record_verified_response_v1(uuid,text,timestamptz,text)','EXECUTE')
 or has_function_privilege('authenticated','public.beagu_has_earned_challenge_visitor(uuid)','EXECUTE')
 or not has_function_privilege('service_role','public.beagu_2026_verified_code_level_v1(text)','EXECUTE')
 then raise exception 'Unauthorized level resolver callable';end if;
 if exists(select 1 from information_schema.columns
  where table_schema='beagu_private'
   and table_name in ('challenge_2026_verified_responses_v1','challenge_2026_verification_events_v1')
   and column_name in ('email','phone','password','raw_answers','response_body','token','ip_address'))
 then raise exception 'Private 2026 ledger stores raw personal data';end if;
end;$test$;

set role service_role;
do $test$
declare
 a jsonb;
 b jsonb;
 result jsonb;
 rejected boolean:=false;
begin
 -- Every issued code begins at Lv0 absent independently verified own response.
 a:=public.beagu_2026_verified_code_level_v1('K7M9Q2X4T8');
 if a->>'known'<>'true' or (a->>'level')::int<>0
 then raise exception 'Issued unverified 2026 code must be Lv0';end if;
 a:=public.beagu_2026_verified_code_level_v1('UNISSUED2026');
 if a is not null then raise exception 'Unissued code accepted';end if;
 a:=public.beagu_2026_verified_code_level_v1('BG26-ABCDEF-GHJKLM');
 if a->>'known'<>'true' or (a->>'level')::int<>0
 then raise exception 'Referral-credited but own-survey-unverified code received Lv2';end if;

 result:=public.beagu_2026_record_verified_response_v1(
   '22222222-2222-4222-8222-222222222222',repeat('2',64),now(),'approved');
 if result->>'ok'<>'true' then raise exception 'Own verified 2026 response rejected';end if;
 a:=public.beagu_2026_verified_code_level_v1('BG26-ABCD-EF12-3456-789A-BCDE');
 if (a->>'level')::int<>1
 then raise exception 'Inactive but verified 2026 code was NOT Lv1';end if;
 result:=public.beagu_2026_record_verified_response_v1(
   '22222222-2222-4222-8222-222222222222',repeat('2',64),now(),'approved');
 if result->>'duplicate'<>'true' then raise exception 'Repeated same source not idempotent';end if;
 if (select count(*) from beagu_private.challenge_2026_verification_events_v1
     where visitor_id='22222222-2222-4222-8222-222222222222')<>1
 then raise exception 'Duplicate response created extra audit';end if;

 result:=public.beagu_2026_record_verified_response_v1(
   '33333333-3333-4333-8333-333333333333',repeat('3',64),now(),'approved');
 if result->>'ok'<>'true' then raise exception 'Trusted own-survey evidence failed';end if;
 a:=public.beagu_2026_verified_code_level_v1('BG26-ABCDEF-GHJKLM');
 if (a->>'level')::int<>2
 then raise exception 'Quality approved one referral did not enable Lv2';end if;
 if public.beagu_has_earned_challenge_visitor('33333333-3333-4333-8333-333333333333') is not true
 then raise exception 'Live Post-it visitor validation not upgraded';end if;
 if public.beagu_earned_challenge_visitor('BG26-ABCDEF-GHJKLM')
   is distinct from '33333333-3333-4333-8333-333333333333'::uuid
 then raise exception 'Legacy alias does not honor earned qualified code';end if;

 -- Pending quality review or disabled referral immediately DEMOTES to Lv1.
 update beagu_private.challenge_referral_quality_reviews
 set quality_status='REVIEW_REQUIRED' where event_sha256=repeat('b',64);
 if public.beagu_2026_verified_visitor_level_v1(
    '33333333-3333-4333-8333-333333333333')<>1
 then raise exception 'Pending quality referral still Lv2';end if;
 update beagu_private.challenge_referral_quality_reviews
 set quality_status='AUTO_PASS',form_quality_attested=false
 where event_sha256=repeat('b',64);
 if public.beagu_2026_verified_visitor_level_v1(
    '33333333-3333-4333-8333-333333333333')<>1
 then raise exception 'Non-attested Form quality got Lv2';end if;
 update beagu_private.challenge_referral_quality_reviews
 set quality_status='MANUALLY_APPROVED'
 where event_sha256=repeat('b',64);
 if public.beagu_2026_verified_visitor_level_v1(
    '33333333-3333-4333-8333-333333333333')<>2
 then raise exception 'Manual referral review with credited event not Lv2';end if;
 update beagu_private.challenge_referral_profiles
 set disabled=true where visitor_id='33333333-3333-4333-8333-333333333333';
 if public.beagu_has_earned_challenge_visitor(
    '33333333-3333-4333-8333-333333333333') is true
 then raise exception 'Disabled referral still grants Lv2';end if;
 if public.beagu_2026_verified_visitor_level_v1(
    '33333333-3333-4333-8333-333333333333')<>1
 then raise exception 'Disabled referral did not revert Lv1';end if;
 update beagu_private.challenge_referral_profiles
 set disabled=false where visitor_id='33333333-3333-4333-8333-333333333333';

 -- Revoke OWN survey: all levels must disappear even with a credited referral.
 result:=public.beagu_2026_record_verified_response_v1(
   '33333333-3333-4333-8333-333333333333',repeat('3',64),now(),'revoked');
 if result->>'ok'<>'true' then raise exception 'Revocation not recorded';end if;
 if public.beagu_2026_verified_visitor_level_v1(
    '33333333-3333-4333-8333-333333333333')<>0
 then raise exception 'Own response revoked but access persisted';end if;
 if public.beagu_earned_challenge_visitor('BG26-ABCDEF-GHJKLM') is not null
 then raise exception 'Old referral RPC bypasses withdrawn own-response proof';end if;

 -- One validated response cannot be recycled to a different visitor/code.
 begin
   result:=public.beagu_2026_record_verified_response_v1(
    '11111111-1111-4111-8111-111111111111',repeat('2',64),now(),'approved');
 exception when unique_violation then rejected:=true;
 end;
 if not rejected then raise exception 'One survey proof applied to multiple codes';end if;

 -- Backfill never rewrites issued 10/12/26-character code values.
 if not exists(select 1 from beagu_private.challenge_identity_codes
   where visitor_id='22222222-2222-4222-8222-222222222222'
     and identity_code='BG26-ABCD-EF12-3456-789A-BCDE')
 or not exists(select 1 from beagu_private.challenge_identity_codes
   where visitor_id='33333333-3333-4333-8333-333333333333'
     and identity_code='BG26-ABCDEF-GHJKLM')
 then raise exception 'Existing identity code changed';end if;
end;$test$;
reset role;

do $test$
begin
 if not exists(select 1 from public.beagu_level_codes
  where code_sha256=encode(extensions.digest('LEGACY-TEST-CODE','sha256'),'hex')
   and access_level=2 and active=true)
 then raise exception 'Legacy 2023-2025 code was modified';end if;
 if exists(select 1 from beagu_private.challenge_2026_verified_responses_v1
    where visitor_id='11111111-1111-4111-8111-111111111111')
 then raise exception 'Duplicate proof erroneously created self-survey record';end if;
end;$test$;
select 'PASS: 2026 own-survey Lv1, verified credited Lv2, revocation demotion, no auto-grant, legacy unchanged' as result;
