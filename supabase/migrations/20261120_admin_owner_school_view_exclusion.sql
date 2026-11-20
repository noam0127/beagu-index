-- Fix owner/admin school-view exclusion to use the authoritative admin
-- authorization table. Previously the view RPC only checked legacy Auth
-- app_metadata and private browser digests, even though owners are provisioned
-- in public.beagu_admin_accounts. No visitor IDs or email addresses are stored.
--
-- Apply only the exact reviewed fragment; fail closed if the live definition
-- has drifted. Idempotent for environments where this repair was already run.
DO $migration$
DECLARE
  v_definition text;
  v_old text := $old$SELECT 1 FROM auth.users AS u WHERE u.id = v_auth_id
        AND (u.raw_app_meta_data->>'role' = 'admin'
          OR u.raw_app_meta_data->>'is_admin' = 'true')$old$;
  v_new text := $new$SELECT 1 FROM public.beagu_admin_accounts AS a
      WHERE a.user_id = v_auth_id AND a.enabled IS TRUE$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.beagu_record_school_view(text,uuid,uuid)'::regprocedure
  ) INTO v_definition;
  IF position(v_new IN v_definition) > 0 THEN
    RAISE NOTICE 'Owner school-view exclusion already updated';
  ELSIF position(v_old IN v_definition) > 0 THEN
    EXECUTE replace(v_definition, v_old, v_new);
  ELSE
    RAISE EXCEPTION 'Unexpected school-view function definition; inspect before changing';
  END IF;
END
$migration$;
