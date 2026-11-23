-- QA ONLY: no operating project or respondents. Original Lv2 visitor cannot
-- be transferred to another Auth account, including after suspension.
-- The RPC combines member state and privacy-safe audit in ONE transaction.
DO $guard$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint c
  WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
  AND c.conname='beagu_2026_results_snapshot_school_id_check'
  AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%'
 ) THEN RAISE EXCEPTION 'REFUSE_NON_ISOLATED_STAGE'; END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS beagu_private.beagu_postit_member_link_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_user_id uuid NOT NULL,
 auth_session_id uuid NOT NULL,
 visitor_id uuid NOT NULL,
 author_uid uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('LINK','SUSPEND','REACTIVATE')),
 before_status text NOT NULL CHECK(before_status IN ('none','active','suspended')),
 after_status text NOT NULL CHECK(after_status IN ('active','suspended')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beagu_private.beagu_postit_member_link_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE beagu_private.beagu_postit_member_link_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE beagu_private.beagu_postit_member_link_audit_id_seq FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.beagu_stage_postit_member_transition(
 p_user uuid,p_session uuid,p_visitor uuid,p_author uuid,
 p_action text,p_device_hash text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
 old_member public.beagu_postit_member_accounts%ROWTYPE;
 device_ok boolean := false;
 normalized_action text;
 previous text;
 next_state text;
 inserted_user uuid;
BEGIN
 normalized_action:=upper(coalesce(p_action,''));
 IF p_user IS NULL OR p_session IS NULL OR p_visitor IS NULL OR
    p_author IS NULL OR normalized_action NOT IN ('LINK','SUSPEND','REACTIVATE')
 THEN RETURN '{"state":"denied","reason":"INVALID_TRANSITION"}'::jsonb; END IF;
 IF NOT public.beagu_stage_active_member_auth_session(p_user,p_session)
 THEN RETURN '{"state":"denied","reason":"AUTH_SESSION_INACTIVE"}'::jsonb; END IF;
 IF normalized_action IN ('LINK','REACTIVATE') THEN
   IF p_device_hash IS NULL OR p_device_hash !~ '^[a-f0-9]{64}$'
   THEN RETURN '{"state":"denied","reason":"ORIGINAL_DEVICE_REQUIRED"}'::jsonb; END IF;
   SELECT EXISTS(
      SELECT 1 FROM beagu_private.challenge_device_claims d
      JOIN beagu_private.challenge_referral_profiles r
       ON r.campaign=d.campaign AND r.visitor_id=d.visitor_id
      WHERE d.campaign='2026' AND d.visitor_id=p_visitor
       AND d.device_secret_sha256=p_device_hash
       AND r.access_level>=2 AND r.valid_referrals>=1
       AND r.upgraded_at IS NOT NULL AND r.disabled=false
   ) INTO device_ok;
   IF NOT device_ok
   THEN RETURN '{"state":"denied","reason":"DEVICE_OR_EARNED_LV2_UNVERIFIED"}'::jsonb; END IF;
 END IF;

 -- Preserve the unique claimed visitor/auth ID pair, even while suspended.
 -- Never reassign a visitor ID or author UID to a different Auth user.
 SELECT m.* INTO old_member
 FROM public.beagu_postit_member_accounts m
 WHERE m.auth_user_id=p_user OR m.identity_visitor_id=p_visitor
 FOR UPDATE;

 IF FOUND THEN
   IF old_member.auth_user_id<>p_user OR
      old_member.identity_visitor_id<>p_visitor OR
      old_member.author_uid<>p_author
   THEN RETURN '{"state":"denied","reason":"MEMBERSHIP_RESERVED"}'::jsonb; END IF;
   previous:=old_member.status;
 ELSE
   previous:='none';
 END IF;

 IF normalized_action='LINK' THEN
   IF previous='active'
   THEN RETURN '{"state":"active","changed":false,"operation":"LINK"}'::jsonb; END IF;
   IF previous='suspended'
   THEN RETURN '{"state":"denied","reason":"EXPLICIT_REACTIVATION_REQUIRED"}'::jsonb; END IF;
   INSERT INTO public.beagu_postit_member_accounts(
      auth_user_id,identity_visitor_id,author_uid,status)
   VALUES(p_user,p_visitor,p_author,'active')
   ON CONFLICT DO NOTHING RETURNING auth_user_id INTO inserted_user;
   IF inserted_user IS DISTINCT FROM p_user
   THEN RETURN '{"state":"denied","reason":"MEMBERSHIP_RESERVED"}'::jsonb; END IF;
   next_state:='active';

 ELSIF normalized_action='SUSPEND' THEN
   IF previous='none'
   THEN RETURN '{"state":"denied","reason":"MEMBER_NOT_LINKED"}'::jsonb; END IF;
   IF previous='suspended'
   THEN RETURN '{"state":"suspended","changed":false,"operation":"SUSPEND"}'::jsonb; END IF;
   UPDATE public.beagu_postit_member_accounts SET status='suspended'
    WHERE auth_user_id=p_user AND identity_visitor_id=p_visitor
      AND author_uid=p_author AND status='active';
   IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_STATE_CHANGED'; END IF;
   next_state:='suspended';

 ELSE -- REACTIVATE, same verified account + original device ONLY.
   IF previous='none'
   THEN RETURN '{"state":"denied","reason":"MEMBER_NOT_LINKED"}'::jsonb; END IF;
   IF previous='active'
   THEN RETURN '{"state":"active","changed":false,"operation":"REACTIVATE"}'::jsonb; END IF;
   UPDATE public.beagu_postit_member_accounts SET status='active'
    WHERE auth_user_id=p_user AND identity_visitor_id=p_visitor
      AND author_uid=p_author AND status='suspended';
   IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_STATE_CHANGED'; END IF;
   next_state:='active';
 END IF;

 -- No email, mobile phone, IP, JWT or device secret/hash stored in audit.
 -- Failed audit INSERT aborts the mutation above (same DB transaction).
 INSERT INTO beagu_private.beagu_postit_member_link_audit(
   actor_user_id,auth_session_id,visitor_id,author_uid,
   operation,before_status,after_status)
 VALUES(p_user,p_session,p_visitor,p_author,
   normalized_action,previous,next_state);
 RETURN pg_catalog.jsonb_build_object(
   'state',next_state,'changed',true,'operation',normalized_action);
END;
$fn$;

REVOKE ALL ON FUNCTION public.beagu_stage_postit_member_transition(
 uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_stage_postit_member_transition(
 uuid,uuid,uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
