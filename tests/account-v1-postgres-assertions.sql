DO $$
DECLARE a uuid; x uuid; v uuid:='10000000-0000-0000-0000-000000000001'; u uuid:='00000000-0000-0000-0000-000000000001'; other_user uuid:='00000000-0000-0000-0000-000000000002'; r jsonb; nick text;
BEGIN
 IF public.beagu_account_signup_v1('SYNTHETIC-ONE',repeat('b',64),repeat('c',64)) IS NOT NULL THEN RAISE EXCEPTION 'device theft'; END IF;
 a:=public.beagu_account_signup_v1('SYNTHETIC-ONE',repeat('a',64),repeat('c',64));
 IF a IS NULL OR public.beagu_account_signup_v1('SYNTHETIC-ONE',repeat('a',64),repeat('d',64)) IS NOT NULL THEN RAISE EXCEPTION 'signup uniqueness'; END IF;
 IF public.beagu_account_password_login_v1(a,repeat('d',64),repeat('1',64)) IS NOT NULL THEN RAISE EXCEPTION 'wrong credential accepted'; END IF;
 r:=public.beagu_account_password_login_v1(a,repeat('c',64),repeat('1',64));
 IF r->>'level' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Lv1 login failed'; END IF;
 nick:=r->>'nickname'; IF nick IS NULL OR nick !~ '^[Il|ǀ❘ı∣│]{10}$' THEN RAISE EXCEPTION 'nickname invalid'; END IF;
 IF NOT public.beagu_account_level_session_allowed_v1(repeat('1',64)) THEN RAISE EXCEPTION 'valid session denied'; END IF;
 IF public.beagu_account_formal_link_v1(u,'SYNTHETIC-ONE',repeat('a',64),repeat('1',64)) IS NOT NULL THEN RAISE EXCEPTION 'unearned formal tier'; END IF;
 UPDATE beagu_private.challenge_referral_profiles SET access_level=2,valid_referrals=1,upgraded_at=now() WHERE visitor_id=v;
 IF public.beagu_account_level_session_allowed_v1(repeat('1',64)) THEN RAISE EXCEPTION 'obsolete referral session survived'; END IF;
 r:=public.beagu_account_password_login_v1(a,repeat('c',64),repeat('2',64));
 IF r->>'level' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'earned entitlement missing'; END IF;
 IF public.beagu_account_formal_link_v1(u,'SYNTHETIC-ONE',repeat('a',64),repeat('3',64)) IS NOT NULL THEN RAISE EXCEPTION 'password session bypass'; END IF;
 x:=public.beagu_account_formal_link_v1(u,'SYNTHETIC-ONE',repeat('a',64),repeat('2',64));
 IF x IS NULL THEN RAISE EXCEPTION 'formal conversion failed'; END IF;
 IF public.beagu_account_password_login_v1(a,repeat('c',64),repeat('4',64)) IS NOT NULL OR public.beagu_account_session_status_v1(repeat('2',64)) IS NOT NULL THEN RAISE EXCEPTION 'old credential survived'; END IF;
 IF public.beagu_account_formal_link_v1(other_user,'SYNTHETIC-ONE',repeat('a',64),NULL) IS NOT NULL THEN RAISE EXCEPTION 'identity rebound'; END IF;
 IF public.beagu_account_formal_link_v1(u,'SYNTHETIC-ONE',repeat('a',64),NULL) IS DISTINCT FROM x THEN RAISE EXCEPTION 'retry not idempotent'; END IF;
 r:=public.beagu_account_formal_login_v1(u,repeat('5',64));
 IF r->>'formal' IS DISTINCT FROM 'true' OR r->>'level' IS DISTINCT FROM '2' OR r->>'nickname' IS DISTINCT FROM nick THEN RAISE EXCEPTION 'formal login failed'; END IF;
 IF (SELECT valid_referrals FROM beagu_private.challenge_referral_profiles WHERE visitor_id=v)<>1 THEN RAISE EXCEPTION 'referral changed'; END IF;
 BEGIN INSERT INTO public.beagu_postit_member_accounts(auth_user_id,identity_visitor_id,author_uid) VALUES(other_user,v,gen_random_uuid()); RAISE EXCEPTION 'cross-account takeover'; EXCEPTION WHEN others THEN IF sqlerrm<>'account identity conflict' THEN RAISE; END IF; END;
 IF NOT public.beagu_account_logout_v1(repeat('5',64)) THEN RAISE EXCEPTION 'logout deletion failed'; END IF;
 IF public.beagu_account_session_status_v1(repeat('5',64)) IS NOT NULL OR EXISTS(SELECT 1 FROM public.beagu_level_sessions WHERE token_sha256=repeat('5',64)) THEN RAISE EXCEPTION 'logout session survived'; END IF;
 IF public.beagu_account_formal_link_v1(other_user,'SYNTHETIC-TWO',repeat('b',64),NULL) IS NULL THEN RAISE EXCEPTION 'existing earned user cannot link directly'; END IF;
 IF has_function_privilege('anon','public.beagu_account_password_login_v1(uuid,text,text)','execute') OR has_table_privilege('authenticated','beagu_private.beagu_provisional_accounts_v1','select') THEN RAISE EXCEPTION 'private credentials exposed'; END IF;
 r:=public.beagu_account_formal_login_v1(u,repeat('7',64));
 UPDATE beagu_private.challenge_referral_profiles SET disabled=true WHERE visitor_id=v;
 IF public.beagu_account_level_session_allowed_v1(repeat('7',64)) OR EXISTS(SELECT 1 FROM public.beagu_level_sessions WHERE token_sha256=repeat('7',64)) THEN RAISE EXCEPTION 'disabled account session survived'; END IF;
 IF public.beagu_account_formal_login_v1(u,repeat('6',64)) IS NOT NULL THEN RAISE EXCEPTION 'disabled profile login'; END IF;
 RAISE NOTICE 'PASS account: original device, credential hashing, earned level, formal link, session revocation, preserved referral and identity conflicts';
END $$;

-- Simulate the next week without changing the live clock or data.
DO $$
DECLARE wk date:=beagu_private.beagu_account_week_v1(now()); next_at timestamptz;
 before_ids jsonb; before_credits jsonb;
BEGIN
 next_at:=((wk+7)::timestamp AT TIME ZONE 'Asia/Seoul');
 SELECT jsonb_agg(to_jsonb(a) ORDER BY visitor_id) INTO before_ids FROM beagu_private.beagu_account_identity_v1 a;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY visitor_id) INTO before_credits FROM beagu_private.challenge_referral_profiles r;
 IF (SELECT count(*) FROM beagu_private.beagu_account_nicknames_v1 WHERE week_start=wk+7)<>2 THEN RAISE EXCEPTION 'next aliases missing'; END IF;
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_account_nickname_members_v1 m WHERE
 beagu_private.beagu_account_alias_at_v1(m.visitor_id,next_at-interval '1 second') IS NULL OR
 beagu_private.beagu_account_alias_at_v1(m.visitor_id,next_at) IS NULL OR
 beagu_private.beagu_account_alias_at_v1(m.visitor_id,next_at-interval '1 second')=beagu_private.beagu_account_alias_at_v1(m.visitor_id,next_at)) THEN RAISE EXCEPTION 'boundary switch failed'; END IF;
 IF beagu_private.beagu_account_prepare_nicknames_v1(now(),500)<>0 THEN RAISE EXCEPTION 'not idempotent'; END IF;
 IF before_ids IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(a) ORDER BY visitor_id) FROM beagu_private.beagu_account_identity_v1 a) OR before_credits IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(r) ORDER BY visitor_id) FROM beagu_private.challenge_referral_profiles r) THEN RAISE EXCEPTION 'account/referral changed'; END IF;
 IF has_table_privilege('anon','beagu_private.beagu_account_nicknames_v1','select') OR has_table_privilege('authenticated','beagu_private.beagu_account_nicknames_v1','select') OR has_function_privilege('service_role','beagu_private.beagu_account_alias_at_v1(uuid,timestamptz)','execute') OR has_function_privilege('authenticated','beagu_private.beagu_account_prepare_nicknames_v1(timestamptz,integer)','execute') THEN RAISE EXCEPTION 'alias history access'; END IF;
 RAISE NOTICE 'PASS next aliases, exact KST boundary, private history and idempotence';
END $$;
