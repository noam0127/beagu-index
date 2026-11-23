#!/usr/bin/env python3
"""Offline dependency regression for staging arcade API.
Live HTTP and SQL trigger tests are separate; this guards against silently
dropping a referenced PostgREST table or its ranking trigger from the bundle.
"""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/"scripts/staging/recovered-arcade-leaderboard/index.ts").read_text()
migration=(ROOT/"scripts/staging/schema-arcade-fastest25-trigger-qa-only.sql").read_text()
rollback=(ROOT/"tests/sql/staging-arcade-trigger-rollback-20261123.sql").read_text()
# Extract actual literal PostgREST paths, rather than trusting a manually
# curated list. Static string-only approach fails closed for new literals.
calls=set(re.findall(r'\bdb\("([a-z][a-z0-9_]+)(?:\?|"|\+)', source))
expected={
  "arcade_game_scores", "arcade_fastest25_records", "arcade_game_sessions",
  "schools", "beagu_school_report_yearly", "beagu_admin_accounts"
}
assert calls==expected, ("Unexpected DB table call; review dependency manifest", sorted(calls), sorted(expected))
assert "CREATE TABLE IF NOT EXISTS public.arcade_fastest25_records" in migration
assert "CREATE TRIGGER arcade_limit_game_record_insert" in migration
assert "CREATE OR REPLACE FUNCTION public.arcade_enforce_game_record_limits()" in migration
assert "CREATE INDEX IF NOT EXISTS arcade_fastest25_time_rank" in migration
assert "REVOKE ALL ON public.arcade_fastest25_records FROM PUBLIC,anon,authenticated" in migration
assert "ENABLE ROW LEVEL SECURITY" in migration
assert "OFFSET 10" in migration and "OFFSET 100" in migration
assert "BEGIN;" in rollback and rollback.rstrip().endswith("ROLLBACK;")
assert "FOR i IN 1..102" in rollback
assert "scores<>100" in rollback and "fastest<>10" in rollback
assert "snvzwrexuqavnfvzgxqj" not in migration
print("PASS: all 6 source tables explicitly enumerated; fastest25 and trigger restored")
print("PASS: 10 fastest/100 per game are guarded by rollback-only synthetic test")
print("RUNTIME: use isolated Actions HTTP smoke and transactional DB SQL separately")
