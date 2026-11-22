-- STAGING ONLY, NEVER APPLY TO PRODUCTION.
-- Preflight marker exists only in isolated staging project.
DO $$ BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL THEN
   RAISE EXCEPTION 'STOP: not stage35 isolated Supabase';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.beagu_postit_member_accounts(
 auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 identity_visitor_id uuid NOT NULL UNIQUE,
 author_uid uuid NOT NULL UNIQUE,
 status text NOT NULL CHECK (status IN ('active','suspended')),
 linked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.beagu_postit_member_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beagu_postit_member_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.beagu_postit_member_accounts TO service_role;

CREATE TABLE IF NOT EXISTS stage_private.stage35_auth_once(
 run_id text PRIMARY KEY,
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 outcome text CHECK(outcome IN ('PASS','BLOCKED')),
 cases_passed integer NOT NULL DEFAULT 0
);
ALTER TABLE stage_private.stage35_auth_once ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stage_private.stage35_auth_once FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON stage_private.stage35_auth_once TO service_role;

SELECT
 has_table_privilege('anon','public.beagu_postit_member_accounts','SELECT') AS anon_member_read,
 has_table_privilege('authenticated','public.beagu_postit_member_accounts','SELECT') AS authenticated_member_read,
 has_table_privilege('service_role','public.beagu_postit_member_accounts','INSERT') AS svc_can_seed,
 (SELECT count(*) FROM auth.users) AS auth_users_before;
