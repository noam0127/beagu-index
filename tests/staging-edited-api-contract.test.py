#!/usr/bin/env python3
"""Contract review only: NOT runtime, remote auth, CORS or E2E proof."""
from pathlib import Path
source = Path(__file__).resolve().parents[1] / "scripts/staging/recovered-beagu-edited-api-v1/index.ts"
s = source.read_text(encoding="utf-8")
required = [
    "https://ycwuugggqbunlbwuzvbx.supabase.co",
    "STAGING_PROJECT_ONLY", "ORIGIN_NOT_ALLOWED",
    "BEAGU_STAGING_ALLOWED_ORIGIN", r"\.onrender\.com",
    "get('x-beagu-session')", "token_sha256",
    "Number(session.access_level) < 2", "Date.parse(session.expires_at) <= Date.now()",
    "beagu_school_report_official_facts", "beagu_school_report_official_categories",
    "beagu_school_report_yearly", "review_status', 'APPROVED'",
    "publication_status', 'PUBLISHED'", "privacy_reviewed', true",
    "unique_respondents_reviewed', true", "small_cell_reviewed', true",
    "differencing_reviewed', true", "manual_release_approved', true",
    "school_identity_reviewed', true", "DATA_UNAVAILABLE",
    "readSmallJson(req)", "len > 1024", "level: 2"
]
for value in required:
    assert value in s, f"Missing stage-only security/data dependency: {value}"
assert "https://baeguindex.com" not in s
assert "snvzwrexuqavnfvzgxqj" not in s
assert "'*'" not in s or "'*'" not in s[s.index("function headers"):s.index("function send")]
assert "GRANT " not in s and "CREATE TABLE" not in s
assert "Deno.serve" in s
assert source.name == "index.ts"
assert "supabase/functions/beagu-edited-api-v1" not in str(source)
print("PASS staging-only project+origin and token/Lv2/expiry gates are in source")
print("PASS only reviewed official school facts and fully gated historical percentiles")
print("NOT TESTED: Deno execution, live CORS, SQL prerequisites, hosted login, or E2E")
