-- Policy-only minimum observation threshold. Privacy review and 2026 delay
-- are separate checks and remain mandatory.
UPDATE public.beagu_publication_year_policy
SET minimum_school_observations=1,updated_at=now()
WHERE effective_from_year IN (2023,2026)
  AND minimum_school_observations>1;
