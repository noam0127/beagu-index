-- Run after stage35 synthetic 2026 HTTP checks; STAGING ONLY.
DO $$ BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL THEN
  RAISE EXCEPTION 'STAGING ONLY fixture marker missing';
 END IF;
END $$;
DELETE FROM public.beagu_level_sessions WHERE token_sha256 IN (
 encode(extensions.digest(repeat('6',64),'sha256'),'hex'),
 encode(extensions.digest(repeat('7',64),'sha256'),'hex')
);
DELETE FROM public.beagu_release_metrics_v2 WHERE school_id LIKE 'TST____';
DELETE FROM public.beagu_2026_results_snapshot WHERE school_id LIKE 'TST____';
DELETE FROM public.beagu_metric_catalog WHERE survey_year=2026 AND question_id='percentile';
SELECT (SELECT count(*) FROM public.beagu_level_sessions WHERE token_sha256 IN (
 encode(extensions.digest(repeat('6',64),'sha256'),'hex'),
 encode(extensions.digest(repeat('7',64),'sha256'),'hex')) AS remaining_qa_sessions,
 (SELECT count(*) FROM public.beagu_release_metrics_v2) AS remaining_qa_metrics,
 (SELECT count(*) FROM public.beagu_2026_results_snapshot) AS remaining_qa_snapshots;
