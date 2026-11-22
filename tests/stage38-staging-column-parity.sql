-- Stage38: isolated STAGING metadata-only schema drift audit.
-- EXPECTED_PROJECT_REF: ycwuugggqbunlbwuzvbx
-- NEVER_RUN_ON_PRODUCTION_REF: snvzwrexuqavnfvzgxqj
-- Reference names were observed in production *catalog metadata* (NO ROWS).
-- This is NOT migration SQL, and it grants no privileges or access.
WITH expected(schema_name,table_name,column_name) AS (
  VALUES
    ('public','beagu_2026_results_snapshot','school_response_rows'),
    ('public','beagu_2026_results_snapshot','school_match_status'),
    ('public','beagu_2026_results_snapshot','payload_sha256'),
    ('public','beagu_2026_results_snapshot','source_snapshot_at'),
    ('public','beagu_2026_results_snapshot','approved_by'),
    ('public','beagu_2026_results_snapshot','approval_evidence'),
    ('public','beagu_2026_results_snapshot','approved_payload_sha256'),
    ('public','beagu_2026_results_snapshot','updated_at'),
    ('public','beagu_admin_accounts','granted_at'),
    ('public','beagu_admin_accounts','updated_at'),
    ('public','beagu_metric_catalog','source_ref'),
    ('public','beagu_metric_catalog','options'),
    ('public','beagu_metric_catalog','scoring'),
    ('public','beagu_metric_catalog','verification_evidence'),
    ('public','beagu_release_metrics_v2','id'),
    ('public','beagu_release_metrics_v2','n_valid'),
    ('public','beagu_release_metrics_v2','teacher_count'),
    ('public','beagu_release_metrics_v2','label'),
    ('public','beagu_release_metrics_v2','topic'),
    ('public','beagu_release_metrics_v2','source_ref'),
    ('public','beagu_release_metrics_v2','quality_status'),
    ('public','beagu_release_metrics_v2','payload_sha256')
), present AS (
  SELECT e.schema_name,e.table_name,e.column_name,
    EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid
            JOIN pg_attribute a ON a.attrelid=c.oid
            WHERE n.nspname=e.schema_name AND c.relname=e.table_name
              AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
              AND a.attname=e.column_name) AS exists_in_staging
  FROM expected e
)
SELECT schema_name,table_name,column_name,exists_in_staging,
       CASE WHEN exists_in_staging THEN 'PRESENT_NEEDS_RUNTIME_VERIFICATION'
            ELSE 'BLOCKED_SCHEMA_DRIFT' END AS readiness
FROM present
WHERE to_regnamespace('stage_private') IS NOT NULL
  AND to_regclass('stage_private.fake_schools') IS NOT NULL
ORDER BY table_name,column_name;
