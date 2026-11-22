-- STAGING ONLY cleanup for stage35 public performance flood checks.
-- This retains only the reusable isolated schema and server-side guard.
-- No public-site usage or production data exists in these newly created tables.
DO $$
DECLARE n_samples bigint; n_rate bigint; n_budget bigint;
BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL THEN
  RAISE EXCEPTION 'STOP: not isolated staging database';
 END IF;
 SELECT count(*) INTO n_samples FROM beagu_private.beagu_page_perf_samples_v1;
 SELECT count(*) INTO n_rate FROM beagu_private.beagu_page_perf_rate_v1;
 SELECT count(*) INTO n_budget FROM beagu_private.beagu_perf_global_budget_v1;
 IF n_samples>100 OR n_rate>100 OR n_budget>4 THEN
  RAISE EXCEPTION 'STOP: unexpected volume of telemetry. Manual review required';
 END IF;
 DELETE FROM beagu_private.beagu_page_perf_samples_v1;
 DELETE FROM beagu_private.beagu_page_perf_rate_v1;
 DELETE FROM beagu_private.beagu_perf_global_budget_v1;
END $$;
SELECT (SELECT count(*) FROM beagu_private.beagu_page_perf_samples_v1) AS sample_rows,
       (SELECT count(*) FROM beagu_private.beagu_page_perf_rate_v1) AS rate_rows,
       (SELECT count(*) FROM beagu_private.beagu_perf_global_budget_v1) AS budget_rows;
