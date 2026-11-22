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
-- Match the isolated staging session columns and constraints exactly.
CREATE TABLE public.beagu_level_sessions (
  token_sha256 text PRIMARY KEY CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  access_level smallint NOT NULL CHECK (access_level IN (1,2)),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  identity_campaign text,
  identity_visitor_id uuid,
  CHECK (expires_at > created_at)
);
ALTER TABLE public.beagu_level_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beagu_level_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.beagu_level_sessions TO service_role;
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

# The remaining fixture only uses disposable codes/tokens; no user credentials.
# See the shell's PGHOST/PGPORT/PGDATABASE/PGUSER guard above.
test -f tests/stage38-staging-synthetic-login-cases.sql
if psql -v ON_ERROR_STOP=1 -f tests/stage38-staging-synthetic-login-cases.sql \
    > /tmp/stage38-unapproved-fixture.stdout 2>&1; then
  echo "INVALID: synthetic test data inserted without CI fixture marker" >&2
  exit 1
fi
grep -q "STAGE38_EPHEMERAL_PG_FIXTURE_ONLY" \
  /tmp/stage38-unapproved-fixture.stdout
psql -v ON_ERROR_STOP=1 <<'SQL'
SET app.stage38_fixture_only = 'ephemeral-ci';
\i tests/stage38-staging-synthetic-login-cases.sql
SQL

echo "PASS: synthetic Lv1/Lv2 hash lookups, revoked/invalid codes, session expiry, duplicate tokens on isolated PostgreSQL."

# Simulate the future verified-survey attestation ONLY in this ephemeral DB.
# Existing production code issuance is not evidence of submission completion.
test -f tests/stage38-synthetic-referral-proof-cases.sql
if psql -v ON_ERROR_STOP=1 -f tests/stage38-synthetic-referral-proof-cases.sql \
    > /tmp/stage38-unapproved-referral.stdout 2>&1; then
  echo "INVALID: referral fixture accepted an unauthorized database" >&2
  exit 1
fi
grep -q "STAGE38_SYNTHETIC_REFERRAL_EPHEMERAL_ONLY" \
  /tmp/stage38-unapproved-referral.stdout
psql -v ON_ERROR_STOP=1 <<'SQL'
SET app.stage38_fixture_only = 'ephemeral-ci';
\i tests/stage38-synthetic-referral-proof-cases.sql
SQL
echo "PASS: synthetic survey-verification gate denies issued-only codes, supports Lv1/earned Lv2 and revocation without production data."


# The official Form attestation reference uses a PRIVATE event digest.
# Prove that neither a replay nor cross-code assignment can reuse one event.
test -f tests/stage38-synthetic-submission-claim-cases.sql
if psql -v ON_ERROR_STOP=1 -f tests/stage38-synthetic-submission-claim-cases.sql \
     > /tmp/stage38-unapproved-claim.stdout 2>&1; then
  echo "INVALID: submission claim fixture ran outside ephemeral CI marker" >&2
  exit 1
fi
grep -q "STAGE38_EPHEMERAL_CLAIM_ONLY" \
  /tmp/stage38-unapproved-claim.stdout
psql -v ON_ERROR_STOP=1 <<'SQL'
SET app.stage38_fixture_only = 'ephemeral-ci';
\i tests/stage38-synthetic-submission-claim-cases.sql
SQL

# Two independent PostgreSQL sessions claim the SAME synthetic event at once.
# Exactly one may win: the UNIQUE indexes, not an application boolean,
# determine whether a proof was previously consumed.
claim_tmp="$(mktemp -d)"
trap 'rm -rf "$claim_tmp"' EXIT
(
  psql -v ON_ERROR_STOP=1 -At <<'SQL' > "$claim_tmp/a"
SET ROLE service_role;
SELECT CASE WHEN stage38_claim_fixture.try_claim(
  encode(sha256(convert_to('ST38-concurrent-event','UTF8')),'hex'),
  encode(sha256(convert_to('ST38-concurrent-code','UTF8')),'hex')
) THEN 'CLAIMED' ELSE 'REPLAY_DENIED' END;
SQL
) &
claim_pid_a=$!
(
  psql -v ON_ERROR_STOP=1 -At <<'SQL' > "$claim_tmp/b"
SET ROLE service_role;
SELECT CASE WHEN stage38_claim_fixture.try_claim(
  encode(sha256(convert_to('ST38-concurrent-event','UTF8')),'hex'),
  encode(sha256(convert_to('ST38-concurrent-code','UTF8')),'hex')
) THEN 'CLAIMED' ELSE 'REPLAY_DENIED' END;
SQL
) &
claim_pid_b=$!
wait "$claim_pid_a"
wait "$claim_pid_b"
claim_count="$(cat "$claim_tmp/a" "$claim_tmp/b" | grep -xc CLAIMED || true)"
deny_count="$(cat "$claim_tmp/a" "$claim_tmp/b" | grep -xc REPLAY_DENIED || true)"
if [[ "$claim_count" != 1 || "$deny_count" != 1 ]]; then
  echo "STAGE38_CONCURRENT_CLAIM_UNIQUE_CONSTRAINT_FAILED" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $validation$
BEGIN
  IF (SELECT COUNT(*) FROM stage38_claim_fixture.submission_claims)<>3
  THEN RAISE EXCEPTION 'Synthetic one-time evidence replay wrote extra records';
  END IF;
END;
$validation$;
SQL
echo "PASS: synthetic private Form event atomically claimed once; duplicate event, cross-code replay and two concurrent sessions rejected."


