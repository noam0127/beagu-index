-- Bulk approval applies only to already VERIFIED independent evidence for exact snapshots.
-- Never creates, upgrades, or falsifies a publication-basis review. N=1 stays eligible.
CREATE OR REPLACE FUNCTION public.beagu_2026_owner_bulk_verified(
 p_actor uuid,p_session uuid,p_preview boolean DEFAULT true,
 p_limit integer DEFAULT 400,p_confirmation text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v record; total integer:=0; approved integer:=0; failures integer:=0;
 succeeded text[]:=array[]::text[]; rejected text[]:=array[]::text[]; evidence jsonb;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_preview IS NULL OR p_limit NOT BETWEEN 1 AND 400
 THEN RAISE EXCEPTION 'invalid owner bulk request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts a
   WHERE a.user_id=p_actor AND a.role='owner' AND a.enabled)
 OR NOT public.beagu_admin_active_mfa_session(p_actor,p_session)
 THEN RAISE EXCEPTION 'owner MFA required'; END IF;
 IF NOT p_preview AND p_confirmation IS DISTINCT FROM 'APPROVE_VERIFIED_EXACT_SNAPSHOTS'
 THEN RAISE EXCEPTION 'explicit bulk confirmation required'; END IF;
 FOR v IN
 SELECT r.school_id,r.payload_sha256,b.basis_type,b.notice_source_ref,
 b.notice_digest_sha256,b.publication_scope,b.notes,b.reviewed_at
 FROM public.beagu_2026_results_snapshot r
 JOIN beagu_private.beagu_2026_publication_basis_review b
   ON b.school_id=r.school_id AND b.payload_sha256=r.payload_sha256
 WHERE r.approval_status='WITHHELD' AND r.school_response_rows>=1
 AND r.school_match_status='EXACT_REGION_OFFICE_NAME'
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.questions) j
   WHERE coalesce((j->>'invalid')::integer,1)>0)
 AND b.review_status='VERIFIED' AND b.reviewer_user_id=p_actor
 AND b.reviewed_at>=r.source_snapshot_at AND b.notice_effective_at<=r.source_snapshot_at
 AND b.distinct_respondents_reviewed AND b.personal_data_reviewed
 AND b.small_sample_reviewed AND b.reidentification_reviewed
 AND b.prior_data_combination_reviewed
 AND EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status q
   WHERE q.school_id=r.school_id AND q.survey_year=2026
     AND q.technical_status='TECHNICAL_CHECK_PASSED'
     AND q.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
     AND q.matching_core_questions=13 AND q.verified_catalog_questions=13)
 ORDER BY r.school_id LIMIT p_limit FOR UPDATE OF r SKIP LOCKED
 LOOP
  total:=total+1;
  IF p_preview THEN CONTINUE; END IF;
  -- Seven statements describe only recorded, verified evidence and technical checks.
  evidence:=jsonb_build_object(
    'source_scoring',concat('2026 technical 13-core QA passed for snapshot ',v.payload_sha256),
    'school_identity',concat('Exact region, education office, and school match: ',v.school_id),
    'duplicate_responses',concat('Previously verified unique respondents for ',v.school_id),
    'consent',concat('Verified ',v.basis_type,' notice ',v.notice_source_ref,
      ' digest ',v.notice_digest_sha256,' scope ',v.publication_scope),
    'small_sample',concat('Verified small sample review for ',v.school_id,': ',v.notes),
    'reidentification',concat('Verified reidentification review for ',v.school_id,': ',v.notes),
    'prior_data_combination',concat('Verified prior-data combination review for ',v.school_id,': ',v.notes),
    'admin_session_id',p_session::text,'decision','APPROVE_EXACT_SNAPSHOT',
    'review_origin','PRIOR_VERIFIED_PRIVATE_BASIS'
  );
  BEGIN
   PERFORM public.beagu_2026_approve_results(v.school_id,v.payload_sha256,p_actor::text,evidence);
   approved:=approved+1;succeeded:=array_append(succeeded,v.school_id);
  EXCEPTION WHEN OTHERS THEN
   failures:=failures+1;rejected:=array_append(rejected,v.school_id);
  END;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'preview',p_preview,'batch_candidates',total,
  'approved_count',approved,'failed_count',failures,
  'school_ids',to_jsonb(succeeded),'failed_school_ids',to_jsonb(rejected));
END; $$;
REVOKE ALL ON FUNCTION public.beagu_2026_owner_bulk_verified(uuid,uuid,boolean,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_owner_bulk_verified(uuid,uuid,boolean,integer,text)
 TO service_role;
COMMENT ON FUNCTION public.beagu_2026_owner_bulk_verified(uuid,uuid,boolean,integer,text)
 IS 'Owner MFA. At most 400 previously independently verified exact 2026 snapshots. Does not change review status. N=1 eligible.';