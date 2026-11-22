-- Stage38 staging only: source-derived read-model dependencies, no production data.
CREATE TABLE IF NOT EXISTS public.beagu_2025_empirical_percentiles (
 school_id text NOT NULL REFERENCES public.schools(school_id),survey_year smallint NOT NULL DEFAULT 2025,
 national_percentile numeric NOT NULL CHECK(national_percentile BETWEEN 0 AND 100),
 reference_school_count integer NOT NULL CHECK(reference_school_count>=0),
 calculation_method text NOT NULL DEFAULT 'PERCENT_RANK_2025_8_DOMAIN_MEAN',
 source_status text NOT NULL DEFAULT 'VETTED_LEGACY_2025',
 publication_status text NOT NULL DEFAULT 'PUBLISHED',updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id,survey_year)
);
CREATE TABLE IF NOT EXISTS public.beagu_school_report_official_facts (
 school_id text NOT NULL REFERENCES public.schools(school_id),survey_year smallint NOT NULL,
 fact_key text NOT NULL,label text NOT NULL,fact_value numeric NOT NULL,
 unit text NOT NULL DEFAULT '',source_ref text NOT NULL,review_status text NOT NULL DEFAULT 'PENDING',
 source_year smallint NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id,survey_year,fact_key)
);
CREATE TABLE IF NOT EXISTS public.beagu_school_view_totals (
 school_id text PRIMARY KEY REFERENCES public.schools(school_id),views bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.beagu_2025_empirical_percentiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_school_report_official_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_school_view_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beagu_2025_empirical_percentiles,public.beagu_school_report_official_facts,public.beagu_school_view_totals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.beagu_2025_empirical_percentiles,public.beagu_school_report_official_facts,public.beagu_school_view_totals TO service_role;
-- Actual production view definition from 20261120_lv1_school_sort_view_count.sql.
CREATE OR REPLACE VIEW public.beagu_lv1_school_sort_index WITH (security_invoker=true) AS
SELECT s.school_id,s.school_name,s.sido,s.sido_standard,s.support_office,s.address,
 s.establishment,s.school_kind,s.status,
 CASE WHEN ep.publication_status='PUBLISHED' AND ep.national_percentile BETWEEN 0 AND 100
 THEN ep.national_percentile ELSE NULL::numeric END AS beagu_percentile_2025,
 (SELECT f.fact_value FROM public.beagu_school_report_official_facts f WHERE f.school_id=s.school_id
 AND f.fact_key='students' AND f.review_status='APPROVED' AND f.survey_year IN (2024,2025)
 ORDER BY f.survey_year DESC LIMIT 1) AS student_count,
 (SELECT f.source_year FROM public.beagu_school_report_official_facts f WHERE f.school_id=s.school_id
 AND f.fact_key='students' AND f.review_status='APPROVED' AND f.survey_year IN (2024,2025)
 ORDER BY f.survey_year DESC LIMIT 1) AS student_reference_year,
 (SELECT f.fact_value FROM public.beagu_school_report_official_facts f WHERE f.school_id=s.school_id
 AND f.fact_key='district_housing_price_mean' AND f.review_status='APPROVED' AND f.survey_year=2025 LIMIT 1) AS housing_price_won,
 (SELECT f.fact_value FROM public.beagu_school_report_official_facts f WHERE f.school_id=s.school_id
 AND f.fact_key='junior_teacher_ratio' AND f.review_status='APPROVED' AND f.survey_year=2025
 AND f.fact_value BETWEEN 0 AND 100 ORDER BY f.updated_at DESC LIMIT 1) AS junior_teacher_ratio,
 (SELECT f.fact_value FROM public.beagu_school_report_official_facts f WHERE f.school_id=s.school_id
 AND f.fact_key='male_teacher_ratio' AND f.review_status='APPROVED' AND f.survey_year=2025
 AND f.fact_value BETWEEN 0 AND 100 ORDER BY f.updated_at DESC LIMIT 1) AS male_teacher_ratio,
 COALESCE(svc.views,0::bigint) AS view_count
FROM public.schools s
LEFT JOIN public.beagu_2025_empirical_percentiles ep ON ep.school_id=s.school_id AND ep.survey_year=2025
LEFT JOIN public.beagu_school_view_totals svc ON svc.school_id=s.school_id
WHERE s.status='운영';
REVOKE ALL ON public.beagu_lv1_school_sort_index FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.beagu_lv1_school_sort_index TO service_role;
