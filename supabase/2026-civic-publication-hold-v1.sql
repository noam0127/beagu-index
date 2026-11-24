-- v1.10.0 candidate: explicit owner-reviewed publication hold, bound to a reported snapshot.
-- No automatic withdrawal from reports, no approval restoration or raw survey edits.
CREATE TABLE IF NOT EXISTS beagu_private.beagu_2026_civic_publication_hold (
 school_id text PRIMARY KEY REFERENCES public.schools(school_id),
 feedback_id uuid NOT NULL REFERENCES beagu_private.beagu_2026_civic_feedback(id),
 snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 active boolean NOT NULL DEFAULT true,
 decision_by uuid NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 12 AND 500),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beagu_private.beagu_2026_civic_publication_hold ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_2026_civic_publication_hold FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON beagu_private.beagu_2026_civic_publication_hold TO service_role;
CREATE OR REPLACE FUNCTION public.beagu_2026_civic_hold_school(
 p_actor uuid,p_session uuid,p_feedback uuid,p_expected_sha text,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f beagu_private.beagu_2026_civic_feedback; s public.beagu_2026_results_snapshot;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_feedback IS NULL OR p_expected_sha IS NULL
 OR p_expected_sha !~ '^[a-f0-9]{64}$' OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500
 THEN RAISE EXCEPTION 'invalid hold request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts WHERE user_id=p_actor AND role='owner' AND enabled)
 OR public.beagu_admin_active_mfa_session(p_actor,p_session) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'owner MFA required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(2026,2026);
 SELECT * INTO STRICT f FROM beagu_private.beagu_2026_civic_feedback WHERE id=p_feedback FOR UPDATE;
 IF f.kind<>'REPORT' OR f.status<>'REVIEWING' THEN RAISE EXCEPTION 'reviewed report required'; END IF;
 SELECT * INTO STRICT s FROM public.beagu_2026_results_snapshot WHERE school_id=f.school_id FOR UPDATE;
 IF s.payload_sha256 IS DISTINCT FROM p_expected_sha THEN RAISE EXCEPTION 'snapshot changed'; END IF;
 INSERT INTO beagu_private.beagu_2026_civic_publication_hold(school_id,feedback_id,snapshot_sha256,decision_by,reason)
 VALUES(f.school_id,p_feedback,p_expected_sha,p_actor,trim(p_reason))
 ON CONFLICT(school_id) DO UPDATE SET feedback_id=excluded.feedback_id,snapshot_sha256=excluded.snapshot_sha256,
 active=true,decision_by=excluded.decision_by,reason=excluded.reason,updated_at=now()
 WHERE NOT beagu_private.beagu_2026_civic_publication_hold.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'active hold already exists'; END IF;
 INSERT INTO beagu_private.beagu_2026_civic_feedback_audit(feedback_id,actor_id,action,reason)
 VALUES(p_feedback,p_actor,'PUBLICATION_HOLD',trim(p_reason));
 RETURN jsonb_build_object('ok',true,'school_id',f.school_id,'status','HELD');
END $$;
REVOKE ALL ON FUNCTION public.beagu_2026_civic_hold_school(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_civic_hold_school(uuid,uuid,uuid,text,text) TO service_role;
-- Activation requires all existing release paths to honor the hold; never deploy this file alone.
