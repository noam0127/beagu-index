-- Candidate only. No new Auth users, social identities, names, email or phone.
CREATE TABLE beagu_private.beagu_anonymous_accounts_v1(
 account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 visitor_id uuid UNIQUE NOT NULL,
 author_uid uuid UNIQUE NOT NULL,
 password_hash text NOT NULL,
 recovery_hash text UNIQUE NOT NULL CHECK(recovery_hash ~ '^[a-f0-9]{64}$'),
 enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE beagu_private.beagu_account_login_budget_v1(
 account_id uuid PRIMARY KEY REFERENCES beagu_private.beagu_anonymous_accounts_v1(account_id) ON DELETE CASCADE,
 bucket timestamptz NOT NULL, attempts integer NOT NULL
);
CREATE TABLE beagu_private.beagu_account_sessions_v1(
 token_sha256 text PRIMARY KEY REFERENCES public.beagu_level_sessions(token_sha256) ON DELETE CASCADE,
 visitor_id uuid NOT NULL, account_id uuid NOT NULL REFERENCES beagu_private.beagu_anonymous_accounts_v1(account_id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX beagu_account_session_visitor_idx ON beagu_private.beagu_account_sessions_v1(visitor_id);
ALTER TABLE beagu_private.beagu_anonymous_accounts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_account_login_budget_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_account_sessions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_anonymous_accounts_v1,beagu_private.beagu_account_login_budget_v1,beagu_private.beagu_account_sessions_v1 FROM PUBLIC,anon,authenticated,service_role;
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

CREATE FUNCTION beagu_private.beagu_account_visitor_level_v1(p_visitor uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM beagu_private.challenge_identity_codes c WHERE c.campaign='2026' AND c.visitor_id=p_visitor)
 OR EXISTS(SELECT 1 FROM beagu_private.challenge_referral_profiles r WHERE r.campaign='2026' AND r.visitor_id=p_visitor AND r.disabled)
 THEN 0 WHEN public.beagu_has_earned_challenge_visitor(p_visitor) THEN 2 ELSE 1 END
$$;
REVOKE ALL ON FUNCTION beagu_private.beagu_account_visitor_level_v1(uuid) FROM PUBLIC,anon,authenticated;

-- Dual-mission cutover. This snapshot is immutable after installation; only an
-- explicitly approved absolute expiry supplied by the release operator enables
-- the grandfathered read-only exception. No production invocation in CI.
CREATE TABLE beagu_private.beagu_lv2_transition_v1(
 id integer PRIMARY KEY CHECK(id=1), cutoff timestamptz NOT NULL, expires_at timestamptz,
 CHECK(expires_at IS NULL OR expires_at>cutoff)
);
CREATE TABLE beagu_private.beagu_lv2_transition_visitors_v1(visitor_id uuid PRIMARY KEY);
CREATE TABLE beagu_private.beagu_lv2_transition_tokens_v1(token_sha256 text PRIMARY KEY);
ALTER TABLE beagu_private.beagu_lv2_transition_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_lv2_transition_visitors_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_lv2_transition_tokens_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_lv2_transition_v1,beagu_private.beagu_lv2_transition_visitors_v1,beagu_private.beagu_lv2_transition_tokens_v1 FROM PUBLIC,anon,authenticated,service_role;
-- Installation must run in a single transaction with referral/session writes frozen.
-- Capture ONLY already-earned identities and already-issued static Lv2 sessions.
LOCK TABLE beagu_private.challenge_referral_profiles IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.beagu_level_sessions IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO beagu_private.beagu_lv2_transition_v1 VALUES(1,statement_timestamp(),nullif(current_setting('beagu.lv2_transition_expires_at',true),'')::timestamptz);
INSERT INTO beagu_private.beagu_lv2_transition_visitors_v1
 SELECT visitor_id FROM beagu_private.challenge_referral_profiles
 WHERE campaign='2026' AND public.beagu_has_earned_challenge_visitor(visitor_id);
INSERT INTO beagu_private.beagu_lv2_transition_tokens_v1
 SELECT token_sha256 FROM public.beagu_level_sessions
 WHERE access_level=2 AND identity_visitor_id IS NULL AND expires_at>now();
CREATE FUNCTION public.beagu_legacy_lv2_read_allowed_v1(p_visitor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM beagu_private.beagu_lv2_transition_visitors_v1 v
 CROSS JOIN beagu_private.beagu_lv2_transition_v1 c WHERE v.visitor_id=p_visitor AND c.expires_at>now())
 AND public.beagu_has_earned_challenge_visitor(p_visitor)
$$;
REVOKE ALL ON FUNCTION public.beagu_legacy_lv2_read_allowed_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_legacy_lv2_read_allowed_v1(uuid) TO service_role;
-- All writers (even older Edge versions) must pass the database session gate.
CREATE FUNCTION beagu_private.beagu_lv2_session_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE deadline timestamptz;
BEGIN
 IF NEW.access_level<2 THEN RETURN NEW; END IF;
 IF NEW.access_level=2 AND NEW.identity_campaign='2026' AND EXISTS(
 SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s
 JOIN beagu_private.beagu_anonymous_accounts_v1 a ON a.account_id=s.account_id AND a.visitor_id=s.visitor_id
 WHERE s.token_sha256=NEW.token_sha256 AND s.visitor_id=NEW.identity_visitor_id
 AND s.expires_at>now() AND a.enabled AND beagu_private.beagu_account_visitor_level_v1(s.visitor_id)=2)
 THEN RETURN NEW; END IF;
 SELECT expires_at INTO deadline FROM beagu_private.beagu_lv2_transition_v1 WHERE id=1 AND expires_at>now();
 IF NEW.access_level=2 AND deadline IS NOT NULL AND
 ( (NEW.identity_campaign='2026' AND public.beagu_legacy_lv2_read_allowed_v1(NEW.identity_visitor_id))
 OR (NEW.identity_visitor_id IS NULL AND EXISTS(SELECT 1 FROM beagu_private.beagu_lv2_transition_tokens_v1 t WHERE t.token_sha256=NEW.token_sha256)) )
 THEN NEW.expires_at:=least(NEW.expires_at,deadline); RETURN NEW; END IF;
 NEW.access_level:=1;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beagu_private.beagu_lv2_session_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER beagu_lv2_session_guard_v1 BEFORE INSERT OR UPDATE OF access_level,identity_visitor_id,identity_campaign,expires_at ON public.beagu_level_sessions FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_lv2_session_guard_v1();
-- Existing sessions receive the same gate; grandfathered expiry is capped.
UPDATE public.beagu_level_sessions SET access_level=access_level WHERE access_level>=2;

-- Copy only the pseudonymous ownership and moderation state, never Auth identity.
-- Must execute under a reviewed cutover transaction after legacy signups are frozen.
CREATE TABLE beagu_private.beagu_legacy_author_bridge_v1(
 visitor_id uuid PRIMARY KEY,
 author_uid uuid UNIQUE NOT NULL,
 status text NOT NULL CHECK(status IN ('active','suspended')),
 suspended_until timestamptz
);
ALTER TABLE beagu_private.beagu_legacy_author_bridge_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_legacy_author_bridge_v1 FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO beagu_private.beagu_legacy_author_bridge_v1(visitor_id,author_uid,status,suspended_until)
 SELECT m.identity_visitor_id,m.author_uid,m.status,u.banned_until
 FROM public.beagu_postit_member_accounts m JOIN auth.users u ON u.id=m.auth_user_id;
-- Preserve legacy authors only after original-device proof. No new social bindings.
REVOKE EXECUTE ON FUNCTION public.beagu_postit_bind_verified_member(uuid,uuid,text,uuid) FROM service_role;
CREATE FUNCTION public.beagu_account_signup_v1(p_code text,p_device_hash text,p_password_proof text,p_recovery_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid; result uuid; actor uuid; legacy_status text; lvl integer;
BEGIN
 IF p_code IS NULL OR length(p_code) NOT BETWEEN 8 AND 120 OR p_device_hash IS NULL OR p_device_hash !~ '^[a-f0-9]{64}$'
 OR p_password_proof IS NULL OR p_password_proof !~ '^[a-f0-9]{64}$'
 OR p_recovery_hash IS NULL OR p_recovery_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 IF public.beagu_consume_login_budget() IS DISTINCT FROM true THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(2026,1110);
 SELECT c.visitor_id INTO v FROM beagu_private.challenge_identity_codes c
 JOIN beagu_private.challenge_device_claims d USING(campaign,visitor_id)
 WHERE c.campaign='2026' AND c.identity_code=p_code AND d.device_secret_sha256=p_device_hash;
 IF v IS NULL THEN RETURN NULL; END IF;
 lvl:=beagu_private.beagu_account_visitor_level_v1(v);
 IF lvl=0 THEN RETURN NULL; END IF;
 SELECT m.author_uid,CASE WHEN m.status='suspended' OR m.suspended_until>now() THEN 'suspended' ELSE 'active' END INTO actor,legacy_status
 FROM beagu_private.beagu_legacy_author_bridge_v1 m WHERE m.visitor_id=v;
 IF legacy_status IS NOT NULL AND legacy_status<>'active' THEN RETURN NULL; END IF;
 INSERT INTO beagu_private.beagu_anonymous_accounts_v1(visitor_id,author_uid,password_hash,recovery_hash)
 VALUES(v,coalesce(actor,gen_random_uuid()),extensions.crypt(p_password_proof,extensions.gen_salt('bf',12)),p_recovery_hash)
 ON CONFLICT DO NOTHING RETURNING account_id INTO result;
 IF result IS NULL THEN RETURN NULL; END IF;
 PERFORM beagu_private.beagu_account_nickname_v1(v);
 RETURN jsonb_build_object('account_id',p_code,'level',lvl,'lv2_active',lvl=2);
END $$;
CREATE FUNCTION beagu_private.beagu_account_attempt_v1(p_account uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 INSERT INTO beagu_private.beagu_account_login_budget_v1(account_id,bucket,attempts) VALUES(p_account,date_trunc('hour',now()),1)
 ON CONFLICT(account_id) DO UPDATE SET attempts=CASE WHEN beagu_account_login_budget_v1.bucket=excluded.bucket THEN beagu_account_login_budget_v1.attempts+1 ELSE 1 END,bucket=excluded.bucket RETURNING attempts INTO n;
 RETURN n<=10;
END $$;
REVOKE ALL ON FUNCTION beagu_private.beagu_account_attempt_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.beagu_account_password_login_v1(p_account text,p_password_proof text,p_token_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a beagu_private.beagu_anonymous_accounts_v1; lvl integer; exp timestamptz;
BEGIN
 IF p_account IS NULL OR length(p_account) NOT BETWEEN 8 AND 120 OR p_password_proof IS NULL OR p_password_proof !~ '^[a-f0-9]{64}$' OR p_token_sha IS NULL OR p_token_sha !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 IF public.beagu_consume_login_budget() IS DISTINCT FROM true THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(2026,1110);
 SELECT m.* INTO a FROM beagu_private.beagu_anonymous_accounts_v1 m
 JOIN beagu_private.challenge_identity_codes c ON c.campaign='2026' AND c.visitor_id=m.visitor_id
 WHERE c.identity_code=p_account FOR UPDATE OF m;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT beagu_private.beagu_account_attempt_v1(a.account_id) OR NOT a.enabled OR extensions.crypt(p_password_proof,a.password_hash) IS DISTINCT FROM a.password_hash THEN RETURN NULL; END IF;
 lvl:=beagu_private.beagu_account_visitor_level_v1(a.visitor_id);
 IF lvl=0 THEN RETURN NULL; END IF;
 exp:=now()+interval '30 minutes';
 INSERT INTO public.beagu_level_sessions(token_sha256,access_level,expires_at,identity_campaign,identity_visitor_id)
 VALUES(p_token_sha,1,exp,'2026',a.visitor_id);
 INSERT INTO beagu_private.beagu_account_sessions_v1 VALUES(p_token_sha,a.visitor_id,a.account_id,exp);
 IF lvl=2 THEN UPDATE public.beagu_level_sessions SET access_level=2 WHERE token_sha256=p_token_sha; END IF;
 DELETE FROM beagu_private.beagu_account_login_budget_v1 WHERE account_id=a.account_id;
 RETURN jsonb_build_object('account_id',p_account,'nickname',beagu_private.beagu_account_nickname_v1(a.visitor_id),'level',lvl,'lv2_active',lvl=2,'expires_at',exp);
END $$;
-- Atomic one-use recovery: replacement proof and password are installed together.
-- No administrator recovery, no identity lookup, and no account creation on failure.
CREATE FUNCTION public.beagu_account_recover_v1(p_account text,p_old_recovery_hash text,p_new_recovery_hash text,p_password_proof text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a beagu_private.beagu_anonymous_accounts_v1; lvl integer;
BEGIN
 IF p_account IS NULL OR length(p_account) NOT BETWEEN 8 AND 120 OR p_old_recovery_hash IS NULL OR p_old_recovery_hash !~ '^[a-f0-9]{64}$'
 OR p_new_recovery_hash IS NULL OR p_new_recovery_hash !~ '^[a-f0-9]{64}$' OR p_old_recovery_hash=p_new_recovery_hash
 OR p_password_proof IS NULL OR p_password_proof !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 IF public.beagu_consume_login_budget() IS DISTINCT FROM true THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(2026,1110);
 SELECT m.* INTO a FROM beagu_private.beagu_anonymous_accounts_v1 m
 JOIN beagu_private.challenge_identity_codes c ON c.campaign='2026' AND c.visitor_id=m.visitor_id
 WHERE c.identity_code=p_account FOR UPDATE OF m;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT beagu_private.beagu_account_attempt_v1(a.account_id) OR NOT a.enabled OR a.recovery_hash IS DISTINCT FROM p_old_recovery_hash THEN RETURN NULL; END IF;
 lvl:=beagu_private.beagu_account_visitor_level_v1(a.visitor_id);
 IF lvl=0 THEN RETURN NULL; END IF;
 UPDATE beagu_private.beagu_anonymous_accounts_v1 SET password_hash=extensions.crypt(p_password_proof,extensions.gen_salt('bf',12)),recovery_hash=p_new_recovery_hash WHERE account_id=a.account_id;
 DELETE FROM beagu_private.beagu_account_login_budget_v1 WHERE account_id=a.account_id;
 RETURN jsonb_build_object('account_id',p_account,'level',lvl,'lv2_active',lvl=2);
END $$;
CREATE FUNCTION public.beagu_account_session_status_v1(p_token_sha text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('account_id',c.identity_code,'level',least(l.access_level,beagu_private.beagu_account_visitor_level_v1(s.visitor_id)),
 'lv2_active',beagu_private.beagu_account_visitor_level_v1(s.visitor_id)=2,'nickname',beagu_private.beagu_account_nickname_v1(s.visitor_id),'expires_at',s.expires_at)
 FROM beagu_private.beagu_account_sessions_v1 s JOIN public.beagu_level_sessions l USING(token_sha256)
 JOIN beagu_private.beagu_anonymous_accounts_v1 a ON a.account_id=s.account_id AND a.visitor_id=s.visitor_id
 JOIN beagu_private.challenge_identity_codes c ON c.campaign='2026' AND c.visitor_id=s.visitor_id
 WHERE s.token_sha256=p_token_sha AND s.expires_at>now() AND l.expires_at>now() AND a.enabled AND beagu_private.beagu_account_visitor_level_v1(s.visitor_id)>0
$$;
CREATE FUNCTION public.beagu_account_logout_v1(p_token_sha text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM public.beagu_level_sessions l WHERE l.token_sha256=p_token_sha AND EXISTS(SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s WHERE s.token_sha256=l.token_sha256);
 RETURN FOUND;
END $$;
-- Revoke all account-created tokens when password/recovery or earned rights change.
CREATE FUNCTION beagu_private.beagu_account_revoke_sessions_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(2026,1110);
 DELETE FROM public.beagu_level_sessions l WHERE EXISTS(
 SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s WHERE s.token_sha256=l.token_sha256 AND s.visitor_id=OLD.visitor_id);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beagu_private.beagu_account_revoke_sessions_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION beagu_private.beagu_account_referral_refresh_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(2026,1110);
 -- Genuine first promotion upgrades the same authenticated session, not a code-only session.
 IF TG_OP='UPDATE' AND NOT OLD.disabled AND NOT NEW.disabled AND
    OLD.access_level=1 AND NEW.access_level=2 AND OLD.valid_referrals<1 AND NEW.valid_referrals>=1
    AND beagu_private.beagu_account_visitor_level_v1(NEW.visitor_id)=2 THEN
   UPDATE public.beagu_level_sessions l SET access_level=2
   WHERE l.expires_at>now() AND EXISTS(SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s
     JOIN beagu_private.beagu_anonymous_accounts_v1 a ON a.account_id=s.account_id AND a.visitor_id=s.visitor_id
     WHERE s.token_sha256=l.token_sha256 AND s.visitor_id=NEW.visitor_id AND s.expires_at>now() AND a.enabled);
 ELSE
   DELETE FROM public.beagu_level_sessions l WHERE EXISTS(SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s
     WHERE s.token_sha256=l.token_sha256 AND s.visitor_id=OLD.visitor_id);
 END IF;
 -- Any revoked referral loses legacy read access immediately, including old API readers.
 IF TG_OP='DELETE' OR NOT public.beagu_has_earned_challenge_visitor(OLD.visitor_id) THEN
   UPDATE public.beagu_level_sessions l SET access_level=1
   WHERE l.identity_campaign='2026' AND l.identity_visitor_id=OLD.visitor_id AND l.access_level>=2;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beagu_private.beagu_account_referral_refresh_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER beagu_account_referral_revoke AFTER UPDATE OF disabled,access_level,valid_referrals,upgraded_at OR DELETE ON beagu_private.challenge_referral_profiles FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_account_referral_refresh_v1();
CREATE TRIGGER beagu_account_code_revoke AFTER UPDATE OF identity_code OR DELETE ON beagu_private.challenge_identity_codes FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_account_revoke_sessions_v1();
CREATE TRIGGER beagu_account_credential_revoke BEFORE UPDATE OF enabled,password_hash,recovery_hash OR DELETE ON beagu_private.beagu_anonymous_accounts_v1 FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_account_revoke_sessions_v1();
CREATE FUNCTION public.beagu_account_level_session_allowed_v1(p_token_sha text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.beagu_level_sessions WHERE token_sha256=p_token_sha AND expires_at>now()) AND CASE WHEN EXISTS(SELECT 1 FROM beagu_private.beagu_account_sessions_v1 WHERE token_sha256=p_token_sha)
 THEN EXISTS(SELECT 1 FROM beagu_private.beagu_account_sessions_v1 s JOIN public.beagu_level_sessions l USING(token_sha256)
 JOIN beagu_private.beagu_anonymous_accounts_v1 a ON a.account_id=s.account_id AND a.visitor_id=s.visitor_id
 WHERE s.token_sha256=p_token_sha AND s.expires_at>now() AND l.expires_at>now() AND a.enabled AND beagu_private.beagu_account_visitor_level_v1(s.visitor_id)>=l.access_level) ELSE EXISTS(SELECT 1 FROM public.beagu_level_sessions l WHERE l.token_sha256=p_token_sha AND (l.access_level=1 OR (l.access_level=2 AND EXISTS(SELECT 1 FROM beagu_private.beagu_lv2_transition_v1 c WHERE c.expires_at>now()) AND ((l.identity_campaign='2026' AND public.beagu_legacy_lv2_read_allowed_v1(l.identity_visitor_id)) OR (l.identity_visitor_id IS NULL AND EXISTS(SELECT 1 FROM beagu_private.beagu_lv2_transition_tokens_v1 t WHERE t.token_sha256=l.token_sha256)))))) END
$$;
-- Report-based writing restrictions are separate from survey eligibility and credentials.
CREATE TABLE beagu_private.beagu_postit_restrictions_v1(
 case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 target_type text NOT NULL CHECK(target_type IN ('post','comment')),
 target_id uuid NOT NULL,
 author_uid uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('dismiss','restrict_24h','restrict_7d')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz,
 restored_at timestamptz,
 actor_admin uuid NOT NULL,
 restore_admin uuid,
 restore_reason text,
 reason text NOT NULL CHECK(length(reason) BETWEEN 8 AND 200),
 UNIQUE(target_type,target_id)
);
CREATE INDEX beagu_postit_restrictions_author_idx ON beagu_private.beagu_postit_restrictions_v1(author_uid,expires_at) WHERE restored_at IS NULL AND expires_at IS NOT NULL;
ALTER TABLE beagu_private.beagu_postit_restrictions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_postit_restrictions_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION beagu_private.beagu_postit_restricted_v1(p_author uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM beagu_private.beagu_postit_restrictions_v1 WHERE author_uid=p_author AND restored_at IS NULL AND expires_at>now())
$$;
REVOKE ALL ON FUNCTION beagu_private.beagu_postit_restricted_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- A legacy participation token may read; it must never authorize account writing.
CREATE FUNCTION public.beagu_account_postit_writer_v1(p_token_sha text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.author_uid FROM beagu_private.beagu_account_sessions_v1 s JOIN public.beagu_level_sessions l USING(token_sha256)
 JOIN beagu_private.beagu_anonymous_accounts_v1 a ON a.account_id=s.account_id AND a.visitor_id=s.visitor_id
 WHERE s.token_sha256=p_token_sha AND s.expires_at>now() AND l.expires_at>now() AND l.access_level=2 AND a.enabled
 AND beagu_private.beagu_account_visitor_level_v1(s.visitor_id)=2
 AND NOT beagu_private.beagu_postit_restricted_v1(a.author_uid)
 AND NOT EXISTS(SELECT 1 FROM beagu_private.beagu_legacy_author_bridge_v1 m WHERE m.visitor_id=s.visitor_id AND (m.status<>'active' OR m.suspended_until>now()))
$$;
CREATE FUNCTION public.beagu_account_postit_current_aliases_v1(p_items jsonb)
RETURNS TABLE(item_id uuid,nickname text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN RETURN; END IF;
 IF jsonb_array_length(p_items)>100 THEN RETURN; END IF;
 RETURN QUERY SELECT x.item_id,n.nickname
 FROM jsonb_to_recordset(p_items) AS x(item_id uuid,author_uid uuid,created_at timestamptz)
 JOIN beagu_private.beagu_anonymous_accounts_v1 a ON a.author_uid=x.author_uid AND a.enabled
 JOIN beagu_private.beagu_account_nicknames_v1 n ON n.visitor_id=a.visitor_id AND n.week_start=beagu_private.beagu_account_week_v1(statement_timestamp())
 WHERE x.created_at<=statement_timestamp() AND beagu_private.beagu_account_week_v1(x.created_at)=n.week_start;
END $$;
REVOKE ALL ON FUNCTION public.beagu_account_signup_v1(text,text,text,text),public.beagu_account_password_login_v1(text,text,text),public.beagu_account_recover_v1(text,text,text,text),public.beagu_account_session_status_v1(text),public.beagu_account_logout_v1(text),public.beagu_account_level_session_allowed_v1(text),public.beagu_account_postit_writer_v1(text),public.beagu_account_postit_current_aliases_v1(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_account_signup_v1(text,text,text,text),public.beagu_account_password_login_v1(text,text,text),public.beagu_account_recover_v1(text,text,text,text),public.beagu_account_session_status_v1(text),public.beagu_account_logout_v1(text),public.beagu_account_level_session_allowed_v1(text),public.beagu_account_postit_writer_v1(text),public.beagu_account_postit_current_aliases_v1(jsonb) TO service_role;

-- Aggregate-only member administration. The Edge handler separately verifies admin MFA.
CREATE FUNCTION public.beagu_account_admin_counts_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('members',count(*),'lv2',count(*) FILTER(WHERE a.enabled AND beagu_private.beagu_account_visitor_level_v1(a.visitor_id)=2),
 'suspended',count(*) FILTER(WHERE NOT a.enabled OR beagu_private.beagu_postit_restricted_v1(a.author_uid) OR EXISTS(SELECT 1 FROM beagu_private.beagu_legacy_author_bridge_v1 b WHERE b.visitor_id=a.visitor_id AND (b.status='suspended' OR b.suspended_until>now()))))
 FROM beagu_private.beagu_anonymous_accounts_v1 a
$$;
REVOKE ALL ON FUNCTION public.beagu_account_admin_counts_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_account_admin_counts_v1() TO service_role;

-- This candidate follows the existing Post-it schema, including its removal of Auth foreign keys.
-- A separate test fixture installs the actual historical Post-it migrations before this file.
CREATE FUNCTION public.beagu_postit_report_queue_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH reported AS (
 SELECT r.target_type,r.target_id,count(DISTINCT r.author_uid) AS reports
 FROM public.beagu_postit_reactions r WHERE r.kind='report' GROUP BY r.target_type,r.target_id
 ), targets AS (
 SELECT 'post'::text AS target_type,p.id AS target_id,p.body,p.status,p.author_uid FROM public.beagu_postit_posts p
 UNION ALL SELECT 'comment',c.id,c.body,c.status,c.author_uid FROM public.beagu_postit_comments c
 ), rows AS (
 SELECT t.target_type,t.target_id,t.body,t.status,r.reports,d.case_id,d.decision,d.expires_at,d.restored_at
 FROM reported r JOIN targets t USING(target_type,target_id)
 JOIN beagu_private.beagu_anonymous_accounts_v1 a ON a.author_uid=t.author_uid
 LEFT JOIN beagu_private.beagu_postit_restrictions_v1 d USING(target_type,target_id)
 WHERE t.status IN ('published','hidden','removed') AND (d.case_id IS NULL OR (d.expires_at>now() AND d.restored_at IS NULL))
 ORDER BY (d.case_id IS NULL) DESC,r.reports DESC,t.target_id LIMIT 50
 )
 SELECT coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb) FROM rows
$$;
CREATE FUNCTION public.beagu_postit_report_decide_v1(p_type text,p_target uuid,p_decision text,p_reason text,p_admin uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_author uuid; v_case uuid; v_exp timestamptz;
BEGIN
 IF p_type IS NULL OR p_type NOT IN ('post','comment') OR p_target IS NULL OR p_decision IS NULL OR p_decision NOT IN ('dismiss','restrict_24h','restrict_7d','restore') OR p_admin IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 200 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts WHERE user_id=p_admin AND role='owner' AND enabled=true) THEN RETURN NULL; END IF;
 -- Only an actual reported content item can be selected, never a supplied member ID.
 IF p_type='post' THEN SELECT author_uid INTO v_author FROM public.beagu_postit_posts WHERE id=p_target;
 ELSE SELECT author_uid INTO v_author FROM public.beagu_postit_comments WHERE id=p_target; END IF;
 IF v_author IS NULL OR NOT EXISTS(SELECT 1 FROM beagu_private.beagu_anonymous_accounts_v1 WHERE author_uid=v_author) THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_author::text),20261121);
 IF NOT EXISTS(SELECT 1 FROM public.beagu_postit_reactions WHERE target_type=p_type AND target_id=p_target AND kind='report' AND author_uid<>v_author) THEN RETURN NULL; END IF;
 IF p_decision='restore' THEN
 UPDATE beagu_private.beagu_postit_restrictions_v1 SET restored_at=clock_timestamp(),restore_admin=p_admin,restore_reason=btrim(p_reason) WHERE target_type=p_type AND target_id=p_target AND author_uid=v_author AND expires_at>now() AND restored_at IS NULL RETURNING case_id INTO v_case;
 ELSE
 v_exp:=CASE p_decision WHEN 'restrict_24h' THEN clock_timestamp()+interval '24 hours' WHEN 'restrict_7d' THEN clock_timestamp()+interval '7 days' ELSE NULL END;
 INSERT INTO beagu_private.beagu_postit_restrictions_v1(target_type,target_id,author_uid,decision,expires_at,actor_admin,reason)
 VALUES(p_type,p_target,v_author,p_decision,v_exp,p_admin,btrim(p_reason)) ON CONFLICT(target_type,target_id) DO NOTHING RETURNING case_id INTO v_case;
 END IF;
 IF v_case IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('ok',true,'case_id',v_case);
END $$;
REVOKE ALL ON FUNCTION public.beagu_postit_report_queue_v1(),public.beagu_postit_report_decide_v1(text,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_postit_report_queue_v1(),public.beagu_postit_report_decide_v1(text,uuid,text,text,uuid) TO service_role;
-- Recheck the restriction in the write transaction (also covers requests already in flight).
CREATE FUNCTION beagu_private.beagu_postit_restriction_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_author uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_author:=OLD.author_uid; ELSE v_author:=NEW.author_uid; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_author::text),20261121);
 -- This VOLATILE trigger executes a fresh query after taking the author lock,
 -- rather than relying on the stable snapshot of a request that started earlier.
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_postit_restrictions_v1 WHERE author_uid=v_author AND restored_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'POSTIT_RESTRICTED' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beagu_private.beagu_postit_restriction_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER beagu_postit_restrict_post BEFORE INSERT ON public.beagu_postit_posts FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_postit_restriction_guard_v1();
CREATE TRIGGER beagu_postit_restrict_comment BEFORE INSERT ON public.beagu_postit_comments FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_postit_restriction_guard_v1();
CREATE TRIGGER beagu_postit_restrict_reaction BEFORE INSERT OR DELETE ON public.beagu_postit_reactions FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_postit_restriction_guard_v1();
