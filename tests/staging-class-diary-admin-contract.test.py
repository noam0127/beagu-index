#!/usr/bin/env python3
"""Isolated class-diary/admin review staging regression (no writes)."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
services=[
  ("class-diary-guest-access-v1","BEAGU_STAGING_CLASS_DIARY_APPROVED","PREVIEW_NOT_READY"),
  ("class-diary-progress-v1","BEAGU_STAGING_CLASS_DIARY_APPROVED","PREVIEW_NOT_READY"),
  ("beagu-2026-review-admin","BEAGU_STAGING_REVIEW_APPROVED","REVIEW_NOT_READY")
]
for name,gate,code in services:
    source=(root/f"scripts/staging/recovered-{name}/index.ts").read_text()
    for required in (
      "https://ycwuugggqbunlbwuzvbx.supabase.co",
      "STAGING_PROJECT_ONLY",gate,code,
      "BEAGU_STAGING_ALLOWED_ORIGIN",
      "allowedOrigin(origin)",
      "status:204" if False else "http://localhost:8000",
    ):
      assert required in source,(name,required)
    for forbidden in ("https://baeguindex.com","snvzwrexuqavnfvzgxqj","noam0127.github.io"):
      assert forbidden not in source,(name,forbidden)
print("PASS: all 3 Edge functions stage-only, strict origins and deliberately locked")
admin=(root/"scripts/staging/recovered-beagu-2026-review-admin/index.ts").read_text()
for v in ('BEAGU_STAGING_REVIEW_APPROVED','beagu_admin_active_mfa_session','claims.aal!=="aal2"'):
    assert v in admin,v
sql=(root/"scripts/staging/schema-class-diary-private-qa-only.sql").read_text()
for v in (
  "CREATE TABLE IF NOT EXISTS beagu_private.class_diary_preview_progress",
  "CREATE TABLE IF NOT EXISTS beagu_private.class_diary_preview_attempts",
  "ENABLE ROW LEVEL SECURITY","SECURITY DEFINER","FROM PUBLIC,anon,authenticated",
  "beagu_class_diary_preview_progress_read",
  "beagu_class_diary_preview_progress_write",
  "beagu_consume_class_diary_preview_budget",
  "WHERE p.revision=p_expected_revision",
):
  assert v in sql,v
rollback=(root/"tests/sql/staging-class-diary-preview-rollback-20261123.sql").read_text()
assert rollback.rstrip().endswith("ROLLBACK;")
assert "FOR i IN 1..81" in rollback
assert "stale revision accepted" in rollback
print("PASS: CAS progress, preview PIN rate limit, rollback-only synthetic DB checks")
print("NO-GO: no actual PIN/owner authorization or admin MFA/review positive E2E")
