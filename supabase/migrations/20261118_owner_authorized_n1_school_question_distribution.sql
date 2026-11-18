-- Owner-authorized, verified closed-choice school summaries may include 1 response.
-- This does not authorize free-text responses, personal identifiers, raw
-- respondent records, or unverified school-name matches.
ALTER TABLE public.beagu_verified_school_question_distributions_v1
  DROP CONSTRAINT IF EXISTS beagu_verified_school_question_distributions__survey_year_check;
ALTER TABLE public.beagu_verified_school_question_distributions_v1
  ADD CONSTRAINT beagu_verified_school_question_distributions__survey_year_check
  CHECK (survey_year IN (2023,2024,2025));
ALTER TABLE public.beagu_verified_school_question_distributions_v1
  DROP CONSTRAINT IF EXISTS beagu_verified_school_question_distri_valid_response_rows_check;
ALTER TABLE public.beagu_verified_school_question_distributions_v1
  ADD CONSTRAINT beagu_verified_school_question_distri_valid_response_rows_check
  CHECK (valid_response_rows >= 1);
ALTER TABLE public.beagu_verified_school_question_distributions_v1
  DROP CONSTRAINT IF EXISTS beagu_verified_school_question_distribution_review_policy_check;
ALTER TABLE public.beagu_verified_school_question_distributions_v1
  ADD CONSTRAINT beagu_verified_school_question_distribution_review_policy_check
  CHECK (review_policy IN ('N10_CELL3_PATTERNS5_STRICT_MATCH','N1_OWNER_AUTHORIZED_EXACT_SCHOOL_CLOSED_CHOICE'));
COMMENT ON TABLE public.beagu_verified_school_question_distributions_v1 IS
 'Server-only reviewed school question closed-choice aggregates. Supports 1+ responses on owner authorization and exact unique school match; never free text or raw records. Counts remain private. RLS enforced.';
