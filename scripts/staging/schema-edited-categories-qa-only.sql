-- QA-only, empty schema restore. DO NOT RUN on production.
-- Target project: ycwuugggqbunlbwuzvbx (test Supabase).
-- Structure based solely on production information_schema/constraint metadata;
-- no production records, grants, RLS policies, or secrets are copied.
CREATE TABLE IF NOT EXISTS public.beagu_school_report_official_categories (
  school_id text NOT NULL REFERENCES public.schools(school_id),
  survey_year smallint NOT NULL CHECK (survey_year IN (2024, 2025)),
  fact_key text NOT NULL CHECK (
    fact_key IN ('establishment_type', 'meal_place', 'milk_lunch')
  ),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  fact_value text NOT NULL,
  reference_year smallint NOT NULL CHECK (reference_year BETWEEN 2023 AND 2025),
  source_ref text NOT NULL,
  review_status text NOT NULL DEFAULT 'PENDING'
    CHECK (review_status IN ('PENDING', 'APPROVED', 'WITHHELD')),
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beagu_stage_official_categories_pkey
    PRIMARY KEY (school_id, survey_year, fact_key),
  CONSTRAINT beagu_stage_official_categories_allowed_value CHECK (
    (fact_key = 'establishment_type' AND fact_value IN ('국립', '공립', '사립'))
    OR (fact_key = 'meal_place' AND fact_value IN ('식당', '교실', '식당+교실'))
    OR (fact_key = 'milk_lunch' AND fact_value IN ('O', 'X'))
  ),
  CONSTRAINT beagu_stage_category_release_review CHECK (
    review_status <> 'APPROVED' OR reviewed_at IS NOT NULL
  )
);
ALTER TABLE public.beagu_school_report_official_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beagu_school_report_official_categories
  FROM PUBLIC, anon, authenticated;
