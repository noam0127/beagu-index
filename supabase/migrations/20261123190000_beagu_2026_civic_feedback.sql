-- 2026 school feedback: anonymous quality flags and authenticated Lv2 correction
-- requests. No public access to source IP, individual answers or corrections.
CREATE TABLE IF NOT EXISTS beagu_private.beagu_2026_civic_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id text NOT NULL REFERENCES public.schools(school_id),
 kind text NOT NULL CHECK(kind IN ('REPORT','CORRECTION_REQUEST')),
 category text NOT NULL CHECK(category IN ('SCHOOL','AGGREGATE','SUSPECT','PRIVACY','OTHER','CORRECTION')),
 question_id text CHECK(question_id IS NULL OR question_id ~ '^Q(0[1-9]|[1-4][0-9]|5[01])$'),
 detail text NOT NULL CHECK(length(detail) BETWEEN 12 AND 500),
 actor_hash text NOT NULL CHECK(actor_hash ~ '^[a-f0-9]{64}$'),
 verified_visitor uuid,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','REVIEWING','RESOLVED','NO_CHANGE','REJECTED')),
 decision_reason text,
 decision_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT feedback_kind_matches CHECK (
 (kind='REPORT' AND verified_visitor IS NULL AND category<>'CORRECTION') OR
 (kind='CORRECTION_REQUEST' AND verified_visitor IS NOT NULL AND category='CORRECTION' AND question_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS beagu_civic_feedback_status ON beagu_private.beagu_2026_civic_feedback(status,created_at DESC);
CREATE INDEX IF NOT EXISTS beagu_civic_feedback_actor ON beagu_private.beagu_2026_civic_feedback(actor_hash,created_at DESC);
ALTER TABLE beagu_private.beagu_2026_civic_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_2026_civic_feedback FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON beagu_private.beagu_2026_civic_feedback TO service_role;
CREATE TABLE IF NOT EXISTS beagu_private.beagu_2026_civic_feedback_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 feedback_id uuid NOT NULL REFERENCES beagu_private.beagu_2026_civic_feedback(id),
 actor_id uuid NOT NULL,action text NOT NULL,reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beagu_private.beagu_2026_civic_feedback_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_2026_civic_feedback_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON beagu_private.beagu_2026_civic_feedback_audit TO service_role;

CREATE OR REPLACE FUNCTION public.beagu_2026_civic_submit(
 p_school_id text,p_kind text,p_category text,p_question_id text,
 p_detail text,p_actor_hash text,p_visitor uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE answer uuid;
BEGIN
 IF p_school_id !~ '^[A-Z0-9]{7}$'
 OR p_kind NOT IN('REPORT','CORRECTION_REQUEST')
 OR p_category NOT IN('SCHOOL','AGGREGATE','SUSPECT','PRIVACY','OTHER','CORRECTION')
 OR p_actor_hash !~ '^[a-f0-9]{64}$'
 OR length(trim(coalesce(p_detail,''))) NOT BETWEEN 12 AND 500
 OR coalesce(p_detail,'') ~ '[<>]'
 OR (p_question_id IS NOT NULL AND p_question_id !~ '^Q(0[1-9]|[1-4][0-9]|5[01])$')
 OR (p_kind='REPORT' AND (p_visitor IS NOT NULL OR p_category='CORRECTION'))
 OR (p_kind='CORRECTION_REQUEST' AND (p_visitor IS NULL OR p_category<>'CORRECTION' OR p_question_id IS NULL))
 THEN RAISE EXCEPTION 'invalid feedback'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_2026_results_snapshot WHERE school_id=p_school_id)
 THEN RAISE EXCEPTION 'school data unavailable'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_actor_hash));
 IF (SELECT count(*) FROM beagu_private.beagu_2026_civic_feedback
     WHERE actor_hash=p_actor_hash AND created_at>now()-interval '24 hours')>=5
 OR (SELECT count(*) FROM beagu_private.beagu_2026_civic_feedback
     WHERE school_id=p_school_id AND created_at>now()-interval '24 hours')>=80
 THEN RAISE EXCEPTION 'rate limited'; END IF;
 INSERT INTO beagu_private.beagu_2026_civic_feedback(
  school_id,kind,category,question_id,detail,actor_hash,verified_visitor)
 VALUES(p_school_id,p_kind,p_category,p_question_id,trim(p_detail),p_actor_hash,p_visitor)
 RETURNING id INTO answer;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.beagu_2026_civic_submit(text,text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_civic_submit(text,text,text,text,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.beagu_2026_civic_admin_list(
 p_actor uuid,p_session uuid,p_status text DEFAULT 'PENDING'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p_status NOT IN('PENDING','REVIEWING','RESOLVED','NO_CHANGE','REJECTED','ALL')
 THEN RAISE EXCEPTION 'invalid filter'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts WHERE user_id=p_actor AND role='owner' AND enabled)
 OR NOT public.beagu_admin_active_mfa_session(p_actor,p_session)
 THEN RAISE EXCEPTION 'owner MFA required'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC),'[]'::jsonb)
 INTO result FROM(
  SELECT r.id,r.school_id,s.school_name,r.kind,r.category,r.question_id,
  r.detail,r.status,r.created_at,r.decision_reason FROM beagu_private.beagu_2026_civic_feedback r
  JOIN public.schools s USING(school_id)
  WHERE p_status='ALL' OR r.status=p_status
  ORDER BY r.created_at DESC LIMIT 50) t;
 RETURN jsonb_build_object('ok',true,'items',result);
END $$;
REVOKE ALL ON FUNCTION public.beagu_2026_civic_admin_list(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_civic_admin_list(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.beagu_2026_civic_admin_decide(
 p_actor uuid,p_session uuid,p_id uuid,p_action text,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous beagu_private.beagu_2026_civic_feedback;
BEGIN
 IF p_action NOT IN('REVIEWING','RESOLVED','NO_CHANGE','REJECTED')
 OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500
 THEN RAISE EXCEPTION 'invalid decision'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts WHERE user_id=p_actor AND role='owner' AND enabled)
 OR NOT public.beagu_admin_active_mfa_session(p_actor,p_session)
 THEN RAISE EXCEPTION 'owner MFA required'; END IF;
 SELECT * INTO STRICT previous FROM beagu_private.beagu_2026_civic_feedback WHERE id=p_id FOR UPDATE;
 IF previous.status IN('RESOLVED','NO_CHANGE','REJECTED') THEN RAISE EXCEPTION 'already closed'; END IF;
 UPDATE beagu_private.beagu_2026_civic_feedback SET
 status=p_action,decision_reason=trim(p_reason),decision_by=p_actor,updated_at=now()
 WHERE id=p_id;
 INSERT INTO beagu_private.beagu_2026_civic_feedback_audit(feedback_id,actor_id,action,reason)
 VALUES(p_id,p_actor,p_action,trim(p_reason));
 RETURN jsonb_build_object('ok',true,'status',p_action);
END $$;
REVOKE ALL ON FUNCTION public.beagu_2026_civic_admin_decide(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_civic_admin_decide(uuid,uuid,uuid,text,text) TO service_role;