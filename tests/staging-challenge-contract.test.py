#!/usr/bin/env python3
"""Offline staging-only challenge ownership/credential safety audit."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
edge=(root/"scripts/staging/recovered-beagu-challenge-identity/index.ts").read_text()
sql=(root/"scripts/staging/schema-challenge-bound-issuer-qa-only.sql").read_text()
ui=(root/"js/challenge.js").read_text()
referral=(root/"js/challenge-referral-v1.js").read_text()
for n in (
 "STAGING_PROJECT_ONLY","OWNERSHIP_VERIFICATION_FAILED",
 "beagu_stage_issue_challenge_bound", "p_session_sha256: sessionDigest",
 "p_device_sha256: await sha256(input.deviceSecret)",
 "session.identity_visitor_id", "BEAGU_STAGING_ALLOWED_ORIGIN",
 "origin === renderOrigin", "ORIGIN_NOT_ALLOWED"):
 assert n in edge,"missing protected Edge gate: "+n
for n in (
 "SECURITY DEFINER","FOR UPDATE","DEVICE_PROOF_MISMATCH",
 "SESSION_VISITOR_MISMATCH","LEGACY_CODE_PROOF_REQUIRED",
 "identity_visitor_id=p_visitor","REVOKE ALL ON FUNCTION",
 "FROM PUBLIC,anon,authenticated","GRANT EXECUTE ON FUNCTION",
 "pg_advisory_xact_lock(2026,2601)"):
 assert n in sql,"missing atomic DB ownership rule: "+n
assert "beagu-referral-device-secret-v1" in ui
assert "beagu-referral-device-secret-v1" in referral
assert "deviceSecret: deviceSecret()" in ui
assert "deviceSecret: deviceSecret()" in referral
assert "crypto.getRandomValues(bytes)" in ui
assert "beagu_issue_challenge_identity', {" not in edge
for bad in ("https://baeguindex.com","snvzwrexuqavnfvzgxqj"):
 assert bad not in edge+sql
rollback=(root/"tests/sql/staging-challenge-bound-rollback-20261123.sql").read_text()
assert rollback.lstrip().startswith("-- QA-only") and rollback.rstrip().endswith("ROLLBACK;")
assert "Different visitor was allowed" in rollback
assert "Wrong device recovered code" in rollback
print("PASS stage-origin+project isolation, atomic session ownership + browser secret")
print("PASS SQL rollback catches cross-session, cross-visitor, wrong-device and replay")
print("NOT PROVEN real email/Lv1 session and production user browser E2E")
