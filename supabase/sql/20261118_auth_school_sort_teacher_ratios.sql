-- Applied to baegu-index Supabase on 2026-11-18.
-- Consolidated Lv.1/Lv.2 authenticated regional search: sort by 2nd-class
-- teacher and male teacher ratios (2024 source year, approved 2025 data).
-- Replaces the existing view in place; preserves existing column order,
-- grants and security_invoker, and appends two approved numeric columns.
-- Never grant anon/authenticated SELECT on this view. Edge Function service
-- role enforces the Beagu session access level before serving results.

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
         LIMIT 1) AS male_teacher_ratio
   FROM schools s
     LEFT JOIN beagu_2025_empirical_percentiles ep ON ep.school_id = s.school_id AND ep.survey_year = 2025
  WHERE s.status = '운영'::text;
