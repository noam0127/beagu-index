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

-- Simulate the next week by aging rows; no wall-clock dependence.
DO $$
DECLARE before_rows jsonb; before_ids jsonb; before_credits jsonb; changed integer;
BEGIN
 SELECT jsonb_object_agg(visitor_id::text,nickname) INTO before_rows FROM beagu_private.beagu_account_nicknames_v1;
 SELECT jsonb_agg(to_jsonb(a) ORDER BY visitor_id) INTO before_ids FROM beagu_private.beagu_account_identity_v1 a;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY visitor_id) INTO before_credits FROM beagu_private.challenge_referral_profiles r;
 UPDATE beagu_private.beagu_account_nicknames_v1 SET week_start=week_start-7;
 changed:=beagu_private.beagu_account_rotate_nicknames_v1();
 IF changed<>2 THEN RAISE EXCEPTION 'offline member rotation incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_account_nicknames_v1 n WHERE nickname=before_rows->>visitor_id::text OR nickname !~ '^[Il|ǀ❘ı∣│]{10}$') THEN RAISE EXCEPTION 'invalid rotated nickname'; END IF;
 IF beagu_private.beagu_account_rotate_nicknames_v1()<>0 THEN RAISE EXCEPTION 'weekly retry rotated twice'; END IF;
 IF before_ids IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(a) ORDER BY visitor_id) FROM beagu_private.beagu_account_identity_v1 a) OR before_credits IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(r) ORDER BY visitor_id) FROM beagu_private.challenge_referral_profiles r) THEN RAISE EXCEPTION 'rotation modified account or referral data'; END IF;
 RAISE NOTICE 'PASS weekly KST barcode rotation: offline members, unique changed aliases, idempotence, preserved accounts and referrals';
END $$;
