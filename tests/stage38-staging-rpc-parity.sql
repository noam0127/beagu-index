-- 38단계: STAGING ONLY  ycwuugggqbunlbwuzvbx
-- PRODUCTION NEVER EXECUTE: snvzwrexuqavnfvzgxqj
-- Read-only PostgreSQL catalog introspection: no application data read.
-- Production metadata below is a reviewed signature reference, not a migration.
-- WARNING: SECURITY DEFINER mismatches require human review. NEVER auto-copy
-- privileged function bodies or GRANT permissions into staging.
WITH expected(component, function_name, expected_arguments, expected_return, expected_security_definer) AS (
  VALUES
    ('level-api', 'beagu_2026_lv2_released_question_results', 'p_school_id text', 'jsonb', true),
    ('level-api', 'beagu_2026_released_question_results', 'p_school_id text', 'jsonb', true),
    ('admin-members', 'beagu_admin_active_mfa_session', 'p_user uuid, p_session uuid', 'boolean', true),
    ('admin-members', 'beagu_admin_member_sms_status_v1', 'p_ids uuid[]', 'TABLE(user_id uuid, sms_consent boolean, phone_verified boolean, consented_at timestamp with time zone, withdrawn_at timestamp with time zone)', true),
    ('level-api', 'beagu_consume_login_budget', '', 'boolean', false),
    ('level-api', 'beagu_earned_challenge_visitor', 'p_code text', 'uuid', true),
    ('level-postit-shared', 'beagu_has_earned_challenge_visitor', 'p_visitor uuid', 'boolean', true),
    ('postit-api', 'beagu_postit_bind_verified_member', 'p_user uuid, p_visitor uuid, p_device_hash text, p_actor uuid', 'uuid', true),
    ('postit-api', 'beagu_postit_create_comment_v2', 'p_actor uuid, p_request_id uuid, p_post_id uuid, p_body text', 'jsonb', false),
    ('postit-api', 'beagu_postit_create_post_v2', 'p_actor uuid, p_request_id uuid, p_subject_type text, p_school_id text, p_game_slug text, p_comparison_selection text, p_body text', 'jsonb', false)
), observed AS (
  SELECT e.*,
         (SELECT COUNT(*)::integer FROM pg_proc p
          JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname=e.function_name) AS name_overloads,
         (
           SELECT p.oid FROM pg_proc p
           JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public'
             AND p.proname=e.function_name
             AND pg_get_function_identity_arguments(p.oid)=e.expected_arguments
           LIMIT 1
         ) AS exact_oid
  FROM expected e
)
SELECT component,function_name,expected_arguments,expected_return,
       expected_security_definer,
       name_overloads,
       exact_oid IS NOT NULL AS signature_present,
       pg_get_function_result(exact_oid) AS observed_return,
       CASE WHEN exact_oid IS NULL THEN NULL ELSE
            (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=exact_oid) END
         AS observed_security_definer,
       CASE WHEN exact_oid IS NULL THEN NULL
         ELSE has_function_privilege('anon',exact_oid,'EXECUTE')
       END AS anon_execute,
       CASE WHEN exact_oid IS NULL THEN NULL
         ELSE has_function_privilege('authenticated',exact_oid,'EXECUTE')
       END AS authenticated_execute,
       CASE
         WHEN name_overloads=0 THEN 'BLOCKED_MISSING_NAME'
         WHEN exact_oid IS NULL THEN 'BLOCKED_SIGNATURE_MISMATCH'
         WHEN pg_get_function_result(exact_oid)<>expected_return THEN 'BLOCKED_RETURN_MISMATCH'
         WHEN (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=exact_oid)
              IS DISTINCT FROM expected_security_definer
              THEN 'REVIEW_SECURITY_MODE_DIFFERENCE'
         ELSE 'PRESENT_SIGNATURE_PARITY'
       END AS readiness
FROM observed
WHERE to_regnamespace('stage_private') IS NOT NULL
  AND to_regclass('stage_private.fake_schools') IS NOT NULL
ORDER BY component,function_name;
