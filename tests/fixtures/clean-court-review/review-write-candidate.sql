-- NOT a migration; disposable fixture only. Do not apply to production.
CREATE OR REPLACE FUNCTION beagu_private.review_2026_staged_aggregates()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE checked_count integer;
BEGIN
  WITH verified_catalog AS (
    SELECT count(*)::integer AS n
    FROM public.beagu_metric_catalog m
    WHERE m.survey_year=2026 AND m.question_id ~ '^Q(0[1-9]|1[0-3])$'
      AND m.verified IS TRUE AND length(coalesce(m.verification_evidence,''))>=12
  ),
  staging AS (
    SELECT c.source_spreadsheet_id,c.school_id,c.survey_year,c.school_response_rows,
      c.prelaunch_rows,c.school_match_status,c.distinct_respondents_verified,
      c.personal_data_reviewed,
      v.n AS verified_catalog_questions,
      (SELECT count(DISTINCT q.question_id)::integer
       FROM beagu_private.beagu_2026_question_coverage q
       WHERE q.source_spreadsheet_id=c.source_spreadsheet_id AND q.school_id=c.school_id
         AND q.survey_year=2026 AND q.question_subitem='MAIN'
         AND q.question_id ~ '^Q(0[1-9]|1[0-3])$'
         AND q.nonblank_response_rows>=0
         AND q.nonblank_response_rows<=c.school_response_rows) AS matching_core_questions,
      (SELECT count(*)::integer
       FROM beagu_private.beagu_2026_question_coverage q
       WHERE q.source_spreadsheet_id=c.source_spreadsheet_id AND q.school_id=c.school_id
         AND q.survey_year=2026 AND q.nonblank_response_rows>c.school_response_rows)
       AS impossible_question_counts,
      (SELECT count(*)::integer
       FROM public.beagu_2026_results_snapshot r
       CROSS JOIN LATERAL jsonb_array_elements(r.questions) j(q)
       WHERE r.school_id=c.school_id AND r.school_response_rows=c.school_response_rows
         AND j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
         AND coalesce((j.q->>'row')::integer,-999)=-1
       ) AS snapshot_core_rows,
      (SELECT count(*)::integer
       FROM public.beagu_2026_results_snapshot r
       CROSS JOIN LATERAL jsonb_array_elements(r.questions) j(q)
       WHERE r.school_id=c.school_id AND r.school_response_rows=c.school_response_rows
         AND j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
         AND coalesce((j.q->>'row')::integer,-999)=-1
         AND coalesce((j.q->>'invalid')::integer,0)>0
       ) AS invalid_core_aggregate
    FROM beagu_private.beagu_2026_school_coverage c
    CROSS JOIN verified_catalog v
    WHERE c.survey_year=2026
  ),
  decisions AS (
    SELECT *,
      array_remove(ARRAY[
        CASE WHEN prelaunch_rows>0 THEN 'PRELAUNCH_EXCLUDED' END,
        CASE WHEN school_response_rows<1 THEN 'NO_OFFICIAL_RESPONSES' END,
        CASE WHEN school_match_status<>'EXACT_REGION_OFFICE_NAME' THEN 'SCHOOL_MATCH_NEEDS_REVIEW' END,
        CASE WHEN impossible_question_counts>0 THEN 'RESPONSE_COUNT_CONFLICT' END,
        CASE WHEN matching_core_questions<13 OR snapshot_core_rows<>13
          THEN 'CORE_QUESTION_COVERAGE_INCOMPLETE' END,
        CASE WHEN invalid_core_aggregate>0 THEN 'UNRECOGNIZED_MANDATORY_ANSWER' END,
        CASE WHEN verified_catalog_questions<13 THEN '2026_CODEBOOK_NOT_VERIFIED' END,
        CASE WHEN distinct_respondents_verified IS NOT TRUE THEN 'DISTINCT_RESPONDENTS_UNVERIFIED' END,
        CASE WHEN personal_data_reviewed IS NOT TRUE THEN 'PERSONAL_DATA_REVIEW_INCOMPLETE' END,
        CASE WHEN school_response_rows<5 THEN 'SMALL_CELL_REIDENTIFICATION_RISK' END,
        'PUBLICATION_CONSENT_EVIDENCE_NOT_CONNECTED'
      ]::text[],NULL) AS reasons,
      CASE
        WHEN prelaunch_rows>0 THEN 'PRELAUNCH_EXCLUDED'
        WHEN school_response_rows<1 THEN 'NO_OFFICIAL_DATA'
        WHEN school_match_status<>'EXACT_REGION_OFFICE_NAME' THEN 'NEEDS_SCHOOL_CHECK'
        WHEN matching_core_questions<13 OR snapshot_core_rows<>13
          OR invalid_core_aggregate>0 OR impossible_question_counts>0
          OR verified_catalog_questions<13 THEN 'NEEDS_QUESTION_CHECK'
        ELSE 'TECHNICAL_CHECK_PASSED'
      END AS technical_status
    FROM staging
  ), written AS (
  INSERT INTO beagu_private.beagu_2026_auto_review_status AS a
    (source_spreadsheet_id,school_id,survey_year,source_response_rows,technical_status,
     publication_status,reasons,matching_core_questions,verified_catalog_questions,checked_at)
  SELECT source_spreadsheet_id,school_id,survey_year,school_response_rows,technical_status,
    'WITHHELD',reasons,matching_core_questions,verified_catalog_questions,now()
  FROM decisions
  ON CONFLICT(source_spreadsheet_id,school_id) DO UPDATE
    SET source_response_rows=EXCLUDED.source_response_rows,
      technical_status=EXCLUDED.technical_status,
      publication_status='WITHHELD',
      reasons=EXCLUDED.reasons,
      matching_core_questions=EXCLUDED.matching_core_questions,
      verified_catalog_questions=EXCLUDED.verified_catalog_questions,
      checked_at=now()
    WHERE (a.source_response_rows,a.technical_status,a.publication_status,a.reasons,
           a.matching_core_questions,a.verified_catalog_questions)
      IS DISTINCT FROM
          (EXCLUDED.source_response_rows,EXCLUDED.technical_status,EXCLUDED.publication_status,EXCLUDED.reasons,
           EXCLUDED.matching_core_questions,EXCLUDED.verified_catalog_questions)
       OR EXISTS (SELECT 1 FROM public.beagu_2026_results_snapshot r
          WHERE r.school_id=a.school_id AND r.source_snapshot_at>a.checked_at)
       OR EXISTS (SELECT 1 FROM beagu_private.beagu_2026_civic_publication_hold h
          WHERE h.school_id=a.school_id AND h.active AND h.updated_at>=a.checked_at)
       OR EXISTS (SELECT 1 FROM beagu_private.beagu_2026_school_coverage c
          WHERE c.source_spreadsheet_id=a.source_spreadsheet_id AND c.school_id=a.school_id
            AND c.updated_at>a.checked_at)
       OR EXISTS (SELECT 1 FROM beagu_private.beagu_2026_question_coverage q
          WHERE q.source_spreadsheet_id=a.source_spreadsheet_id AND q.school_id=a.school_id
            AND q.survey_year=2026 AND q.updated_at>a.checked_at)
    RETURNING 1
  )
  SELECT count(*)::integer INTO checked_count FROM decisions;
  RETURN checked_count;
END;
$function$;
