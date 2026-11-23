-- Exact school snapshot finalization, only by a currently MFA-authenticated owner.
-- N=1 is eligible but explicit evidence and individual risk attestations are mandatory.
CREATE OR REPLACE FUNCTION public.beagu_2026_owner_finalize_one(
 p_school_id text,p_expected_sha256 text,p_actor uuid,p_session uuid,
 p_basis_type text,p_notice_ref text,p_notice_digest text,
 p_notice_effective_at timestamptz,p_scope text,p_notes text,
 p_review_checks jsonb,p_evidence jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.beagu_2026_results_snapshot; k text;
BEGIN
 IF p_school_id !~ '^[A-Z0-9]{7}$' OR p_expected_sha256 !~ '^[a-f0-9]{64}$'
 OR p_actor IS NULL OR p_session IS NULL OR p_basis_type NOT IN
 ('EXPLICIT_RESPONDENT_CONSENT','OTHER_DOCUMENTED_LEGAL_BASIS')
 OR length(trim(coalesce(p_notice_ref,''))) NOT BETWEEN 12 AND 400
 OR coalesce(p_notice_ref,'') ~ '[<>\r\n]'
 OR p_notice_digest !~ '^[a-f0-9]{64}$'
 OR p_notice_effective_at IS NULL
 OR length(trim(coalesce(p_scope,''))) NOT BETWEEN 20 AND 500
 OR coalesce(p_scope,'') ~ '[<>\r\n]'
 OR length(trim(coalesce(p_notes,''))) NOT BETWEEN 12 AND 500 OR coalesce(p_notes,'') ~ '[<>]'
 OR jsonb_typeof(p_review_checks) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'invalid documented publication approval'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts a WHERE a.user_id=p_actor
   AND a.role='owner' AND a.enabled=true)
 OR NOT public.beagu_admin_active_mfa_session(p_actor,p_session)
 THEN RAISE EXCEPTION 'owner MFA required'; END IF;
 SELECT * INTO STRICT r FROM public.beagu_2026_results_snapshot
 WHERE school_id=p_school_id FOR UPDATE;
 IF r.payload_sha256 IS DISTINCT FROM p_expected_sha256
 OR p_notice_effective_at>r.source_snapshot_at
 THEN RAISE EXCEPTION 'source snapshot or prior notice mismatch'; END IF;
 IF r.school_response_rows<1 OR r.school_match_status<>'EXACT_REGION_OFFICE_NAME'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.questions) q
   WHERE coalesce((q->>'invalid')::integer,1)>0)
 THEN RAISE EXCEPTION 'technical review missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status q
 WHERE q.school_id=r.school_id AND q.survey_year=2026
 AND q.technical_status='TECHNICAL_CHECK_PASSED'
 AND q.matching_core_questions=13 AND q.verified_catalog_questions=13
 AND q.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4')
 THEN RAISE EXCEPTION 'source QA incomplete'; END IF;
 FOREACH k IN ARRAY ARRAY['distinct_respondents_reviewed','personal_data_reviewed',
 'small_sample_reviewed','reidentification_reviewed','prior_data_combination_reviewed']
 LOOP
 IF p_review_checks->k IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'review incomplete: %',k; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['source_scoring','school_identity','duplicate_responses',
 'consent','small_sample','reidentification','prior_data_combination'] LOOP
 IF jsonb_typeof(p_evidence->k) IS DISTINCT FROM 'string'
 OR length(trim(p_evidence->>k))<10
 THEN RAISE EXCEPTION 'missing source-specific evidence: %',k; END IF;
 END LOOP;
 INSERT INTO beagu_private.beagu_2026_publication_basis_review(
 school_id,payload_sha256,review_status,basis_type,notice_source_ref,
 notice_digest_sha256,notice_effective_at,publication_scope,reviewer_user_id,
 distinct_respondents_reviewed,personal_data_reviewed,small_sample_reviewed,
 reidentification_reviewed,prior_data_combination_reviewed,reviewed_at,notes,updated_at)
 VALUES(r.school_id,r.payload_sha256,'VERIFIED',p_basis_type,
 trim(p_notice_ref),p_notice_digest,p_notice_effective_at,trim(p_scope),p_actor,
 true,true,true,true,true,now(),trim(p_notes),now())
 ON CONFLICT(school_id) DO UPDATE SET
 payload_sha256=excluded.payload_sha256,review_status=excluded.review_status,
 basis_type=excluded.basis_type,notice_source_ref=excluded.notice_source_ref,
 notice_digest_sha256=excluded.notice_digest_sha256,
 notice_effective_at=excluded.notice_effective_at,
 publication_scope=excluded.publication_scope,reviewer_user_id=excluded.reviewer_user_id,
 distinct_respondents_reviewed=excluded.distinct_respondents_reviewed,
 personal_data_reviewed=excluded.personal_data_reviewed,
 small_sample_reviewed=excluded.small_sample_reviewed,
 reidentification_reviewed=excluded.reidentification_reviewed,
 prior_data_combination_reviewed=excluded.prior_data_combination_reviewed,
 reviewed_at=excluded.reviewed_at,notes=excluded.notes,updated_at=now();
 PERFORM public.beagu_2026_approve_results(
  r.school_id,r.payload_sha256,p_actor::text,
  p_evidence||jsonb_build_object('admin_session_id',p_session::text,
  'decision','APPROVE_EXACT_SNAPSHOT'));
 RETURN jsonb_build_object('ok',true,'school_id',r.school_id,'status','APPROVED');
END $$;
REVOKE ALL ON FUNCTION public.beagu_2026_owner_finalize_one(
 text,text,uuid,uuid,text,text,text,timestamptz,text,text,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_owner_finalize_one(
 text,text,uuid,uuid,text,text,text,timestamptz,text,text,jsonb,jsonb)
 TO service_role;