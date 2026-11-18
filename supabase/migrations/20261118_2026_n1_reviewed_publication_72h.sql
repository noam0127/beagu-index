-- Align 2026 school publication with the existing one-observation threshold.
-- This changes minimum observation count only, not permission to skip privacy review.
-- The anonymous Data API still requires manual approval, vetted source, and 72h delay.

ALTER TABLE public.beagu_school_report_yearly
  DROP CONSTRAINT IF EXISTS report_2026_requires_manual_privacy_review;

ALTER TABLE public.beagu_school_report_yearly
  ADD CONSTRAINT report_2026_requires_manual_privacy_review
  CHECK (
    survey_year <> 2026 OR publication_status <> 'PUBLISHED' OR (
      privacy_reviewed = true
      AND valid_observation_count >= 1
      AND unique_respondents_reviewed
      AND school_identity_reviewed
      AND small_cell_reviewed
      AND differencing_reviewed
      AND manual_release_approved
      AND length(btrim(manual_release_by)) >= 2
      AND manual_release_at IS NOT NULL
      AND length(btrim(release_evidence)) >= 12
      AND source_status = 'VETTED_2026_RELEASE'
      AND source_version <> 'unassigned'
    )
  );

ALTER POLICY "Lv0 manually released annual percentiles only"
  ON public.beagu_school_report_yearly
  USING (
    publication_status = 'PUBLISHED'
    AND privacy_reviewed IS TRUE
    AND (
      (survey_year BETWEEN 2023 AND 2025)
      OR (
        survey_year = 2026
        AND valid_observation_count >= 1
        AND unique_respondents_reviewed IS TRUE
        AND school_identity_reviewed IS TRUE
        AND small_cell_reviewed IS TRUE
        AND differencing_reviewed IS TRUE
        AND manual_release_approved IS TRUE
        AND manual_release_at IS NOT NULL
        AND manual_release_by IS NOT NULL
        AND release_evidence IS NOT NULL
        AND source_status = 'VETTED_2026_RELEASE'
        AND manual_release_at <= now() - interval '72 hours'
        AND updated_at <= now() - interval '72 hours'
      )
    )
  );
