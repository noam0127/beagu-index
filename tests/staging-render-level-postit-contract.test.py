#!/usr/bin/env python3
"""Ensure restored deployed v5/v4 source maintains all critical member gates."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/"scripts/staging"
lvl=ROOT/"recovered-beagu-level-api-v5"
post=ROOT/"recovered-beagu-postit-api-v4"
a=(lvl/"index.ts").read_text()
b=(post/"index.ts").read_text()
for src in (a,b):
 for text in ("STAGE_URL='https://ycwuugggqbunlbwuzvbx.supabase.co'",
              "BEAGU_STAGING_ALLOWED_ORIGIN","STAGING_PROJECT_ONLY",
              "if(!allowedOrigin(origin))","renderPattern.test(exactRender)",
              "Access-Control-Allow-Origin","Vary"):
  assert text in src,text
 for forbidden in ("https://baeguindex.com","https://www.baeguindex.com",
                  "snvzwrexuqavnfvzgxqj","Access-Control-Allow-Origin':'*'"):
  assert forbidden not in src,forbidden
 assert "allowedOrigin(origin)?{" in src
 assert src.index("if(!allowedOrigin(origin))")<src.index("if(req.method")
for s in ("verifiedMemberTier","isVerifiedLv3Member",
          "beagu_postit_member_accounts","beagu_has_earned_challenge_visitor",
          "beagu_level_sessions"):
 assert s in a,"Lv3 regression: "+s
for s in ("resolveVerifiedPostitOwner","eligiblePostitAuthUser",
          "beagu_has_earned_challenge_visitor","beagu_level_sessions"):
 assert s in b,"member ownership regression: "+s
for name in ("results-2026.mjs","questionnaire-2026.mjs","release-policy.mjs",
             "postit-member-ownership.mjs","member-tier-v1.mjs"):
 assert (lvl/"_shared"/name).is_file()
assert (post/"_shared/postit-member-ownership.mjs").is_file()
print("PASS restored exact deployed Lv3 and postit-membership function dependencies")
print("PASS exact Render origin only with project identity and local QA allowlist")
for parent in (lvl,post):
 assert (parent/"_shared/member-session-v1.mjs").is_file()
 src=(parent/"index.ts").read_text()
 assert ".auth.getUser(" in src and "verifiedAuthSessionId(" in src
 assert src.index(".auth.getUser(")<src.index("verifiedAuthSessionId(")
 assert src.index("verifiedAuthSessionId(")<src.index("beagu_stage_active_member_auth_session")
 assert "sessionError||" in src
print("PASS: Lv3 AND postit member actions recheck active owner-bound Auth sessions")
memberSource=(post/"index.ts").read_text()
for required in ('beagu_stage_postit_member_transition',
    'action==="suspend_member"','action==="reactivate_member"',
    'MEMBER_AUDIT_UNAVAILABLE'):
 assert required in memberSource,required
assert 'db.rpc("beagu_postit_bind_verified_member"' not in memberSource
print("PASS member link, suspend, reactivate all use atomically audited service RPC")
print("PASS no production origin fallback, no wildcard, no identity check removed")
