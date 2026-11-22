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
ORDER BY path;

-- Empty school tables must not be reported as ready for data-driven E2E.
-- No real school or respondent data are copied into staging by this check.
SELECT 'postit_school_context_data' AS path,
 CASE
   WHEN to_regclass('public.schools') IS NULL
     OR to_regclass('public.beagu_school_report_yearly') IS NULL
     OR to_regclass('public.beagu_lv1_school_sort_index') IS NULL
     THEN 'BLOCKED_MISSING_DEPENDENCIES'
   WHEN NOT EXISTS (SELECT 1 FROM public.schools WHERE status='운영')
     THEN 'BLOCKED_NO_STAGING_SCHOOL_DATA'
   WHEN NOT EXISTS (SELECT 1 FROM public.beagu_lv1_school_sort_index)
     THEN 'BLOCKED_EMPTY_SCHOOL_SORT_VIEW'
   ELSE 'DATA_PRESENT_REQUIRES_E2E'
 END AS readiness;
