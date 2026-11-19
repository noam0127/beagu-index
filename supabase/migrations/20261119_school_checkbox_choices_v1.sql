-- 2026-11-19: Lv.1 approved, multi-select closed-choice labels for 2025 Q03/Q04.
-- School/year parent must already be owner-authorized. No respondent rows,
-- timestamps, free-text answers, percentages or raw selection combinations.
CREATE TABLE IF NOT EXISTS public.beagu_school_checkbox_choices_v1 (
 school_id text NOT NULL REFERENCES public.schools(school_id),
 survey_year smallint NOT NULL DEFAULT 2025 CHECK (survey_year=2025),
 question_id text NOT NULL CHECK (question_id IN ('Q03','Q04')),
 selected_options jsonb NOT NULL CHECK (jsonb_typeof(selected_options)='array' AND jsonb_array_length(selected_options) BETWEEN 1 AND 24),
 verified_rows integer NOT NULL CHECK (verified_rows>=1),
 source_rows integer NOT NULL CHECK (source_rows>=verified_rows),
 review_status text NOT NULL CHECK (review_status='SOURCE_VERIFIED_MULTI_SELECTION'),
 source_description text NOT NULL CHECK (length(source_description) BETWEEN 1 AND 160),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (school_id,survey_year,question_id)
);
ALTER TABLE public.beagu_school_checkbox_choices_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beagu_school_checkbox_choices_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.beagu_school_checkbox_choices_v1 TO service_role;
COMMENT ON TABLE public.beagu_school_checkbox_choices_v1 IS
'Verified school-level union of original, closed checkbox options; no counts or raw response combinations are returned to users. Owner-authorized parent aggregate required; source verification does not independently prove individual disclosure consent.';
