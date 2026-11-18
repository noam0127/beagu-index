-- Source-verified unique most-selected option for 2025 checkbox questions.
-- No raw row, option percentages, distributions, respondent identifiers or free text.
-- Only cases with an unambiguous unique mode and all source tokens matched to
-- original observed closed-choice labels are eligible.
CREATE TABLE IF NOT EXISTS public.beagu_school_question_modes_supplement_v1 (
  school_id text NOT NULL REFERENCES public.schools(school_id),
  survey_year smallint NOT NULL CHECK (survey_year = 2025),
  question_id text NOT NULL CHECK (question_id IN ('Q03','Q04','Q30')),
  mode_option text NOT NULL CHECK (length(mode_option) BETWEEN 1 AND 180),
  valid_rows integer NOT NULL CHECK (valid_rows >= 1),
  review_status text NOT NULL CHECK (review_status = 'SOURCE_VERIFIED_UNIQUE_MODE'),
  source_description text NOT NULL CHECK (length(source_description) BETWEEN 1 AND 160),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id,survey_year,question_id)
);
ALTER TABLE public.beagu_school_question_modes_supplement_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beagu_school_question_modes_supplement_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.beagu_school_question_modes_supplement_v1 TO service_role;
COMMENT ON TABLE public.beagu_school_question_modes_supplement_v1 IS
 'Server-only source-verified unique mode for checked 2025 checkbox questions; counts internal, no distribution returned. Source validation does not independently establish respondent consent.';
