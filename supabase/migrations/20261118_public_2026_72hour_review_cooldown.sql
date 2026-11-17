-- 2026 school results must never appear during the first 72 hours after
-- a verified manual release or any subsequent update. The release event is
-- downstream of submission, so this imposes a conservative >=3 day delay.
-- School-level privacy approval and n>=5 checks remain unchanged.
ALTER POLICY "Lv0 manually released annual percentiles only"
ON public.beagu_school_report_yearly
USING (
  publication_status = 'PUBLISHED'
  AND privacy_reviewed IS TRUE
  AND (
    (survey_year BETWEEN 2023 AND 2025)
    OR (
      survey_year = 2026
      AND valid_observation_count >= 5
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
