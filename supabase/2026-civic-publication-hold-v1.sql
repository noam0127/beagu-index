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
 -- Invalidate the old school approval, preserving the raw aggregate.
 UPDATE public.beagu_2026_results_snapshot SET approval_status='WITHHELD',approved_by=NULL,approved_at=NULL,approved_payload_sha256=NULL,approval_evidence=NULL WHERE school_id=f.school_id;
 INSERT INTO beagu_private.beagu_2026_civic_feedback_audit(feedback_id,actor_id,action,reason)
 VALUES(p_feedback,p_actor,'PUBLICATION_HOLD',trim(p_reason));
 RETURN jsonb_build_object('ok',true,'school_id',f.school_id,'status','HELD');
END $$;
REVOKE ALL ON FUNCTION public.beagu_2026_civic_hold_school(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_civic_hold_school(uuid,uuid,uuid,text,text) TO service_role;
-- Activation requires all existing release paths to honor the hold; never deploy this file alone.

-- v1.9.0 candidate: require source QA row totals to match the exact approved aggregate in every tier gate.
-- Apply only on explicit backend deployment approval. Existing approvals are not expanded or modified.
CREATE OR REPLACE FUNCTION public.beagu_2026_level_school_published(
 p_school_id text,p_level integer
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((
   SELECT true
   FROM public.beagu_2026_results_snapshot r
   JOIN beagu_private.beagu_2026_publication_basis_review b
     ON b.school_id=r.school_id AND b.payload_sha256=r.payload_sha256
   JOIN beagu_private.beagu_2026_auto_review_status t
     ON t.school_id=r.school_id AND t.survey_year=2026
   JOIN beagu_private.beagu_2026_level_release_approvals l
     ON l.access_level=p_level AND l.approved=true
   WHERE r.school_id=p_school_id AND p_level BETWEEN 0 AND 2
     AND r.approval_status='APPROVED'
   AND NOT EXISTS (SELECT 1 FROM beagu_private.beagu_2026_civic_publication_hold h WHERE h.school_id=r.school_id AND h.active)
     AND r.approved_payload_sha256=r.payload_sha256
     AND r.approved_at IS NOT NULL
     AND r.approved_at<=l.approved_at
     AND r.approved_at>=r.updated_at
     AND r.approved_at>=r.source_snapshot_at
     AND (p_level=2 OR r.approved_at<=now()-interval '24 hours')
     AND r.school_match_status='EXACT_REGION_OFFICE_NAME'
     AND r.school_response_rows>=1
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(r.questions) q
       WHERE coalesce((q->>'invalid')::integer,1)>0
     )
     AND t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
     AND t.technical_status='TECHNICAL_CHECK_PASSED'
     AND t.matching_core_questions=13 AND t.verified_catalog_questions=13
     AND t.checked_at>=r.source_snapshot_at
     AND t.source_response_rows=r.school_response_rows
     AND b.review_status='VERIFIED'
     AND b.reviewer_user_id::text=r.approved_by
     AND b.reviewed_at>=r.source_snapshot_at
     AND b.notice_effective_at<=r.source_snapshot_at
     AND b.distinct_respondents_reviewed AND b.personal_data_reviewed
     AND b.small_sample_reviewed AND b.reidentification_reviewed
     AND b.prior_data_combination_reviewed
   LIMIT 1
 ),false)
$$;
REVOKE ALL ON FUNCTION public.beagu_2026_level_school_published(text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_level_school_published(text,integer) TO service_role;

-- For batch results such as culture indicators: return only school IDs, never private details.
CREATE OR REPLACE FUNCTION public.beagu_2026_level_released_school_ids(p_ids text[],p_level integer)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(array_agg(id),ARRAY[]::text[]) FROM (
   SELECT DISTINCT u.school_id AS id FROM unnest(p_ids) AS u(school_id)
   WHERE p_level BETWEEN 0 AND 2
     AND public.beagu_2026_level_school_published(school_id,p_level)
   LIMIT 20
 ) s
$$;
REVOKE ALL ON FUNCTION public.beagu_2026_level_released_school_ids(text[],integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_level_released_school_ids(text[],integer) TO service_role;

CREATE OR REPLACE FUNCTION public.beagu_2026_level_release_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH eligible AS (
  SELECT r.school_id,r.approved_at
  FROM public.beagu_2026_results_snapshot r
  JOIN beagu_private.beagu_2026_publication_basis_review b
    ON b.school_id=r.school_id AND b.payload_sha256=r.payload_sha256
  JOIN beagu_private.beagu_2026_auto_review_status t
    ON t.school_id=r.school_id AND t.survey_year=2026
  WHERE r.approval_status='APPROVED'
   AND NOT EXISTS (SELECT 1 FROM beagu_private.beagu_2026_civic_publication_hold h WHERE h.school_id=r.school_id AND h.active)
    AND r.approved_payload_sha256=r.payload_sha256
    AND r.approved_at IS NOT NULL
    AND r.approved_at>=r.updated_at AND r.approved_at>=r.source_snapshot_at
    AND r.school_match_status='EXACT_REGION_OFFICE_NAME'
    AND r.school_response_rows>=1
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.questions) q
      WHERE coalesce((q->>'invalid')::integer,1)>0)
    AND b.review_status='VERIFIED' AND b.reviewer_user_id::text=r.approved_by
    AND b.reviewed_at>=r.source_snapshot_at
    AND b.notice_effective_at<=r.source_snapshot_at
    AND b.distinct_respondents_reviewed AND b.personal_data_reviewed
    AND b.small_sample_reviewed AND b.reidentification_reviewed
    AND b.prior_data_combination_reviewed
    AND t.technical_status='TECHNICAL_CHECK_PASSED'
    AND t.matching_core_questions=13 AND t.verified_catalog_questions=13
    AND t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
    AND t.checked_at>=r.source_snapshot_at
     AND t.source_response_rows=r.school_response_rows
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'level',v.level,'approved',coalesce(l.approved,false),
   'approved_at',l.approved_at,
   'eligible_schools',(SELECT count(*) FROM eligible),
   'covered_schools',(SELECT count(*) FROM eligible e
       WHERE l.approved AND e.approved_at<=l.approved_at),
   'released_schools',(SELECT count(*) FROM eligible e
       WHERE l.approved AND e.approved_at<=l.approved_at
        AND (v.level=2 OR e.approved_at<=now()-interval '24 hours'))
 ) ORDER BY v.level),'[]'::jsonb)
 FROM (VALUES (0),(1),(2)) v(level)
 LEFT JOIN beagu_private.beagu_2026_level_release_approvals l ON l.access_level=v.level
$$;
REVOKE ALL ON FUNCTION public.beagu_2026_level_release_status()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_level_release_status() TO service_role;

CREATE OR REPLACE FUNCTION public.beagu_2026_set_level_final_approval(
 p_level integer,p_actor uuid,p_session uuid,p_action text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eligible_count integer; decision_at timestamptz;
BEGIN
 IF p_level IS NULL OR p_level NOT BETWEEN 0 AND 2 OR p_actor IS NULL
 OR p_session IS NULL OR p_action NOT IN ('APPROVE','REVOKE')
 THEN RAISE EXCEPTION 'invalid tier decision'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.beagu_admin_accounts a
       WHERE a.user_id=p_actor AND a.role='owner' AND a.enabled=true)
    OR NOT public.beagu_admin_active_mfa_session(p_actor,p_session)
 THEN RAISE EXCEPTION 'owner and active MFA required'; END IF;
 PERFORM pg_advisory_xact_lock(2026,2026);
 SELECT count(*)::integer INTO eligible_count
 FROM public.beagu_2026_results_snapshot r
 JOIN beagu_private.beagu_2026_publication_basis_review b
   ON b.school_id=r.school_id AND b.payload_sha256=r.payload_sha256
 JOIN beagu_private.beagu_2026_auto_review_status t
   ON t.school_id=r.school_id AND t.survey_year=2026
 WHERE r.approval_status='APPROVED'
   AND NOT EXISTS (SELECT 1 FROM beagu_private.beagu_2026_civic_publication_hold h WHERE h.school_id=r.school_id AND h.active)
   AND r.approved_payload_sha256=r.payload_sha256
   AND r.approved_at IS NOT NULL
   AND r.approved_at>=r.updated_at AND r.approved_at>=r.source_snapshot_at
   AND r.school_match_status='EXACT_REGION_OFFICE_NAME'
   AND r.school_response_rows>=1
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.questions) q
     WHERE coalesce((q->>'invalid')::integer,1)>0)
   AND b.review_status='VERIFIED' AND b.reviewer_user_id::text=r.approved_by
   AND b.reviewed_at>=r.source_snapshot_at
   AND b.notice_effective_at<=r.source_snapshot_at
   AND b.distinct_respondents_reviewed AND b.personal_data_reviewed
   AND b.small_sample_reviewed AND b.reidentification_reviewed
   AND b.prior_data_combination_reviewed
   AND t.technical_status='TECHNICAL_CHECK_PASSED'
   AND t.matching_core_questions=13 AND t.verified_catalog_questions=13
   AND t.checked_at>=r.source_snapshot_at
     AND t.source_response_rows=r.school_response_rows
   AND t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4';
 IF p_action='APPROVE' AND eligible_count=0
 THEN RAISE EXCEPTION 'no fully approved school results available'; END IF;
 decision_at:=CASE WHEN p_action='APPROVE' THEN now() ELSE NULL END;
 INSERT INTO beagu_private.beagu_2026_level_release_approvals
   (access_level,approved,approved_at,approved_by,updated_at)
 VALUES(p_level,p_action='APPROVE',decision_at,
   CASE WHEN p_action='APPROVE' THEN p_actor ELSE NULL END,now())
 ON CONFLICT(access_level) DO UPDATE SET
   approved=excluded.approved,approved_at=excluded.approved_at,
   approved_by=excluded.approved_by,updated_at=now();
 INSERT INTO beagu_private.beagu_2026_level_release_audit
   (access_level,action,actor,eligible_school_count)
 VALUES(p_level,p_action,p_actor,eligible_count);
 RETURN jsonb_build_object('ok',true,'level',p_level,'approved',p_action='APPROVE',
   'approved_at',decision_at,'eligible_schools',eligible_count);
END $$;
REVOKE ALL ON FUNCTION public.beagu_2026_set_level_final_approval(integer,uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_set_level_final_approval(integer,uuid,uuid,text)
 TO service_role;



CREATE OR REPLACE FUNCTION public.beagu_2026_civic_resume_school(
 p_actor uuid,p_session uuid,p_feedback uuid,p_expected_sha text,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h beagu_private.beagu_2026_civic_publication_hold; r public.beagu_2026_results_snapshot;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_feedback IS NULL OR p_expected_sha IS NULL
 OR p_expected_sha !~ '^[a-f0-9]{64}$' OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500
 THEN RAISE EXCEPTION 'invalid resume request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts WHERE user_id=p_actor AND role='owner' AND enabled)
 OR public.beagu_admin_active_mfa_session(p_actor,p_session) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'owner MFA required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(2026,2026);
 SELECT * INTO STRICT h FROM beagu_private.beagu_2026_civic_publication_hold WHERE feedback_id=p_feedback AND active FOR UPDATE;
 SELECT * INTO STRICT r FROM public.beagu_2026_results_snapshot WHERE school_id=h.school_id FOR UPDATE;
 IF r.payload_sha256 IS DISTINCT FROM p_expected_sha OR r.approval_status<>'APPROVED'
 OR r.approved_payload_sha256 IS DISTINCT FROM r.payload_sha256
 OR r.approved_at IS NULL OR r.approved_at<=h.updated_at OR r.approved_at<r.source_snapshot_at OR r.approved_at<r.updated_at
 OR r.school_match_status<>'EXACT_REGION_OFFICE_NAME'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.questions) q WHERE coalesce((q->>'invalid')::integer,1)>0)
 OR NOT EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status t WHERE t.school_id=r.school_id AND t.survey_year=2026
 AND t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
 AND t.technical_status='TECHNICAL_CHECK_PASSED' AND t.matching_core_questions=13 AND t.verified_catalog_questions=13
 AND t.source_response_rows=r.school_response_rows AND t.checked_at>h.updated_at AND t.checked_at>=r.source_snapshot_at)
 OR NOT EXISTS(SELECT 1 FROM beagu_private.beagu_2026_publication_basis_review b WHERE b.school_id=r.school_id AND b.payload_sha256=r.payload_sha256
 AND b.review_status='VERIFIED' AND b.reviewer_user_id::text=r.approved_by AND b.reviewed_at>h.updated_at AND b.reviewed_at>=r.source_snapshot_at AND b.notice_effective_at<=r.source_snapshot_at
 AND b.distinct_respondents_reviewed AND b.personal_data_reviewed AND b.small_sample_reviewed AND b.reidentification_reviewed AND b.prior_data_combination_reviewed)
 THEN RAISE EXCEPTION 'fresh exact snapshot approval and QA required'; END IF;
 UPDATE beagu_private.beagu_2026_civic_publication_hold SET active=false,updated_at=now(),decision_by=p_actor,reason=trim(p_reason) WHERE school_id=h.school_id;
 INSERT INTO beagu_private.beagu_2026_civic_feedback_audit(feedback_id,actor_id,action,reason) VALUES(p_feedback,p_actor,'PUBLICATION_HOLD_LIFTED',trim(p_reason));
 RETURN jsonb_build_object('ok',true,'status','REVIEWED','school_id',h.school_id);
END $$;
REVOKE ALL ON FUNCTION public.beagu_2026_civic_resume_school(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_civic_resume_school(uuid,uuid,uuid,text,text) TO service_role;
