-- STAGING ONLY; NEVER APPLY TO PRODUCTION.
-- This fixture is not part of supabase/migrations and must never be included
-- in the general production migration pipeline.
-- Applied only to Supabase ycwuugggqbunlbwuzvbx for security QA.
CREATE TABLE IF NOT EXISTS public.beagu_level_sessions (
  token_sha256 text PRIMARY KEY CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),
  access_level smallint NOT NULL CHECK(access_level IN (1, 2)),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK(expires_at > created_at),
  identity_campaign text,
  identity_visitor_id uuid
);
ALTER TABLE public.beagu_level_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beagu_level_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.beagu_level_sessions TO service_role;

-- Only a synthetic, permanently expired token hash is inserted.
-- The token is 64 ASCII '0' characters; no member data or account is present.
INSERT INTO public.beagu_level_sessions(token_sha256, access_level, created_at, expires_at)
VALUES (encode(extensions.digest(repeat('0',64), 'sha256'),'hex'),
        1, now()-interval '2 hours', now()-interval '1 hour')
ON CONFLICT(token_sha256) DO UPDATE
SET access_level=1, created_at=now()-interval '2 hours',
    expires_at=now()-interval '1 hour';

-- Diagnostic: returns RLS/grant status and synthetic row count only.
SELECT c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_read,
       has_table_privilege('authenticated',c.oid,'SELECT') AS auth_read,
       has_table_privilege('service_role',c.oid,'SELECT') AS service_read,
       (SELECT count(*) FROM public.beagu_level_sessions) AS fixture_rows
FROM pg_class c WHERE c.oid='public.beagu_level_sessions'::regclass;
