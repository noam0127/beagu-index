-- BEAGU v1.1.0: STAGING PROJECT ycwuugggqbunlbwuzvbx ONLY.
-- A valid Lv1+ session may bind exactly ONE visitor to its token.
-- The visitor is proved by an opaque 32-byte browser-local device secret hash;
-- knowing a visitor UUID alone cannot retrieve a previously claimed code.
-- No production participants/codes/sessions are copied.
CREATE OR REPLACE FUNCTION public.beagu_stage_issue_challenge_bound(
 p_session_sha256 text, p_visitor uuid, p_device_sha256 text,
 p_existing_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_level smallint;
  v_expiry timestamptz;
  v_session_visitor uuid;
  v_held_hash text;
  v_code text;
  v_no bigint;
  v_candidate text;
  v_symbols CONSTANT text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_tries integer;
  v_i integer;
BEGIN
 IF p_session_sha256 IS NULL OR p_session_sha256 !~ '^[0-9a-f]{64}$'
    OR p_device_sha256 IS NULL OR p_device_sha256 !~ '^[0-9a-f]{64}$'
    OR p_visitor IS NULL OR p_visitor::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING errcode='22023'; END IF;
 -- Serializes simultaneous requests sharing the same session.
 SELECT access_level, expires_at, identity_visitor_id
 INTO v_level, v_expiry, v_session_visitor
 FROM public.beagu_level_sessions
 WHERE token_sha256=p_session_sha256 FOR UPDATE;
 IF NOT FOUND OR v_level < 1 OR v_expiry <= now() THEN
   RAISE EXCEPTION 'INVALID_SESSION' USING errcode='28000';
 END IF;
 IF v_session_visitor IS NOT NULL AND v_session_visitor<>p_visitor THEN
   RAISE EXCEPTION 'SESSION_VISITOR_MISMATCH' USING errcode='28000';
 END IF;
 -- The global lock also serializes participant counter allocation.
 PERFORM pg_catalog.pg_advisory_xact_lock(2026,2601);
 SELECT device_secret_sha256 INTO v_held_hash
 FROM beagu_private.challenge_device_claims
 WHERE campaign='2026' AND visitor_id=p_visitor;
 IF FOUND THEN
   IF v_held_hash<>p_device_sha256 THEN
     RAISE EXCEPTION 'DEVICE_PROOF_MISMATCH' USING errcode='28000';
   END IF;
 ELSE
   SELECT identity_code INTO v_code
   FROM beagu_private.challenge_identity_codes
   WHERE campaign='2026' AND visitor_id=p_visitor;
   IF v_code IS NOT NULL AND
     (p_existing_code IS NULL OR v_code<>p_existing_code)
   THEN RAISE EXCEPTION 'LEGACY_CODE_PROOF_REQUIRED' USING errcode='28000'; END IF;
 END IF;
 SELECT participant_no INTO v_no FROM beagu_private.participants
 WHERE campaign='2026' AND visitor_id=p_visitor;
 IF v_no IS NULL THEN
   SELECT COALESCE(MAX(participant_no),0)+1 INTO v_no
   FROM beagu_private.participants WHERE campaign='2026';
   INSERT INTO beagu_private.participants(campaign,visitor_id,participant_no)
   VALUES('2026',p_visitor,v_no);
 END IF;
 SELECT identity_code INTO v_code
 FROM beagu_private.challenge_identity_codes
 WHERE campaign='2026' AND visitor_id=p_visitor;
 IF v_code IS NULL THEN
   FOR v_tries IN 1..10 LOOP
     v_bytes := extensions.gen_random_bytes(10);
     v_candidate := '';
     FOR v_i IN 0..9 LOOP
       v_candidate := v_candidate || pg_catalog.substr(
         v_symbols,(pg_catalog.get_byte(v_bytes,v_i)%32)+1,1);
     END LOOP;
     BEGIN
       INSERT INTO beagu_private.challenge_identity_codes
          (campaign,visitor_id,participant_no,identity_code)
       VALUES('2026',p_visitor,v_no,v_candidate);
       v_code:=v_candidate;
       EXIT;
     EXCEPTION WHEN unique_violation THEN NULL;
     END;
   END LOOP;
   IF v_code IS NULL THEN
     RAISE EXCEPTION 'CODE_ALLOCATION_FAILED' USING errcode='23505';
   END IF;
 END IF;
 IF v_held_hash IS NULL THEN
   INSERT INTO beagu_private.challenge_device_claims
     (campaign,visitor_id,device_secret_sha256)
   VALUES('2026',p_visitor,p_device_sha256);
 END IF;
 IF v_session_visitor IS NULL THEN
   UPDATE public.beagu_level_sessions
   SET identity_campaign='2026',identity_visitor_id=p_visitor
   WHERE token_sha256=p_session_sha256 AND identity_visitor_id IS NULL;
 END IF;
 RETURN pg_catalog.jsonb_build_object('participant_no',v_no,'identity_code',v_code);
END;
$fn$;
-- IMPORTANT: SECURITY DEFINER must never be directly exposed to anon/member.
REVOKE ALL ON FUNCTION public.beagu_stage_issue_challenge_bound(text,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_stage_issue_challenge_bound(text,uuid,text,text)
  TO service_role;
NOTIFY pgrst,'reload schema';
