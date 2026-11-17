-- Source-checked school lookup and historical comparison services for signed LV.1 only.
-- Never grant public/anon/authenticated SELECT on these views or the comparison table.

CREATE OR REPLACE VIEW public.beagu_lv1_school_sort_index
WITH (security_invoker=true) AS
SELECT s.school_id,s.school_name,s.sido,s.sido_standard,s.support_office,
 s.address,s.establishment,s.school_kind,s.status,
 CASE WHEN ep.publication_status='PUBLISHED' AND ep.national_percentile BETWEEN 0 AND 100
      THEN ep.national_percentile ELSE NULL END AS beagu_percentile_2025,
 (SELECT f.fact_value FROM public.beagu_school_report_official_facts f
  WHERE f.school_id=s.school_id AND f.fact_key='students' AND f.review_status='APPROVED'
    AND f.survey_year IN(2024,2025) ORDER BY f.survey_year DESC LIMIT 1) AS student_count,
 (SELECT f.source_year FROM public.beagu_school_report_official_facts f
  WHERE f.school_id=s.school_id AND f.fact_key='students' AND f.review_status='APPROVED'
    AND f.survey_year IN(2024,2025) ORDER BY f.survey_year DESC LIMIT 1) AS student_reference_year,
 (SELECT f.fact_value FROM public.beagu_school_report_official_facts f
  WHERE f.school_id=s.school_id AND f.fact_key='district_housing_price_mean'
    AND f.review_status='APPROVED' AND f.survey_year=2025 LIMIT 1) AS housing_price_won
FROM public.schools s
LEFT JOIN public.beagu_2025_empirical_percentiles ep
 ON ep.school_id=s.school_id AND ep.survey_year=2025
WHERE s.status='운영';
REVOKE ALL ON TABLE public.beagu_lv1_school_sort_index FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.beagu_lv1_school_sort_index TO service_role;

CREATE OR REPLACE VIEW public.beagu_lv1_office_directory
WITH (security_invoker=true) AS
SELECT DISTINCT sido_standard,support_office
FROM public.schools
WHERE status='운영' AND sido_standard IS NOT NULL AND support_office IS NOT NULL;
REVOKE ALL ON TABLE public.beagu_lv1_office_directory FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.beagu_lv1_office_directory TO service_role;

CREATE TABLE IF NOT EXISTS public.beagu_survey_geography_comparisons_v1(
 survey_year smallint NOT NULL CHECK(survey_year BETWEEN 2023 AND 2025),
 question_id text NOT NULL CHECK(question_id ~ '^Q[0-9]{2}$'),
 scope text NOT NULL CHECK(scope IN('national','regional')),
 region text NOT NULL DEFAULT '' CHECK(length(region)<=24),
 mode_option text CHECK(mode_option IS NULL OR length(mode_option)<=130),
 mean_option text CHECK(mean_option IS NULL OR length(mean_option)<=130),
 comparison_kind text NOT NULL CHECK(comparison_kind IN('ordinal_mean','most_frequent')),
 source_book text NOT NULL CHECK(length(source_book)<=90),
 method_note text NOT NULL CHECK(length(method_note)<=220),
 review_status text NOT NULL DEFAULT 'SOURCE_CHECKED' CHECK(review_status='SOURCE_CHECKED'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(survey_year,question_id,scope,region),
 CHECK((scope='national' AND region='') OR(scope='regional' AND region<>''))
);
ALTER TABLE public.beagu_survey_geography_comparisons_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beagu_survey_geography_comparisons_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.beagu_survey_geography_comparisons_v1 TO service_role;

-- The aggregated source rows are populated separately from verified owner data.
-- This migration does not copy any raw respondent record into public-accessible storage.
