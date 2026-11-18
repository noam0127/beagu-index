-- One row per school/year; historical closed-choice aggregates only.
-- No respondent rows, names, timestamps, or free text are imported.
CREATE TABLE IF NOT EXISTS public.beagu_school_question_aggregates_v2 (
  school_id text NOT NULL CHECK (school_id ~ '^[0-9]{7}$'),
  survey_year smallint NOT NULL CHECK (survey_year IN (2023,2024,2025)),
  questions jsonb NOT NULL CHECK (jsonb_typeof(questions)='array'),
  source_rows integer NOT NULL CHECK (source_rows >= 1),
  source_description text NOT NULL,
  review_status text NOT NULL CHECK (review_status='OWNER_AUTHORIZED_CLOSED_CHOICE'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(school_id,survey_year)
);
ALTER TABLE public.beagu_school_question_aggregates_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beagu_school_question_aggregates_v2 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.beagu_school_question_aggregates_v2 TO service_role;
COMMENT ON TABLE public.beagu_school_question_aggregates_v2 IS
  'Historical school closed-choice distributions, owner-authorized with N >= 1, exact school match; backend only. No direct anon/authenticated access and no raw respondent rows.';
