-- STAGING-ONLY qa cleanup after one live perf gateway positive event.
-- This MUST ABORT if any unexpected sample, rate, or global activity is seen.
DO $qa$
DECLARE
  v CONSTANT uuid := 'f0000000-0000-4000-8000-000000000001';
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
      AND c.conname='beagu_2026_results_snapshot_school_id_check'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%'
  ) THEN RAISE EXCEPTION 'ABORT_NOT_ISOLATED_STAGE'; END IF;
  IF (SELECT count(*) FROM beagu_private.beagu_page_perf_samples_v1)<>1
    OR (SELECT count(*) FROM beagu_private.beagu_page_perf_samples_v1
        WHERE page='index' AND operation='navigation'
        AND duration_ms=157 AND succeeded)<>1
    OR (SELECT count(*) FROM beagu_private.beagu_page_perf_rate_v1)<>1
    OR (SELECT count(*) FROM beagu_private.beagu_page_perf_rate_v1
        WHERE visitor_id=v AND page='index' AND operation='navigation')<>1
    OR (SELECT count(*) FROM beagu_private.beagu_perf_global_budget_v1)<>1
    OR (SELECT count(*) FROM beagu_private.beagu_perf_global_budget_v1 WHERE used=2)<>1
  THEN RAISE EXCEPTION 'ABORT_UNEXPECTED_STAGE_PERF_DATA'; END IF;
  DELETE FROM beagu_private.beagu_page_perf_samples_v1
  WHERE page='index' AND operation='navigation'
    AND duration_ms=157 AND succeeded;
  DELETE FROM beagu_private.beagu_page_perf_rate_v1
  WHERE visitor_id=v AND page='index' AND operation='navigation';
  DELETE FROM beagu_private.beagu_perf_global_budget_v1 WHERE used=2;
  IF (SELECT count(*) FROM beagu_private.beagu_page_perf_samples_v1)<>0
  OR (SELECT count(*) FROM beagu_private.beagu_page_perf_rate_v1)<>0
  OR (SELECT count(*) FROM beagu_private.beagu_perf_global_budget_v1)<>0
  THEN RAISE EXCEPTION 'STAGING_PERF_QA_CLEANUP_INCOMPLETE'; END IF;
  RAISE NOTICE 'PASS removed only the one matching synthetic perf sample and counters';
END;
$qa$;