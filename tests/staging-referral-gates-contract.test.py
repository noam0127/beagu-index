#!/usr/bin/env python3
"""Referral endpoints and SQL guard must fail closed by default."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sql=(root/"scripts/staging/schema-referral-private-gated-qa-only.sql").read_text()
files=[root/"scripts/staging/recovered-beagu-referral-link-v1/index.ts",
       root/"scripts/staging/recovered-beagu-referral-checkin-v1/index.ts"]
assert "VALUES ('public_enabled',false)" in sql
assert "ON CONFLICT(name) DO NOTHING" in sql
assert "REVOKE ALL ON FUNCTION public.beagu_referral_enroll" in sql
assert "REVOKE ALL ON FUNCTION public.beagu_referral_short_resolve" in sql
assert "REVOKE ALL ON FUNCTION public.beagu_issue_challenge_identity_bound" in sql
assert "REVOKE ALL ON FUNCTION public.beagu_referral_short_issue" in sql
assert "DEVICE_PROOF" not in sql or "p_device_hash" in sql
assert "device_secret_sha256" in sql
assert "OWNERSHIP_MISMATCH" in sql
assert "REFERRAL_NOT_READY" in sql
for file in files:
 src=file.read_text()
 for key in ("https://ycwuugggqbunlbwuzvbx.supabase.co",
             "STAGING_PROJECT_ONLY","ORIGIN_NOT_ALLOWED",
             "BEAGU_STAGING_ALLOWED_ORIGIN",
             "BEAGU_STAGING_REFERRAL_VERIFIED","REFERRAL_NOT_READY"):
  assert key in src,(file,key)
 for forbidden in ("https://baeguindex.com","snvzwrexuqavnfvzgxqj","noam0127.github.io"):
  assert forbidden not in src,(file,forbidden)
print("PASS stage-only origin and explicit rollout lock for two referral APIs")
print("PASS DB default public_enabled=false, service-only RPCs and proof-match")
print("NOT CLAIMED: valid Google Forms submission attribution or earned Lv2")
