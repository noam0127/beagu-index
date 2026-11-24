DO $$
DECLARE a text:='SYNTHETIC-ONE'; b text:='SYNTHETIC-TWO'; v uuid:='10000000-0000-0000-0000-000000000001'; v2 uuid:='10000000-0000-0000-0000-000000000002'; legacy_actor uuid:=gen_random_uuid(); r jsonb; nick text; actor uuid;
BEGIN
 INSERT INTO public.beagu_postit_member_accounts(auth_user_id,identity_visitor_id,author_uid) VALUES('00000000-0000-0000-0000-000000000002',v2,legacy_actor);
 IF public.beagu_account_signup_v1('SYNTHETIC-ONE',repeat('b',64),repeat('c',64),repeat('d',64)) IS NOT NULL THEN RAISE EXCEPTION 'device theft'; END IF;
 r:=public.beagu_account_signup_v1('SYNTHETIC-ONE',repeat('a',64),repeat('c',64),repeat('d',64));
 IF r->>'account_id' IS DISTINCT FROM a::text OR r->>'lv2_active' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'signup badge'; END IF;
 IF public.beagu_account_signup_v1('SYNTHETIC-ONE',repeat('a',64),repeat('d',64),repeat('e',64)) IS NOT NULL THEN RAISE EXCEPTION 'signup uniqueness'; END IF;
 IF public.beagu_account_password_login_v1(a,repeat('d',64),repeat('1',64)) IS NOT NULL THEN RAISE EXCEPTION 'wrong password'; END IF;
 r:=public.beagu_account_password_login_v1(a,repeat('c',64),repeat('1',64));
 IF r->>'level' IS DISTINCT FROM '1' OR r->>'lv2_active' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Lv1 login'; END IF;
 nick:=r->>'nickname'; IF nick IS NULL OR nick !~ '^[Il|ǀ❘ı∣│]{10}$' THEN RAISE EXCEPTION 'nickname invalid'; END IF;
 IF public.beagu_account_postit_writer_v1(repeat('1',64)) IS NOT NULL THEN RAISE EXCEPTION 'Lv1 writer'; END IF;
 UPDATE beagu_private.challenge_referral_profiles SET access_level=2,valid_referrals=1,upgraded_at=now() WHERE visitor_id=v;
 IF public.beagu_account_level_session_allowed_v1(repeat('1',64)) THEN RAISE EXCEPTION 'old session survived referral change'; END IF;
 r:=public.beagu_account_password_login_v1(a,repeat('c',64),repeat('2',64));
 IF r->>'lv2_active' IS DISTINCT FROM 'true' OR r->>'nickname' IS DISTINCT FROM nick THEN RAISE EXCEPTION 'earned badge missing'; END IF;
 actor:=public.beagu_account_postit_writer_v1(repeat('2',64)); IF actor IS NULL THEN RAISE EXCEPTION 'Lv2 writer missing'; END IF;
 INSERT INTO public.beagu_level_sessions VALUES(repeat('9',64),2,now()+interval '30 minutes','2026',v);
 IF public.beagu_account_postit_writer_v1(repeat('9',64)) IS NOT NULL THEN RAISE EXCEPTION 'participation-only writer'; END IF;
 IF public.beagu_account_recover_v1(a,repeat('a',64),repeat('f',64),repeat('e',64)) IS NOT NULL THEN RAISE EXCEPTION 'recovery guessing'; END IF;
 IF public.beagu_account_recover_v1(a,repeat('d',64),repeat('d',64),repeat('e',64)) IS NOT NULL THEN RAISE EXCEPTION 'recovery reuse'; END IF;
 r:=public.beagu_account_recover_v1(a,repeat('d',64),repeat('f',64),repeat('e',64));
 IF r->>'account_id' IS DISTINCT FROM a::text OR r->>'lv2_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'recovery failed'; END IF;
 IF public.beagu_account_session_status_v1(repeat('2',64)) IS NOT NULL OR public.beagu_account_postit_writer_v1(repeat('2',64)) IS NOT NULL THEN RAISE EXCEPTION 'old session survived reset'; END IF;
 IF public.beagu_account_recover_v1(a,repeat('d',64),repeat('a',64),repeat('c',64)) IS NOT NULL THEN RAISE EXCEPTION 'used recovery accepted'; END IF;
 IF public.beagu_account_password_login_v1(a,repeat('c',64),repeat('3',64)) IS NOT NULL THEN RAISE EXCEPTION 'old password accepted'; END IF;
 r:=public.beagu_account_password_login_v1(a,repeat('e',64),repeat('4',64));
 IF r->>'nickname' IS DISTINCT FROM nick OR public.beagu_account_postit_writer_v1(repeat('4',64)) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'author/alias changed'; END IF;
 IF NOT public.beagu_account_logout_v1(repeat('4',64)) THEN RAISE EXCEPTION 'logout failed'; END IF;
 IF public.beagu_account_session_status_v1(repeat('4',64)) IS NOT NULL THEN RAISE EXCEPTION 'logout session survived'; END IF;
 r:=public.beagu_account_signup_v1('SYNTHETIC-TWO',repeat('b',64),repeat('c',64),repeat('b',64));
 IF r->>'lv2_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'legacy earned account'; END IF;
 r:=public.beagu_account_password_login_v1(b,repeat('c',64),repeat('5',64));
 IF public.beagu_account_postit_writer_v1(repeat('5',64)) IS DISTINCT FROM legacy_actor THEN RAISE EXCEPTION 'legacy author lost'; END IF;
 IF has_function_privilege('anon','public.beagu_account_recover_v1(text,text,text,text)','execute') OR has_table_privilege('service_role','beagu_private.beagu_anonymous_accounts_v1','select') OR has_function_privilege('service_role','public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid)','execute') OR to_regprocedure('public.beagu_account_formal_login_v1(uuid,text)') IS NOT NULL THEN RAISE EXCEPTION 'private credentials or social route exposed'; END IF;
 IF (SELECT valid_referrals FROM beagu_private.challenge_referral_profiles WHERE visitor_id=v)<>1 THEN RAISE EXCEPTION 'referral modified'; END IF;
 UPDATE beagu_private.challenge_referral_profiles SET disabled=true WHERE visitor_id=v2;
 IF public.beagu_account_postit_writer_v1(repeat('5',64)) IS NOT NULL OR public.beagu_account_password_login_v1(b,repeat('c',64),repeat('6',64)) IS NOT NULL THEN RAISE EXCEPTION 'disabled profile login'; END IF;
 RAISE NOTICE 'PASS anonymous signup, live Lv2 badge, one-use recovery, session revocation, legacy author, referral preservation and no social binding';
END $$;

-- Simulate the next week without changing the live clock or data.
DO $$
DECLARE wk date:=beagu_private.beagu_account_week_v1(now()); next_at timestamptz;
 before_ids jsonb; before_credits jsonb;
BEGIN
 next_at:=((wk+7)::timestamp AT TIME ZONE 'Asia/Seoul');
 SELECT jsonb_agg(to_jsonb(a) ORDER BY visitor_id) INTO before_ids FROM beagu_private.beagu_anonymous_accounts_v1 a;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY visitor_id) INTO before_credits FROM beagu_private.challenge_referral_profiles r;
 IF (SELECT count(*) FROM beagu_private.beagu_account_nicknames_v1 WHERE week_start=wk+7)<>2 THEN RAISE EXCEPTION 'next aliases missing'; END IF;
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_account_nickname_members_v1 m WHERE
 beagu_private.beagu_account_alias_at_v1(m.visitor_id,next_at-interval '1 second') IS NULL OR
 beagu_private.beagu_account_alias_at_v1(m.visitor_id,next_at) IS NULL OR
 beagu_private.beagu_account_alias_at_v1(m.visitor_id,next_at-interval '1 second')=beagu_private.beagu_account_alias_at_v1(m.visitor_id,next_at)) THEN RAISE EXCEPTION 'boundary switch failed'; END IF;
 IF beagu_private.beagu_account_prepare_nicknames_v1(now(),500)<>0 THEN RAISE EXCEPTION 'not idempotent'; END IF;
 IF before_ids IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(a) ORDER BY visitor_id) FROM beagu_private.beagu_anonymous_accounts_v1 a) OR before_credits IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(r) ORDER BY visitor_id) FROM beagu_private.challenge_referral_profiles r) THEN RAISE EXCEPTION 'account/referral changed'; END IF;
 IF has_table_privilege('anon','beagu_private.beagu_account_nicknames_v1','select') OR has_table_privilege('authenticated','beagu_private.beagu_account_nicknames_v1','select') OR has_function_privilege('service_role','beagu_private.beagu_account_alias_at_v1(uuid,timestamptz)','execute') OR has_function_privilege('authenticated','beagu_private.beagu_account_prepare_nicknames_v1(timestamptz,integer)','execute') THEN RAISE EXCEPTION 'alias history access'; END IF;
 RAISE NOTICE 'PASS next aliases, exact KST boundary, private history and idempotence';
END $$;

-- Public content alias projection never exposes stable member/author identity or old/future aliases.
DO $$
DECLARE v uuid:='10000000-0000-0000-0000-000000000002';
 u uuid:='00000000-0000-0000-0000-000000000002'; a uuid:=gen_random_uuid(); cur uuid:=gen_random_uuid(); old uuid:=gen_random_uuid(); future uuid:=gen_random_uuid();
 r jsonb; wk date:=beagu_private.beagu_account_week_v1(statement_timestamp()); expected text;
BEGIN
 SELECT author_uid INTO a FROM beagu_private.beagu_anonymous_accounts_v1 WHERE visitor_id=v;
 expected:=beagu_private.beagu_account_alias_at_v1(v,statement_timestamp());
 SELECT jsonb_agg(to_jsonb(z)) INTO r FROM public.beagu_account_postit_current_aliases_v1(jsonb_build_array(
 jsonb_build_object('item_id',cur,'author_uid',a,'created_at',statement_timestamp()),
 jsonb_build_object('item_id',old,'author_uid',a,'created_at',((wk-7)::timestamp AT TIME ZONE 'Asia/Seoul')),
 jsonb_build_object('item_id',future,'author_uid',a,'created_at',((wk+7)::timestamp AT TIME ZONE 'Asia/Seoul')))) z;
 IF r IS DISTINCT FROM jsonb_build_array(jsonb_build_object('item_id',cur,'nickname',expected)) THEN RAISE EXCEPTION 'public content alias leak or missing current alias: %',r; END IF;
 IF has_function_privilege('anon','public.beagu_account_postit_current_aliases_v1(jsonb)','execute') OR has_function_privilege('authenticated','public.beagu_account_postit_current_aliases_v1(jsonb)','execute') THEN RAISE EXCEPTION 'arbitrary alias lookup exposed'; END IF;
 RAISE NOTICE 'PASS current-week Post-it alias only, no old/future alias or stable author identifier';
END $$;

-- Exercise actual ACLs, not only browser controls. No production connection.
DO $$
DECLARE role_name text; fn text; tab text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH fn IN ARRAY ARRAY['public.beagu_account_signup_v1(text,text,text,text)','public.beagu_account_password_login_v1(text,text,text)','public.beagu_account_recover_v1(text,text,text,text)','public.beagu_account_session_status_v1(text)','public.beagu_account_logout_v1(text)','public.beagu_account_level_session_allowed_v1(text)','public.beagu_account_postit_writer_v1(text)','public.beagu_account_postit_current_aliases_v1(jsonb)'] LOOP
   IF has_function_privilege(role_name,fn,'EXECUTE') THEN RAISE EXCEPTION 'unexpected public execute: % %',role_name,fn; END IF;
  END LOOP;
 END LOOP;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOREACH tab IN ARRAY ARRAY['beagu_private.beagu_anonymous_accounts_v1','beagu_private.beagu_account_login_budget_v1','beagu_private.beagu_account_sessions_v1','beagu_private.beagu_account_nicknames_v1','beagu_private.beagu_account_nickname_members_v1'] LOOP
   IF has_table_privilege(role_name,tab,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'unexpected direct credential access: % %',role_name,tab; END IF;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'PASS explicit anonymous/authenticated RPC denial and no direct credential/alias table access even for service role';
END $$;
