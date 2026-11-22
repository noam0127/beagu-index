#!/usr/bin/env bash
# Synthetic, ephemeral PostgreSQL only. NEVER target Supabase or a user DB.
set -euo pipefail

if [[ "$STAGE38_PG_FIXTURE_ONLY" != "ephemeral-ci" ||
      "$PGHOST" != "127.0.0.1" ||
      "$PGPORT" != "5432" ||
      "$PGDATABASE" != "postgres" ||
      "$PGUSER" != "postgres" ]]; then
  echo "STAGE38_LOCAL_POSTGRES_ONLY" >&2
  exit 2
fi

test -f docs/releases/templates/stage38-staging-login-foundation.sql
psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO service_role;
CREATE SCHEMA stage_private;
CREATE TABLE stage_private.fake_schools(id bigint);
CREATE TABLE stage_private.members(id uuid);
CREATE TABLE public.beagu_level_sessions(token_sha256 text PRIMARY KEY);
SQL

# Accidental production/incorrect target must fail without creating anything.
if psql -v ON_ERROR_STOP=1 -f docs/releases/templates/stage38-staging-login-foundation.sql \
    > /tmp/stage38-unapproved-ddl.stdout 2>&1; then
  echo "INVALID: staging SQL ran without an explicit guard" >&2
  exit 1
fi
grep -q "STAGE38_STAGING_ONLY_TARGET_GUARD_FAILED" \
  /tmp/stage38-unapproved-ddl.stdout
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $validation$
BEGIN
  IF to_regclass('public.beagu_level_codes') IS NOT NULL
     OR to_regclass('public.beagu_login_budget') IS NOT NULL
  THEN RAISE EXCEPTION 'Unapproved attempt created tables';
  END IF;
END;
$validation$;
SQL

# Only a separate authorized CI fixture session supplies this marker.
psql -v ON_ERROR_STOP=1 <<'SQL'
SET app.stage38_approved_target_ref = 'ycwuugggqbunlbwuzvbx';
\i docs/releases/templates/stage38-staging-login-foundation.sql

DO $validation$
BEGIN
  IF NOT (SELECT relrowsecurity
          FROM pg_class WHERE oid='public.beagu_level_codes'::regclass)
     OR NOT (SELECT relrowsecurity
             FROM pg_class WHERE oid='public.beagu_login_budget'::regclass)
  THEN RAISE EXCEPTION 'RLS must be active on both tables';
  END IF;
  IF has_table_privilege('anon', 'public.beagu_level_codes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.beagu_level_codes', 'SELECT')
     OR has_function_privilege('anon', 'public.beagu_consume_login_budget()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.beagu_consume_login_budget()', 'EXECUTE')
  THEN RAISE EXCEPTION 'Client has forbidden direct access';
  END IF;
  IF NOT has_function_privilege('service_role',
          'public.beagu_consume_login_budget()', 'EXECUTE')
     OR NOT has_table_privilege('service_role',
          'public.beagu_login_budget', 'UPDATE')
     OR NOT has_table_privilege('service_role',
          'public.beagu_level_codes', 'SELECT')
  THEN RAISE EXCEPTION 'Service role has insufficient privileges';
  END IF;
  IF (SELECT COUNT(*) FROM public.beagu_level_codes) <> 0
  THEN RAISE EXCEPTION 'Template seeded a participation code';
  END IF;
END;
$validation$;

SET ROLE service_role;
DO $validation$
DECLARE n integer;
BEGIN
  FOR n IN 1..60 LOOP
    IF public.beagu_consume_login_budget() IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'Allowed request denied at number %',n;
    END IF;
  END LOOP;
  IF public.beagu_consume_login_budget() IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'Request was not denied above 60/min';
  END IF;
END;
$validation$;
RESET ROLE;

DO $validation$
BEGIN
  IF (SELECT COUNT(*) FROM public.beagu_login_budget WHERE attempts=60) <> 1
  THEN RAISE EXCEPTION 'Unexpected rate budget state';
  END IF;
END;
$validation$;
SQL

echo "PASS: ephemeral PostgreSQL executes Stage38 staging-only schema; bad target fails, RLS/grants deny clients, empty code table, 60/minute limit enforced."
