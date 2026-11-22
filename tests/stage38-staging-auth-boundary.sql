-- Stage 38: isolated staging authentication boundary regression.
-- Run only on Supabase project ycwuugggqbunlbwuzvbx.
-- This query reads PostgreSQL catalogs only; no user records or mutations.
WITH protected(table_name) AS (
  VALUES ('beagu_admin_accounts'), ('beagu_level_codes'),
         ('beagu_level_sessions'), ('beagu_postit_member_accounts')
), inspected AS (
 SELECT x.table_name,c.oid AS table_oid,c.relrowsecurity AS rls_enabled,
        (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_count,
        CASE WHEN c.oid IS NULL THEN NULL ELSE has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') END AS anon_any_dml,
        CASE WHEN c.oid IS NULL THEN NULL ELSE has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') END AS authenticated_any_dml
 FROM protected x LEFT JOIN pg_class c ON c.relname=x.table_name
   AND c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')
)
SELECT table_name,rls_enabled,policy_count,anon_any_dml,authenticated_any_dml,
 CASE WHEN table_oid IS NULL THEN 'FAIL_MISSING_TABLE'
      WHEN NOT rls_enabled THEN 'FAIL_RLS_DISABLED'
      WHEN policy_count <> 0 THEN 'REVIEW_POLICY_CHANGE'
      WHEN anon_any_dml OR authenticated_any_dml THEN 'REVIEW_DIRECT_GRANTS'
      ELSE 'PASS_DENY_BY_DEFAULT' END AS result
FROM inspected ORDER BY table_name;
