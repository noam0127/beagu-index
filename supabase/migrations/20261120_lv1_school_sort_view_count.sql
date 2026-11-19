-- 2026-11-20: Lv.1 and higher can sort by verified school detail view counts.
-- Source totals already exclude repeated views per visitor/day and registered administrators.
-- Keep the public view locked to the service role; access through authenticated Edge API.
-- Existing view columns keep their original order; only view_count is appended.
CREATE OR REPLACE VIEW public.beagu_lv1_school_sort_index
WITH (security_invoker = true)
AS
SELECT s.school_id,
    s.school_name,
    s.sido,
    s.sido_standard,
    s.support_office,
    s.address,
    s.establishment,
    s.school_kind,
    s.status,
        CASE
            WHEN ep.publication_status = 'PUBLISHED'::text AND ep.national_percentile >= 0::numeric AND ep.national_percentile <= 100::numeric THEN ep.national_percentile
            ELSE NULL::numeric
        END AS beagu_percentile_2025,
    ( SELECT f.fact_value
           FROM beagu_school_report_official_facts f
          WHERE f.school_id = s.school_id AND f.fact_key = 'students'::text AND f.review_status = 'APPROVED'::text AND (f.survey_year = ANY (ARRAY[2024, 2025]))
          ORDER BY f.survey_year DESC
         LIMIT 1) AS student_count,
    ( SELECT f.source_year
           FROM beagu_school_report_official_facts f
          WHERE f.school_id = s.school_id AND f.fact_key = 'students'::text AND f.review_status = 'APPROVED'::text AND (f.survey_year = ANY (ARRAY[2024, 2025]))
          ORDER BY f.survey_year DESC
         LIMIT 1) AS student_reference_year,
    ( SELECT f.fact_value
           FROM beagu_school_report_official_facts f
          WHERE f.school_id = s.school_id AND f.fact_key = 'district_housing_price_mean'::text AND f.review_status = 'APPROVED'::text AND f.survey_year = 2025
         LIMIT 1) AS housing_price_won,
    ( SELECT f.fact_value
           FROM beagu_school_report_official_facts f
          WHERE f.school_id = s.school_id AND f.fact_key = 'junior_teacher_ratio'::text AND f.review_status = 'APPROVED'::text AND f.survey_year = 2025 AND f.fact_value >= 0::numeric AND f.fact_value <= 100::numeric
          ORDER BY f.updated_at DESC
         LIMIT 1) AS junior_teacher_ratio,
    ( SELECT f.fact_value
           FROM beagu_school_report_official_facts f
          WHERE f.school_id = s.school_id AND f.fact_key = 'male_teacher_ratio'::text AND f.review_status = 'APPROVED'::text AND f.survey_year = 2025 AND f.fact_value >= 0::numeric AND f.fact_value <= 100::numeric
          ORDER BY f.updated_at DESC
         LIMIT 1) AS male_teacher_ratio,
    COALESCE(svc.views, 0::bigint) AS view_count
   FROM schools s
     LEFT JOIN beagu_2025_empirical_percentiles ep ON ep.school_id = s.school_id AND ep.survey_year = 2025
     LEFT JOIN beagu_school_view_totals svc ON svc.school_id = s.school_id
  WHERE s.status = '운영'::text;

REVOKE ALL ON public.beagu_lv1_school_sort_index FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.beagu_lv1_school_sort_index TO service_role;
