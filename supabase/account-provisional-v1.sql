-- Approval-only candidate. Apply after account-identity-v1.sql. No live backfill.
CREATE TABLE beagu_private.beagu_provisional_accounts_v1(
 account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 visitor_id uuid UNIQUE NOT NULL,
 password_hash text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beagu_private.beagu_account_login_budget_v1(
 account_id uuid PRIMARY KEY, bucket timestamptz NOT NULL, attempts integer NOT NULL
);
CREATE TABLE beagu_private.beagu_account_sessions_v1(
 token_sha256 text PRIMARY KEY REFERENCES public.beagu_level_sessions(token_sha256) ON DELETE CASCADE,
 visitor_id uuid NOT NULL, account_id uuid, expires_at timestamptz NOT NULL
);
ALTER TABLE beagu_private.beagu_provisional_accounts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_account_login_budget_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_account_sessions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_provisional_accounts_v1,beagu_private.beagu_account_login_budget_v1,beagu_private.beagu_account_sessions_v1 FROM PUBLIC,anon,authenticated;
CREATE TABLE beagu_private.beagu_account_nickname_members_v1(
 visitor_id uuid PRIMARY KEY, prepared_through date NOT NULL DEFAULT '-infinity'
);
CREATE INDEX beagu_account_nickname_pending_idx ON beagu_private.beagu_account_nickname_members_v1(prepared_through,visitor_id);
CREATE TABLE beagu_private.beagu_account_nicknames_v1(
 visitor_id uuid NOT NULL REFERENCES beagu_private.beagu_account_nickname_members_v1(visitor_id) ON DELETE CASCADE,
 week_start date NOT NULL,
 nickname text COLLATE "C" NOT NULL UNIQUE CHECK(nickname ~ '^[Il|ǀ❘ı∣│]{10}$'),
 PRIMARY KEY(visitor_id,week_start)
);
CREATE INDEX beagu_account_nickname_week_idx ON beagu_private.beagu_account_nicknames_v1(week_start,visitor_id);
ALTER TABLE beagu_private.beagu_account_nickname_members_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_account_nicknames_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_account_nickname_members_v1,beagu_private.beagu_account_nicknames_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION beagu_private.beagu_account_week_v1(p_at timestamptz)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT date_trunc('week',p_at AT TIME ZONE 'Asia/Seoul')::date
$$;
-- Registry row lock serializes allocation for this member only.
CREATE FUNCTION beagu_private.beagu_account_allocate_nickname_v1(p_visitor uuid,p_week date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result text; candidate text; rnd bytea; alphabet constant text:='Il|ǀ❘ı∣│';
BEGIN
 SELECT nickname INTO result FROM beagu_private.beagu_account_nicknames_v1 WHERE visitor_id=p_visitor AND week_start=p_week;
 IF result IS NOT NULL THEN RETURN result; END IF;
 FOR i IN 1..64 LOOP
  rnd:=extensions.gen_random_bytes(10); candidate:='';
  FOR j IN 0..9 LOOP candidate:=candidate||substr(alphabet,1+get_byte(rnd,j)%8,1); END LOOP;
  INSERT INTO beagu_private.beagu_account_nicknames_v1(visitor_id,week_start,nickname)
  VALUES(p_visitor,p_week,candidate) ON CONFLICT DO NOTHING RETURNING nickname INTO result;
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT nickname INTO result FROM beagu_private.beagu_account_nicknames_v1 WHERE visitor_id=p_visitor AND week_start=p_week;
  IF result IS NOT NULL THEN RETURN result; END IF;
 END LOOP;
 RAISE EXCEPTION 'nickname allocation unavailable';
END $$;
CREATE FUNCTION beagu_private.beagu_account_nickname_v1(p_visitor uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result text; wk date:=beagu_private.beagu_account_week_v1(statement_timestamp());
BEGIN
 SELECT nickname INTO result FROM beagu_private.beagu_account_nicknames_v1 WHERE visitor_id=p_visitor AND week_start=wk;
 IF result IS NOT NULL THEN RETURN result; END IF;
 INSERT INTO beagu_private.beagu_account_nickname_members_v1(visitor_id) VALUES(p_visitor) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM beagu_private.beagu_account_nickname_members_v1 WHERE visitor_id=p_visitor FOR UPDATE;
 result:=beagu_private.beagu_account_allocate_nickname_v1(p_visitor,wk);
 PERFORM beagu_private.beagu_account_allocate_nickname_v1(p_visitor,wk+7);
 UPDATE beagu_private.beagu_account_nickname_members_v1 SET prepared_through=greatest(prepared_through,wk+7) WHERE visitor_id=p_visitor;
 RETURN result;
END $$;
-- Bounded transactions; no global authentication lock. Private clock argument enables boundary tests.
CREATE FUNCTION beagu_private.beagu_account_prepare_nicknames_v1(p_at timestamptz,p_limit integer DEFAULT 500)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid; total integer:=0; wk date:=beagu_private.beagu_account_week_v1(p_at);
BEGIN
 IF p_at IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid batch'; END IF;
 FOR v IN SELECT visitor_id FROM beagu_private.beagu_account_nickname_members_v1
 WHERE prepared_through<wk+7 ORDER BY prepared_through,visitor_id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  PERFORM beagu_private.beagu_account_allocate_nickname_v1(v,wk);
  PERFORM beagu_private.beagu_account_allocate_nickname_v1(v,wk+7);
  UPDATE beagu_private.beagu_account_nickname_members_v1 SET prepared_through=wk+7 WHERE visitor_id=v;
  total:=total+1;
 END LOOP;
 RETURN total;
END $$;
CREATE FUNCTION beagu_private.beagu_account_prune_nicknames_v1(p_at timestamptz,p_limit integer DEFAULT 1000)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 IF p_at IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid batch'; END IF;
 WITH expired AS (SELECT visitor_id,week_start FROM beagu_private.beagu_account_nicknames_v1
 WHERE week_start<beagu_private.beagu_account_week_v1(p_at)-7 ORDER BY week_start,visitor_id LIMIT p_limit FOR UPDATE SKIP LOCKED)
 DELETE FROM beagu_private.beagu_account_nicknames_v1 a USING expired e WHERE a.visitor_id=e.visitor_id AND a.week_start=e.week_start;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
CREATE FUNCTION beagu_private.beagu_account_alias_at_v1(p_visitor uuid,p_at timestamptz)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT nickname FROM beagu_private.beagu_account_nicknames_v1
 WHERE visitor_id=p_visitor AND week_start=beagu_private.beagu_account_week_v1(p_at)
$$;
REVOKE ALL ON FUNCTION beagu_private.beagu_account_week_v1(timestamptz),beagu_private.beagu_account_allocate_nickname_v1(uuid,date),beagu_private.beagu_account_nickname_v1(uuid),beagu_private.beagu_account_prepare_nicknames_v1(timestamptz,integer),beagu_private.beagu_account_prune_nicknames_v1(timestamptz,integer),beagu_private.beagu_account_alias_at_v1(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
-- Register previously verified Post-it members without reassigning author identities.
INSERT INTO beagu_private.beagu_account_nickname_members_v1(visitor_id)
 SELECT identity_visitor_id FROM public.beagu_postit_member_accounts ON CONFLICT DO NOTHING;
CREATE FUNCTION beagu_private.beagu_account_register_postit_alias_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM beagu_private.beagu_account_nickname_v1(NEW.identity_visitor_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beagu_private.beagu_account_register_postit_alias_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER beagu_account_register_postit_alias AFTER INSERT ON public.beagu_postit_member_accounts FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_account_register_postit_alias_v1();
-- No table grants: RPCs are the only account credential access path.
CREATE FUNCTION beagu_private.beagu_account_visitor_level_v1(p_visitor uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM beagu_private.challenge_identity_codes c WHERE c.campaign='2026' AND c.visitor_id=p_visitor)
 OR EXISTS(SELECT 1 FROM beagu_private.challenge_referral_profiles r WHERE r.campaign='2026' AND r.visitor_id=p_visitor AND r.disabled)
 THEN 0 WHEN public.beagu_has_earned_challenge_visitor(p_visitor) THEN 2 ELSE 1 END
$$;
REVOKE ALL ON FUNCTION beagu_private.beagu_account_visitor_level_v1(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.beagu_account_signup_v1(p_code text,p_device_hash text,p_password_proof text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid; result uuid;
BEGIN
 IF p_code IS NULL OR length(p_code) NOT BETWEEN 8 AND 120 OR p_device_hash IS NULL OR p_device_hash !~ '^[a-f0-9]{64}$'
 OR p_password_proof IS NULL OR p_password_proof !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 IF public.beagu_consume_login_budget() IS DISTINCT FROM true THEN RETURN NULL; END IF;
 SELECT c.visitor_id INTO v FROM beagu_private.challenge_identity_codes c
 JOIN beagu_private.challenge_device_claims d USING(campaign,visitor_id)
 WHERE c.campaign='2026' AND c.identity_code=p_code AND d.device_secret_sha256=p_device_hash;
 IF v IS NULL OR beagu_private.beagu_account_visitor_level_v1(v)=0 THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(2026,1110);
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_account_identity_v1 WHERE visitor_id=v) THEN RETURN NULL; END IF;
 INSERT INTO beagu_private.beagu_provisional_accounts_v1(visitor_id,password_hash)
 VALUES(v,extensions.crypt(p_password_proof,extensions.gen_salt('bf',12)))
 ON CONFLICT DO NOTHING RETURNING account_id INTO result;
 IF result IS NOT NULL THEN PERFORM beagu_private.beagu_account_nickname_v1(v); END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.beagu_account_password_login_v1(p_account uuid,p_password_proof text,p_token_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a beagu_private.beagu_provisional_accounts_v1; n integer; lvl integer; exp timestamptz;
BEGIN
 IF p_account IS NULL OR p_password_proof IS NULL OR p_password_proof !~ '^[a-f0-9]{64}$' OR p_token_sha IS NULL OR p_token_sha !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 IF public.beagu_consume_login_budget() IS DISTINCT FROM true THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(2026,1110);
 SELECT * INTO a FROM beagu_private.beagu_provisional_accounts_v1 WHERE account_id=p_account FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO beagu_private.beagu_account_login_budget_v1(account_id,bucket,attempts) VALUES(p_account,date_trunc('hour',now()),1)
 ON CONFLICT(account_id) DO UPDATE SET attempts=CASE WHEN beagu_account_login_budget_v1.bucket=excluded.bucket THEN beagu_account_login_budget_v1.attempts+1 ELSE 1 END,bucket=excluded.bucket RETURNING attempts INTO n;
 IF n>10 OR NOT a.enabled OR extensions.crypt(p_password_proof,a.password_hash) IS DISTINCT FROM a.password_hash THEN RETURN NULL; END IF;
 lvl:=beagu_private.beagu_account_visitor_level_v1(a.visitor_id);
 IF lvl=0 THEN RETURN NULL; END IF;
 exp:=now()+interval '30 minutes';
 INSERT INTO public.beagu_level_sessions(token_sha256,access_level,expires_at,identity_campaign,identity_visitor_id)
 VALUES(p_token_sha,lvl,exp,'2026',a.visitor_id);
 INSERT INTO beagu_private.beagu_account_sessions_v1 VALUES(p_token_sha,a.visitor_id,a.account_id,exp);
 DELETE FROM beagu_private.beagu_account_login_budget_v1 WHERE account_id=p_account;
 RETURN jsonb_build_object('account_id',a.account_id,'nickname',beagu_private.beagu_account_nickname_v1(a.visitor_id),'level',lvl,'expires_at',exp);
END $$;
CREATE FUNCTION public.beagu_account_formal_link_v1(p_user uuid,p_code text,p_device_hash text,p_token_sha text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid; provisional uuid; result uuid;
BEGIN
 IF p_user IS NULL OR p_code IS NULL OR length(p_code) NOT BETWEEN 8 AND 120 OR p_device_hash IS NULL OR p_device_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 IF public.beagu_consume_login_budget() IS DISTINCT FROM true THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(2026,1110);
 SELECT c.visitor_id INTO v FROM beagu_private.challenge_identity_codes c JOIN beagu_private.challenge_device_claims d USING(campaign,visitor_id)
 WHERE c.campaign='2026' AND c.identity_code=p_code AND d.device_secret_sha256=p_device_hash;
 IF v IS NULL OR beagu_private.beagu_account_visitor_level_v1(v)<>2 THEN RETURN NULL; END IF;
 SELECT account_id INTO result FROM beagu_private.beagu_account_identity_v1 WHERE visitor_id=v AND auth_user_id=p_user AND status='ACTIVE';
 IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT account_id INTO provisional FROM beagu_private.beagu_provisional_accounts_v1 WHERE visitor_id=v AND enabled;
 IF provisional IS NOT NULL AND NOT EXISTS(SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s JOIN public.beagu_level_sessions l USING(token_sha256)
 WHERE s.token_sha256=p_token_sha AND s.account_id=provisional AND s.visitor_id=v AND s.expires_at>now() AND l.expires_at>now()) THEN RETURN NULL; END IF;
 result:=public.beagu_account_bind_v1(p_user,v,p_device_hash);
 IF result IS NOT NULL THEN PERFORM beagu_private.beagu_account_nickname_v1(v); END IF;
 IF result IS NOT NULL AND provisional IS NOT NULL THEN
  UPDATE beagu_private.beagu_provisional_accounts_v1 SET enabled=false WHERE account_id=provisional;
  DELETE FROM public.beagu_level_sessions l WHERE EXISTS(SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s WHERE s.token_sha256=l.token_sha256 AND s.account_id=provisional);
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.beagu_account_formal_login_v1(p_user uuid,p_token_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a beagu_private.beagu_account_identity_v1; exp timestamptz;
BEGIN
 IF p_user IS NULL OR p_token_sha IS NULL OR p_token_sha !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 IF public.beagu_consume_login_budget() IS DISTINCT FROM true THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(2026,1110);
 SELECT * INTO a FROM beagu_private.beagu_account_identity_v1 WHERE auth_user_id=p_user AND status='ACTIVE';
 IF NOT FOUND OR beagu_private.beagu_account_visitor_level_v1(a.visitor_id)<>2 THEN RETURN NULL; END IF;
 exp:=now()+interval '30 minutes';
 INSERT INTO public.beagu_level_sessions(token_sha256,access_level,expires_at,identity_campaign,identity_visitor_id) VALUES(p_token_sha,2,exp,'2026',a.visitor_id);
 INSERT INTO beagu_private.beagu_account_sessions_v1 VALUES(p_token_sha,a.visitor_id,NULL,exp);
 RETURN jsonb_build_object('account_id',a.account_id,'nickname',beagu_private.beagu_account_nickname_v1(a.visitor_id),'level',2,'formal',true,'expires_at',exp);
END $$;
CREATE FUNCTION public.beagu_account_session_status_v1(p_token_sha text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('level',least(l.access_level,beagu_private.beagu_account_visitor_level_v1(s.visitor_id)),
 'formal',s.account_id IS NULL,'nickname',beagu_private.beagu_account_nickname_v1(s.visitor_id),'expires_at',s.expires_at)
 FROM beagu_private.beagu_account_sessions_v1 s JOIN public.beagu_level_sessions l USING(token_sha256)
 WHERE s.token_sha256=p_token_sha AND s.expires_at>now() AND l.expires_at>now()
 AND beagu_private.beagu_account_visitor_level_v1(s.visitor_id)>0
 AND (EXISTS(SELECT 1 FROM beagu_private.beagu_provisional_accounts_v1 a WHERE a.account_id=s.account_id AND a.enabled)
 OR (s.account_id IS NULL AND EXISTS(SELECT 1 FROM beagu_private.beagu_account_identity_v1 a WHERE a.visitor_id=s.visitor_id AND a.status='ACTIVE') AND beagu_private.beagu_account_visitor_level_v1(s.visitor_id)=2))
$$;
CREATE FUNCTION public.beagu_account_logout_v1(p_token_sha text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM public.beagu_level_sessions l WHERE l.token_sha256=p_token_sha AND EXISTS(SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s WHERE s.token_sha256=l.token_sha256);
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.beagu_account_signup_v1(text,text,text),public.beagu_account_password_login_v1(uuid,text,text),public.beagu_account_formal_link_v1(uuid,text,text,text),public.beagu_account_formal_login_v1(uuid,text),public.beagu_account_session_status_v1(text),public.beagu_account_logout_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_account_signup_v1(text,text,text),public.beagu_account_password_login_v1(uuid,text,text),public.beagu_account_formal_link_v1(uuid,text,text,text),public.beagu_account_formal_login_v1(uuid,text),public.beagu_account_session_status_v1(text),public.beagu_account_logout_v1(text) TO service_role;

-- Both formal account and historical Post-it links serialize on a shared lock.
-- Existing links are never silently changed.
CREATE FUNCTION beagu_private.beagu_account_link_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid; u uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(2026,1110);
 u:=NEW.auth_user_id;
 IF TG_TABLE_NAME='beagu_postit_member_accounts' THEN
  v:=NEW.identity_visitor_id;
  IF EXISTS(SELECT 1 FROM beagu_private.beagu_account_identity_v1 a WHERE (a.visitor_id=v OR a.auth_user_id=u) AND (a.visitor_id<>v OR a.auth_user_id<>u)) THEN RAISE EXCEPTION 'account identity conflict'; END IF;
 ELSE
  v:=NEW.visitor_id;
  IF EXISTS(SELECT 1 FROM public.beagu_postit_member_accounts a WHERE (a.identity_visitor_id=v OR a.auth_user_id=u) AND (a.identity_visitor_id<>v OR a.auth_user_id<>u)) THEN RAISE EXCEPTION 'account identity conflict'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beagu_private.beagu_account_link_guard_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER beagu_account_link_guard BEFORE INSERT OR UPDATE OF auth_user_id,visitor_id ON beagu_private.beagu_account_identity_v1 FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_account_link_guard_v1();
CREATE TRIGGER beagu_account_link_guard BEFORE INSERT OR UPDATE OF auth_user_id,identity_visitor_id ON public.beagu_postit_member_accounts FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_account_link_guard_v1();

-- Invalidate account-created tokens at the database, including legacy readers that
-- read beagu_level_sessions directly. Never revoke unrelated legacy sessions.
CREATE FUNCTION beagu_private.beagu_account_revoke_sessions_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(2026,1110);
 v:=OLD.visitor_id;
 DELETE FROM public.beagu_level_sessions l WHERE EXISTS(
 SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s WHERE s.token_sha256=l.token_sha256 AND s.visitor_id=v);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beagu_private.beagu_account_revoke_sessions_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER beagu_account_referral_revoke AFTER UPDATE OF disabled,access_level,valid_referrals,upgraded_at OR DELETE ON beagu_private.challenge_referral_profiles
 FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_account_revoke_sessions_v1();
CREATE TRIGGER beagu_account_code_revoke AFTER UPDATE OF identity_code OR DELETE ON beagu_private.challenge_identity_codes
 FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_account_revoke_sessions_v1();
CREATE TRIGGER beagu_account_formal_revoke AFTER UPDATE OF status OR DELETE ON beagu_private.beagu_account_identity_v1
 FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_account_revoke_sessions_v1();
CREATE TRIGGER beagu_account_provisional_revoke AFTER UPDATE OF enabled,password_hash OR DELETE ON beagu_private.beagu_provisional_accounts_v1
 FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_account_revoke_sessions_v1();
CREATE FUNCTION public.beagu_account_level_session_allowed_v1(p_token_sha text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.beagu_level_sessions WHERE token_sha256=p_token_sha AND expires_at>now()) AND CASE WHEN EXISTS(SELECT 1 FROM beagu_private.beagu_account_sessions_v1 WHERE token_sha256=p_token_sha)
 THEN EXISTS(SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s JOIN public.beagu_level_sessions l USING(token_sha256)
 WHERE s.token_sha256=p_token_sha AND s.expires_at>now() AND l.expires_at>now()
 AND beagu_private.beagu_account_visitor_level_v1(s.visitor_id)>0
 AND (EXISTS(SELECT 1 FROM beagu_private.beagu_provisional_accounts_v1 a WHERE a.account_id=s.account_id AND a.enabled)
 OR (s.account_id IS NULL AND EXISTS(SELECT 1 FROM beagu_private.beagu_account_identity_v1 a WHERE a.visitor_id=s.visitor_id AND a.status='ACTIVE') AND beagu_private.beagu_account_visitor_level_v1(s.visitor_id)=2))) ELSE true END
$$;
REVOKE ALL ON FUNCTION public.beagu_account_level_session_allowed_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_account_level_session_allowed_v1(text) TO service_role;
