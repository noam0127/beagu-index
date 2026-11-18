-- Private, fail-closed automatic QA of 2026 survey staging.
-- Does NOT infer consent, assert identity review, or publish n=1 responses.
CREATE TABLE IF NOT EXISTS beagu_private.beagu_2026_auto_review_status (
  source_spreadsheet_id text NOT NULL,
  school_id text NOT NULL REFERENCES public.schools(school_id),
  survey_year smallint NOT NULL DEFAULT 2026 CHECK(survey_year=2026),
  source_response_rows integer NOT NULL CHECK(source_response_rows>=0),
  technical_status text NOT NULL CHECK(technical_status IN
    ('PRELAUNCH_EXCLUDED','NO_OFFICIAL_DATA','NEEDS_SCHOOL_CHECK',
     'NEEDS_QUESTION_CHECK','TECHNICAL_CHECK_PASSED')),
  publication_status text NOT NULL DEFAULT 'WITHHELD' CHECK(publication_status='WITHHELD'),
  reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  matching_core_questions integer NOT NULL DEFAULT 0 CHECK(matching_core_questions BETWEEN 0 AND 13),
  verified_catalog_questions integer NOT NULL DEFAULT 0 CHECK(verified_catalog_questions BETWEEN 0 AND 13),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_spreadsheet_id,school_id)
);
ALTER TABLE beagu_private.beagu_2026_auto_review_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_2026_auto_review_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON beagu_private.beagu_2026_auto_review_status TO service_role;
COMMENT ON TABLE beagu_private.beagu_2026_auto_review_status IS
 'Automatic technical QA of 2026 survey staging; always withheld. No source-row data, response choices, respondent identifiers or auto-publication authority.';

CREATE OR REPLACE FUNCTION beagu_private.review_2026_staged_aggregates()
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
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
         AND q.nonblank_response_rows>0
         AND q.nonblank_response_rows<=c.school_response_rows) AS matching_core_questions,
      (SELECT count(*)::integer
       FROM beagu_private.beagu_2026_question_coverage q
       WHERE q.source_spreadsheet_id=c.source_spreadsheet_id AND q.school_id=c.school_id
         AND q.survey_year=2026 AND q.nonblank_response_rows>c.school_response_rows)
       AS impossible_question_counts
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
        CASE WHEN matching_core_questions<13 THEN 'CORE_QUESTION_COVERAGE_INCOMPLETE' END,
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
        WHEN matching_core_questions<13 OR impossible_question_counts>0
          OR verified_catalog_questions<13 THEN 'NEEDS_QUESTION_CHECK'
        ELSE 'TECHNICAL_CHECK_PASSED'
      END AS technical_status
    FROM staging
  )
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
      checked_at=now();
  GET DIAGNOSTICS checked_count=ROW_COUNT;
  RETURN checked_count;
END;
$function$;

REVOKE ALL ON FUNCTION beagu_private.review_2026_staged_aggregates() FROM PUBLIC,anon,authenticated;
-- Run repeatedly without duplicating a scheduling job. Cron runs as the DB job owner.
SELECT cron.schedule(
  'beagu-2026-private-auto-quality-check',
  '*/15 * * * *',
  'SELECT beagu_private.review_2026_staged_aggregates();'
);
