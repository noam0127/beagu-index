-- 2026 questionnaire QA cutover: READ-ONLY preview of the proposed checks.
-- Run with an authorized administrative connection. Does not read raw teacher rows.
-- This query intentionally produces anonymous counts, not school identifiers.
-- Do not treat PASS as publication authorization.
WITH
verified_catalog AS (
  SELECT count(*)::int AS n
  FROM public.beagu_metric_catalog m
  WHERE m.survey_year=2026
    AND m.question_id ~ '^Q(0[1-9]|1[0-3])$'
    AND m.verified IS TRUE
    AND length(coalesce(m.verification_evidence,''))>=12
),
records AS (
  SELECT r.school_id, r.school_response_rows, r.school_match_status,
         c.source_spreadsheet_id, c.prelaunch_rows,
         coalesce(t.technical_status,'NOT_CHECKED') old_technical_status,
         coalesce(q.quality_status,'NOT_SCANNED') basic_quality_status,
         v.n verified_catalog_questions,
         (
          SELECT count(DISTINCT k.question_id)::int
          FROM beagu_private.beagu_2026_question_coverage k
          WHERE k.source_spreadsheet_id=c.source_spreadsheet_id
            AND k.school_id=c.school_id AND k.survey_year=2026
            AND k.question_subitem='MAIN'
            AND k.question_id ~ '^Q(0[1-9]|1[0-3])$'
            AND k.nonblank_response_rows>=0
            AND k.nonblank_response_rows<=c.school_response_rows
         ) core_slots_in_qa,
         (
          SELECT count(*)::int
          FROM beagu_private.beagu_2026_question_coverage k
          WHERE k.source_spreadsheet_id=c.source_spreadsheet_id
            AND k.school_id=c.school_id AND k.survey_year=2026
            AND k.nonblank_response_rows>c.school_response_rows
         ) impossible_qa_counts,
         (
          SELECT count(*)::int
          FROM jsonb_array_elements(r.questions) j(v)
          WHERE j.v->>'id' ~ '^Q(0[1-9]|1[0-3])$'
            AND j.v->>'row'='-1'
         ) core_slots_in_snapshot,
         (
          SELECT count(*)::int
          FROM jsonb_array_elements(r.questions) j(v)
          WHERE j.v->>'id' ~ '^Q(0[1-9]|1[0-3])$'
            AND j.v->>'row'='-1'
            AND (j.v->>'invalid')::int>0
         ) unrecognized_core_items
  FROM public.beagu_2026_results_snapshot r
  CROSS JOIN verified_catalog v
  LEFT JOIN beagu_private.beagu_2026_school_coverage c
    ON c.school_id=r.school_id AND c.survey_year=2026
       AND c.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
  LEFT JOIN beagu_private.beagu_2026_auto_review_status t
    ON t.school_id=r.school_id
       AND t.source_spreadsheet_id=c.source_spreadsheet_id
  LEFT JOIN beagu_private.beagu_2026_quality_reviews q
    ON q.school_id=r.school_id AND q.payload_sha256=r.payload_sha256
),
classified AS (
  SELECT *,
         CASE
           WHEN source_spreadsheet_id IS NULL THEN 'MISSING_STAGE'
           WHEN prelaunch_rows>0 THEN 'PRELAUNCH_EXCLUDED'
           WHEN school_response_rows<1 THEN 'NO_OFFICIAL_DATA'
           WHEN school_match_status<>'EXACT_REGION_OFFICE_NAME' THEN 'NEEDS_SCHOOL_CHECK'
           WHEN core_slots_in_qa<>13 OR core_slots_in_snapshot<>13
             OR impossible_qa_counts>0 OR unrecognized_core_items>0
             OR verified_catalog_questions<13 THEN 'NEEDS_QUESTION_CHECK'
           ELSE 'TECHNICAL_CHECK_PASSED'
         END AS proposed_technical_status
  FROM records
),
changes AS (
  SELECT old_technical_status, proposed_technical_status, count(*)::int schools
  FROM classified
  WHERE old_technical_status IS DISTINCT FROM proposed_technical_status
  GROUP BY 1,2
)
SELECT jsonb_build_object(
  'survey_year',2026,
  'checked_at',now(),
  'schools',(SELECT count(*) FROM classified),
  'current',(
    SELECT coalesce(jsonb_object_agg(old_technical_status,n),'{}'::jsonb)
    FROM (SELECT old_technical_status,count(*) n FROM classified GROUP BY 1) x
  ),
  'proposed',(
    SELECT coalesce(jsonb_object_agg(proposed_technical_status,n),'{}'::jsonb)
    FROM (SELECT proposed_technical_status,count(*) n FROM classified GROUP BY 1) x
  ),
  'changes',(SELECT coalesce(jsonb_agg(to_jsonb(changes)),'[]'::jsonb) FROM changes),
  'unrecognized_core_schools',(
    SELECT count(*) FROM classified WHERE unrecognized_core_items>0
  ),
  'unmatched_school_schools',(
    SELECT count(*) FROM classified WHERE school_match_status<>'EXACT_REGION_OFFICE_NAME'
  ),
  'missing_coverage_schools',(
    SELECT count(*) FROM classified
    WHERE core_slots_in_qa<>13 OR core_slots_in_snapshot<>13
  ),
  'approved_snapshots',(
    SELECT count(*) FROM public.beagu_2026_results_snapshot
    WHERE approval_status='APPROVED'
  ),
  'publication_basis_verified',(
    SELECT count(*) FROM beagu_private.beagu_2026_publication_basis_review
    WHERE review_status='VERIFIED'
  ),
  'operation','READ_ONLY_NO_APPROVAL'
) AS preflight;
