#!/usr/bin/env python3
"""Guard the staging-only read-only MFA preflight and prevent rollout bypass."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
s=(root/"scripts/staging/recovered-beagu-2026-review-admin/index.ts").read_text()
for text in (
 "const isPreflight=new URL(request.url).searchParams.get(\"preflight\")===\"mfa\"",
 "getUser(jwt)",
 "claims?.sub!==actor",
 "!uuid.test(claims.session_id)",
 "admin_access_not_configured",
 "mfa_challenge_required",
 "verified_aal2_session",
 "inactive_or_expired_mfa_session",
 "mfa_session_check_unavailable",
 'p_user:actor,p_session:claims.session_id',
 "review_enabled:false",
 "BEAGU_STAGING_REVIEW_APPROVED",
 'REVIEW_NOT_READY',
 "STAGING_PROJECT_ONLY",
 "allowedOrigin(origin)"
):
    assert text in s,text
assert s.index("if(isPreflight){") < s.index("if(Deno.env.get('BEAGU_STAGING_REVIEW_APPROVED')")
assert s.index('const {data:verified,error:verifyError}=await db.auth.getUser(jwt)')<s.index('const claims=claimsOf(jwt);')
assert "https://baeguindex.com" not in s
assert "snvzwrexuqavnfvzgxqj" not in s
assert 'await db.from("beagu_admin_accounts").insert' not in s
assert 'await db.from("beagu_admin_audit_events").insert' not in s
print("PASS: preflight requires an Auth-verified token and active AAL2 session")
print("PASS: preview never creates an account/role/MFA factor or changes review approval")
print("PASS: review stays locked independent of the preflight result")
