#!/usr/bin/env python3
"""Stage-only classifier contract, not proof of successful logged-in browser E2E."""
from pathlib import Path
source = Path(__file__).resolve().parents[1] / "scripts/staging/recovered-beagu-school-culture-v1/index.ts"
body=source.read_text(encoding="utf-8")
checks=[
 "https://ycwuugggqbunlbwuzvbx.supabase.co",
 "STAGING_PROJECT_ONLY", "ORIGIN_NOT_ALLOWED",
 "BEAGU_STAGING_ALLOWED_ORIGIN", "origin===originConfigured",
 "token_sha256", "Number(session.access_level)<1",
 "Date.parse(session.expires_at)<=Date.now()",
 "beagu_release_metrics_v2","beagu_level_sessions",
 "small_cell_reviewed===true", "differencing_reviewed===true",
 "identity_reviewed===true", "question_reviewed===true",
 "Number(r.n_valid)>=5","Number(r.teacher_count)>=5",
 "approval_status==='APPROVED'","privacy_status==='PASSED'",
 "approved2026ReleaseIsOldEnough", "24*60*60*1000",
 "body.schoolIds.length>20","new Set(body.schoolIds).size",
 "return {status:'not_published'}",
]
for rule in checks:
    assert rule in body, "Missing safety gate: "+rule
assert "https://baeguindex.com" not in body
assert "snvzwrexuqavnfvzgxqj" not in body
assert "supabase/functions/beagu-school-culture-v1" not in str(source)
assert "SELECT *" not in body
print("PASS staging-only classification source contract, no production domains")
print("PASS server session, 5-person, per-question privacy review, 24-hour delay")
print("NOT VALIDATED: live session, browser user flow, real consent, or release readiness")
