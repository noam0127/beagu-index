-- Read-only audit: vetted school-level question modes versus edited workbook coverage.
WITH edited AS (
  SELECT DISTINCT school_id, survey_year
  FROM public.beagu_edited_school_rows WHERE school_id IS NOT NULL
), vetted AS (
  SELECT DISTINCT school_id, survey_year
  FROM public.beagu_school_question_aggregates_v2
  WHERE review_status='OWNER_AUTHORIZED_CLOSED_CHOICE'
)
SELECT e.survey_year,s.sido_standard,
  count(*) AS edited_school_years,
  count(*) FILTER (WHERE v.school_id IS NOT NULL) AS has_vetted_modes,
  count(*) FILTER (WHERE v.school_id IS NULL) AS missing_vetted_modes
FROM edited e JOIN public.schools s USING (school_id)
LEFT JOIN vetted v USING (school_id,survey_year)
GROUP BY e.survey_year,s.sido_standard
ORDER BY e.survey_year,s.sido_standard;

-- New source-confirmed three-part identity restoration, no identities or respondent answers returned.
SELECT survey_year,count(*) AS schools,
       sum(jsonb_array_length(questions)) AS source_verified_question_modes,
       count(*) FILTER (WHERE source_rows=1) AS single_response_school_count
FROM public.beagu_school_question_aggregates_v2
WHERE source_description LIKE 'SOURCE_RECONCILED_20261120:%'
GROUP BY survey_year ORDER BY survey_year;

-- 2025 verified multi-select modes (Q03/Q04/Q30).
SELECT question_id,count(*) AS recovered_modes
FROM public.beagu_school_question_modes_supplement_v1
WHERE source_description LIKE 'SOURCE_RECONCILED_20261120:%'
GROUP BY question_id ORDER BY question_id;
