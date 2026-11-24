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


-- The existing anonymous SELECT policy retains its independent review and cooldown.
-- This restrictive policy adds the missing Lv0 final decision to every SELECT path.
-- The narrow boolean helper lives in a non-exposed schema; no private schema usage
-- or direct access to the internal tier RPC is granted.
CREATE OR REPLACE FUNCTION beagu_private.beagu_2026_lv0_read_gate(p_school_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(p_school_id ~ '^[A-Z0-9]{7}$' AND
 public.beagu_2026_level_school_published(p_school_id,0),false)
$$;
REVOKE ALL ON FUNCTION beagu_private.beagu_2026_lv0_read_gate(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beagu_private.beagu_2026_lv0_read_gate(text) TO anon,authenticated;
ALTER TABLE public.beagu_school_report_yearly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS beagu_2026_lv0_final_tier_gate ON public.beagu_school_report_yearly;
CREATE POLICY beagu_2026_lv0_final_tier_gate ON public.beagu_school_report_yearly
 AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING (survey_year<>2026 OR beagu_private.beagu_2026_lv0_read_gate(school_id));
-- The browser only needs these four fields (including filtering on status).
-- Counts, reviewer metadata, evidence and all other internal columns stay private.
REVOKE SELECT ON public.beagu_school_report_yearly FROM PUBLIC,anon,authenticated;
GRANT SELECT(school_id,survey_year,percentile,publication_status)
 ON public.beagu_school_report_yearly TO anon,authenticated;
