-- Read-only audit of historical school-question recovery.
-- Updated on 2026-11-20 (stage 9): classify all 2023-2025 recovery stages,
-- distinguish two blocked cases, and check the 3 stage-7 API-eligible records.
-- NEVER expose per-school original survey answer bundles in audit output.

WITH edited AS (
 SELECT DISTINCT school_id,survey_year
 FROM public.beagu_edited_school_rows
 WHERE school_id IS NOT NULL
), reviewed AS (
 SELECT DISTINCT school_id,survey_year
 FROM public.beagu_school_question_aggregates_v2
 WHERE review_status='OWNER_AUTHORIZED_CLOSED_CHOICE'
)
SELECT e.survey_year,s.sido_standard AS region,
 count(*) AS edited_school_years,
 count(*) FILTER (WHERE r.school_id IS NOT NULL) AS with_reviewed_modes,
 count(*) FILTER (WHERE r.school_id IS NULL) AS missing_reviewed_modes
FROM edited e JOIN public.schools s USING(school_id)
LEFT JOIN reviewed r USING(school_id,survey_year)
GROUP BY 1,2 ORDER BY 1,2;

WITH staged AS (
 SELECT survey_year, source_rows, jsonb_array_length(questions) AS question_count,
  CASE split_part(source_description, ':', 1)
   WHEN 'SOURCE_RECONCILED_20261120' THEN 'TRIPLE_KEY'
   WHEN 'SOURCE_RECONCILED_ALIAS_20261120' THEN 'PREFIX_ALIAS'
   WHEN 'SOURCE_RECONCILED_DISTRICT_20261120' THEN 'DISTRICT_PREFIX'
   WHEN 'SOURCE_RECONCILED_STEM_20261120' THEN 'SCHOOL_STEM'
   WHEN 'SOURCE_RECONCILED_OFFICIAL_ALIAS_20261120' THEN 'OFFICIAL_ALIAS_STAGE6'
   WHEN 'SOURCE_RECONCILED_TYPO_20261120_STAGE7' THEN 'TYPO_STAGE7'
   ELSE 'PREEXISTING'
  END AS source_stage
 FROM public.beagu_school_question_aggregates_v2
 WHERE survey_year BETWEEN 2023 AND 2025
)
SELECT survey_year,source_stage,
 count(*) AS school_years,
 sum(question_count) AS most_frequent_option_results,
 count(*) FILTER (WHERE source_rows=1) AS one_response_school_years
FROM staged
GROUP BY 1,2 ORDER BY 1,2;

WITH staged AS (
 SELECT question_id,
  CASE split_part(source_description, ':', 1)
   WHEN 'SOURCE_RECONCILED_20261120' THEN 'TRIPLE_KEY'
   WHEN 'SOURCE_RECONCILED_ALIAS_20261120' THEN 'PREFIX_ALIAS'
   WHEN 'SOURCE_RECONCILED_DISTRICT_20261120' THEN 'DISTRICT_PREFIX'
   WHEN 'SOURCE_RECONCILED_STEM_20261120' THEN 'SCHOOL_STEM'
   WHEN 'SOURCE_RECONCILED_OFFICIAL_ALIAS_20261120' THEN 'OFFICIAL_ALIAS_STAGE6'
   WHEN 'SOURCE_RECONCILED_TYPO_20261120_STAGE7' THEN 'TYPO_STAGE7'
   ELSE 'PREEXISTING'
  END AS source_stage
 FROM public.beagu_school_question_modes_supplement_v1
)
SELECT question_id,source_stage,
 count(*) AS most_frequent_checkbox_modes
FROM staged
GROUP BY 1,2 ORDER BY 1,2;

-- Known unresolved cases are explicit and remain visible as REVIEW_BLOCKED.
-- This list is a review register, not an authorization to map or publish answers.
-- SCHOOL_ID_AMBIGUOUS: 2023 Chungnam Shinri school name is shared by Asan/Hongseong.
-- NO_UNIQUE_MODE: 2024 Yangsan Samsung closed-choice answers all tied.
WITH known(school_id,survey_year,reason) AS (
 VALUES ('8181034',2023,'SCHOOL_ID_AMBIGUOUS'),
        ('9151011',2024,'NO_UNIQUE_MODE')
), reviewed AS (
 SELECT DISTINCT school_id,survey_year
 FROM public.beagu_school_question_aggregates_v2
 WHERE review_status='OWNER_AUTHORIZED_CLOSED_CHOICE'
)
SELECT k.school_id,k.survey_year,k.reason,
 CASE WHEN r.school_id IS NOT NULL THEN 'RESTORED' ELSE 'REVIEW_BLOCKED' END AS review_state
FROM known k LEFT JOIN reviewed r USING(school_id,survey_year)
ORDER BY k.survey_year,k.school_id;

-- Stage-7 three school-year rows: independently check API-ready option shape.
-- Return counts and validity flags only, NEVER modeOption values.
WITH expected(school_id,survey_year,modes) AS (
 VALUES ('7551084',2024,13),('9091232',2024,13),('7882030',2025,47)
), actual AS (
 SELECT a.school_id,a.survey_year,jsonb_array_length(a.questions) AS stored,
 count(*) FILTER (
  WHERE (q.value->>'questionId') ~ '^Q[0-9]{2}$'
  AND length(q.value->>'modeOption') BETWEEN 1 AND 180
  AND (q.value->>'validRows') ~ '^[1-9][0-9]*$'
  AND jsonb_typeof(q.value->'roundedDistribution') = 'array'
  AND jsonb_array_length(q.value->'roundedDistribution') = 0
 ) AS api_eligible
 FROM public.beagu_school_question_aggregates_v2 a,
 LATERAL jsonb_array_elements(a.questions) AS q(value)
 WHERE a.review_status='OWNER_AUTHORIZED_CLOSED_CHOICE'
 AND (a.school_id,a.survey_year) IN (SELECT school_id,survey_year FROM expected)
 GROUP BY a.school_id,a.survey_year,a.questions
)
SELECT e.school_id,e.survey_year,e.modes AS expected,
 a.stored,a.api_eligible,
 coalesce(a.stored=e.modes AND a.api_eligible=e.modes,false) AS verified
FROM expected e LEFT JOIN actual a USING(school_id,survey_year)
ORDER BY e.survey_year,e.school_id;

SELECT c.relname,c.relrowsecurity AS rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_can_read,
 has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_can_read
FROM pg_class c WHERE c.oid IN (
 'public.beagu_school_question_aggregates_v2'::regclass,
 'public.beagu_school_question_modes_supplement_v1'::regclass
) ORDER BY 1;
