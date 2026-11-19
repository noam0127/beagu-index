-- Read-only audit of school-question recovery, 2026-11-20.
WITH edited AS (
 SELECT DISTINCT school_id,survey_year FROM public.beagu_edited_school_rows WHERE school_id IS NOT NULL
), reviewed AS (
 SELECT DISTINCT school_id,survey_year FROM public.beagu_school_question_aggregates_v2
 WHERE review_status='OWNER_AUTHORIZED_CLOSED_CHOICE'
)
SELECT e.survey_year,s.sido_standard AS region,
 count(*) AS edited_school_years,
 count(*) FILTER (WHERE r.school_id IS NOT NULL) AS with_reviewed_modes,
 count(*) FILTER (WHERE r.school_id IS NULL) AS missing_reviewed_modes
FROM edited e JOIN public.schools s USING(school_id)
LEFT JOIN reviewed r USING(school_id,survey_year)
GROUP BY 1,2 ORDER BY 1,2;

SELECT survey_year,
 CASE
 WHEN source_description LIKE 'SOURCE_RECONCILED_20261120:%' THEN 'TRIPLE_KEY'
 WHEN source_description LIKE 'SOURCE_RECONCILED_ALIAS_20261120:%' THEN 'PREFIX_ALIAS'
 WHEN source_description LIKE 'SOURCE_RECONCILED_STEM_20261120:%' THEN 'SCHOOL_STEM'
 ELSE 'PREEXISTING' END AS source_stage,
 count(*) AS school_years,sum(jsonb_array_length(questions)) AS most_frequent_option_results,
 count(*) FILTER (WHERE source_rows=1) AS one_response_schools
FROM public.beagu_school_question_aggregates_v2 GROUP BY 1,2 ORDER BY 1,2;

SELECT question_id,
 CASE
 WHEN source_description LIKE 'SOURCE_RECONCILED_20261120:%' THEN 'TRIPLE_KEY'
 WHEN source_description LIKE 'SOURCE_RECONCILED_ALIAS_20261120:%' THEN 'PREFIX_ALIAS'
 WHEN source_description LIKE 'SOURCE_RECONCILED_STEM_20261120:%' THEN 'SCHOOL_STEM'
 ELSE 'PREEXISTING' END AS source_stage,
 count(*) AS most_frequent_checkbox_modes
FROM public.beagu_school_question_modes_supplement_v1
GROUP BY 1,2 ORDER BY 1,2;

SELECT c.relname,c.relrowsecurity AS rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_can_read,
 has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_can_read
FROM pg_class c WHERE c.oid IN (
 'public.beagu_school_question_aggregates_v2'::regclass,
 'public.beagu_school_question_modes_supplement_v1'::regclass
) ORDER BY 1;
