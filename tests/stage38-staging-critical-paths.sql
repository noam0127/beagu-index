-- Stage38 isolated staging only: ycwuugggqbunlbwuzvbx
-- Never run against production ref snvzwrexuqavnfvzgxqj.
-- Metadata-only critical-path preflight; no application rows, auth, writes or DDL.
-- BLOCKED means a required catalog dependency is missing.
-- METADATA_PRESENT_REQUIRES_E2E is NOT a test or release approval.
WITH required(path,kind,object_name) AS (
  VALUES
    ('participation_code_login','rpc','beagu_consume_login_budget'),
    ('participation_code_login','table','beagu_level_codes'),
    ('participation_code_login','table','beagu_level_sessions'),
    ('challenge_code_login','rpc','beagu_consume_login_budget'),
    ('challenge_code_login','rpc','beagu_earned_challenge_visitor'),
    ('challenge_code_login','table','beagu_level_sessions'),
    ('postit_link_member','rpc','beagu_postit_bind_verified_member'),
    ('postit_link_member','table','beagu_postit_member_accounts'),
    ('postit_link_member','table','beagu_level_sessions'),
    ('postit_school_context','table','schools'),
    ('postit_school_context','table','beagu_lv1_school_sort_index'),
    ('postit_school_context','table','beagu_school_report_yearly'),
    ('admin_member_list','rpc','beagu_admin_active_mfa_session'),
    ('admin_member_list','rpc','beagu_admin_member_sms_status_v1'),
    ('admin_member_list','table','beagu_admin_accounts'),
    ('admin_member_moderation','rpc','beagu_admin_active_mfa_session'),
    ('admin_member_moderation','table','beagu_admin_audit_events'),
    ('admin_member_moderation','table','beagu_admin_accounts')
), presence AS (
  SELECT r.path,r.kind,r.object_name,
    CASE WHEN r.kind='table' THEN EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
      WHERE n.nspname='public' AND c.relname=r.object_name AND c.relkind IN ('r','p','v','m')
    ) WHEN r.kind='rpc' THEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
      WHERE n.nspname='public' AND p.proname=r.object_name
    ) ELSE false END AS present
  FROM required r
), results AS (
  SELECT path,COUNT(*)::integer AS required_count,
    COUNT(*) FILTER (WHERE present)::integer AS present_count,
    COALESCE(jsonb_agg(kind||':'||object_name ORDER BY kind,object_name)
      FILTER (WHERE NOT present),'[]'::jsonb) AS missing_dependencies,
    bool_and(present) AS all_present
  FROM presence GROUP BY path
)
SELECT path,required_count,present_count,missing_dependencies,
  CASE WHEN all_present THEN 'METADATA_PRESENT_REQUIRES_E2E'
       ELSE 'BLOCKED_MISSING_DEPENDENCIES' END AS readiness
FROM results
WHERE to_regnamespace('stage_private') IS NOT NULL
  AND to_regclass('stage_private.fake_schools') IS NOT NULL
ORDER BY path;
