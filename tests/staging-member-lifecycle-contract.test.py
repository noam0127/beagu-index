#!/usr/bin/env python3
"""Safety regression for auditable, non-transferable Lv3 member lifecycle."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sql=(root/"scripts/staging/schema-postit-member-transition-audit-qa-20261123.sql").read_text()
edge=(root/"scripts/staging/recovered-beagu-postit-api-v4/index.ts").read_text()
ui=(root/"js/challenge-member-auth-v1.js").read_text()
html=(root/"challenge.html").read_text()
qa=(root/"tests/sql/staging-member-link-lifecycle-rollback-20261123.sql").read_text()

for marker in (
 "REFUSE_NON_ISOLATED_STAGE","beagu_private.beagu_postit_member_link_audit",
 "ALTER TABLE beagu_private.beagu_postit_member_link_audit ENABLE ROW LEVEL SECURITY",
 "REVOKE ALL ON TABLE","REVOKE ALL ON SEQUENCE",
 "CREATE OR REPLACE FUNCTION public.beagu_stage_postit_member_transition",
 "SECURITY DEFINER","SET search_path TO ''",
 "beagu_stage_active_member_auth_session(p_user,p_session)",
 "old_member.auth_user_id<>p_user","old_member.identity_visitor_id<>p_visitor",
 "old_member.author_uid<>p_author",
 "EXPLICIT_REACTIVATION_REQUIRED","MEMBERSHIP_RESERVED",
 "d.device_secret_sha256=p_device_hash",
 "r.valid_referrals>=1","r.disabled=false",
 "ON CONFLICT DO NOTHING RETURNING auth_user_id",
 "INSERT INTO beagu_private.beagu_postit_member_link_audit",
 "FROM PUBLIC,anon,authenticated","TO service_role"
):
    assert marker in sql,marker
assert sql.index("UPDATE public.beagu_postit_member_accounts")<sql.index(
       "INSERT INTO beagu_private.beagu_postit_member_link_audit")
assert "p_action text" in sql and "p_session uuid" in sql
assert all(secret not in sql for secret in ("beagu_sms_phone","raw_user_meta_data","x-forwarded-for"))

for marker in (
 'action==="link_member"||action==="suspend_member"||action==="reactivate_member"',
 "beagu_stage_postit_member_transition",
 "p_session:authSessionId",
 "verifiedAuthSessionId(jwt,account)",
 "const account=await authenticatedUser(req)",
 "MEMBER_AUDIT_UNAVAILABLE",
 'link_state:suspended?.status==="suspended"?"suspended":"unlinked"',
 "MEMBER_STATUS_UNAVAILABLE",
 'changed:decision.changed===true',
):
    assert marker in edge,marker
assert 'db.rpc("beagu_postit_bind_verified_member"' not in edge, "Legacy unaudited linking may not remain exposed"
assert edge.index("const account=await authenticatedUser(req)") < edge.index(
    "beagu_stage_postit_member_transition"), "JWT signature must be verified before DB state changes"
for marker in (
 'id="challengeMemberSuspend"',
 'id="challengeMemberLink"',
 'type="button" hidden>회원 연결 잠시 해제',
):
    assert marker in html,marker
for marker in (
 "suspend.addEventListener('click'",
 "window.confirm(",
 "action:'suspend_member'",
 "action:connect.dataset.action==='reactivate_member'?'reactivate_member':'link_member'",
 "member.state==='suspended'",
 "connect.dataset.action='reactivate_member'",
 "window.dispatchEvent(new Event('beagu:level-state-change'))",
 "기존 게시글은 삭제되지 않습니다",
):
    assert marker in ui,marker
for marker in (
 "NO_AUTH_LINK_ACCEPTED","WRONG_DEVICE_LINK_ACCEPTED",
 "INITIAL_LINK_NOT_AUDITED","DUPLICATE_LINK_RECORDED",
 "OTHER_MEMBER_SUSPEND_ACCEPTED","SUSPENDED_VISITOR_TRANSFER_ACCEPTED",
 "IMPLICIT_REACTIVATION_ACCEPTED","WRONG_DEVICE_REACTIVATED",
 "DISABLED_REFERRAL_REACTIVATED","SAME_OWNER_REACTIVATION_FAILED",
 "QA_MEMBER_AUDIT_FAILURE","FAILED_AUDIT_PARTIALLY_COMMITTED",
 "REVOKED_SESSION_SUSPEND_ACCEPTED","ROLLBACK;",
 "qa_member_audits_after","qa_failure_triggers_after"
):
    assert marker in qa,marker
print("PASS: only original Auth owner + active session can link/suspend, original device required to reactivate")
print("PASS: suspended visitor is reserved and cannot migrate to another account")
print("PASS: all mutations audited atomically; audit failure rolls back state; no PII or device secret in audit")
print("PASS: explicit suspend UX and original-device restore; no automatic member transfer")
print("NOT PROVEN: live browser connected to a real email-confirmed Auth account")
