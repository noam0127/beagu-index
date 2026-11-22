-- Stage38: read-only dependency inventory for isolated STAGING project only.
-- EXPECTED PROJECT REF: ycwuugggqbunlbwuzvbx
-- NEVER execute on production ref snvzwrexuqavnfvzgxqj.
-- No user rows, Auth records or credentials are read by this query.
-- No GRANT, CREATE, UPDATE, DML, migration, RLS changes or API invocations.
-- This checks presence only, NOT argument signatures, grants, behavior or E2E.
WITH required(component, object_type, object_name) AS (
  VALUES
    ('level-api','table','beagu_level_sessions'),
    ('level-api','table','beagu_postit_member_accounts'),
    ('level-api','table','beagu_level_codes'),
    ('level-api','table','beagu_release_metrics_v2'),
    ('level-api','table','beagu_metric_catalog'),
    ('level-api','table','beagu_2026_results_snapshot'),
    ('level-api','table','beagu_survey_geography_comparisons_v1'),
    ('level-api','table','beagu_lv1_office_directory'),
    ('level-api','table','beagu_level_data'),
    ('level-api','table','beagu_school_report_official_facts'),
    ('level-api','table','beagu_school_report_official_categories'),
    ('level-api','table','schools'),
    ('level-api','table','beagu_official_numeric_comparisons'),
    ('level-api','table','beagu_official_category_comparisons'),
    ('level-api','table','beagu_2025_domain_comparisons_v1'),
    ('level-api','table','beagu_verified_school_question_distributions_v1'),
    ('level-api','table','beagu_school_question_aggregates_v2'),
    ('level-api','table','beagu_school_question_modes_supplement_v1'),
    ('level-api','table','beagu_school_checkbox_choices_v1'),
    ('postit-api','table','beagu_postit_settings'),
    ('postit-api','table','beagu_lv1_school_sort_index'),
    ('postit-api','table','beagu_school_report_yearly'),
    ('postit-api','table','beagu_postit_reactions'),
    ('postit-api','table','beagu_postit_comments'),
    ('postit-api','table','beagu_postit_posts'),
    ('admin-members','table','beagu_admin_accounts'),
    ('admin-members','table','beagu_admin_audit_events'),
    ('level-api','rpc','beagu_has_earned_challenge_visitor'),
    ('level-api','rpc','beagu_consume_login_budget'),
    ('level-api','rpc','beagu_earned_challenge_visitor'),
    ('level-api','rpc','beagu_2026_lv2_released_question_results'),
    ('level-api','rpc','beagu_2026_released_question_results'),
    ('postit-api','rpc','beagu_has_earned_challenge_visitor'),
    ('postit-api','rpc','beagu_postit_bind_verified_member'),
    ('postit-api','rpc','beagu_postit_create_post_v2'),
    ('postit-api','rpc','beagu_postit_create_comment_v2'),
    ('admin-members','rpc','beagu_admin_active_mfa_session'),
    ('admin-members','rpc','beagu_admin_member_sms_status_v1')
), presence AS (
  SELECT r.component, r.object_type, r.object_name,
    CASE
      WHEN r.object_type = 'table' THEN
        EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = r.object_name
            AND c.relkind IN ('r','v','m','p')
        )
      WHEN r.object_type = 'rpc' THEN
        EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = r.object_name
        )
      ELSE false
    END AS present
  FROM required r
)
SELECT component, object_type, object_name, present,
       CASE WHEN present THEN 'PRESENT' ELSE 'BLOCKED_MISSING' END AS check_status
FROM presence
ORDER BY component, object_type, object_name;
