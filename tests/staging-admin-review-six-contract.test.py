#!/usr/bin/env python3
"""Static QA for six 2026 reviewer RPCs + locked stage Edge, no SQL writes.
The actual SQL-positive read + negative MFA/hold test was executed against
the staging project separately; CI has NO service-role credentials.
"""
from pathlib import Path
import re
R=Path(__file__).resolve().parents[1]
schema=(R/"scripts/staging/schema-review-admin-private-qa-only.sql").read_text()
rpc=(R/"scripts/staging/schema-review-admin-six-rpcs-qa-only.sql").read_text()
edge=(R/"scripts/staging/recovered-beagu-2026-review-admin/index.ts").read_text()
sql_test=(R/"tests/sql/staging-review-admin-six-rpc-rollback-20261123.sql").read_text()
tables=(
 "beagu_2026_auto_review_status",
 "beagu_2026_quality_reviews",
 "beagu_2026_results_approval_audit",
 "beagu_2026_basis_review_events",
 "challenge_referral_quality_reviews",
 "challenge_referral_quality_audit",
)
for name in tables:
    assert "CREATE TABLE IF NOT EXISTS beagu_private."+name in schema,name
    assert "ALTER TABLE beagu_private."+name+" ENABLE ROW LEVEL SECURITY" in schema,name
    assert "REVOKE ALL ON beagu_private."+name in schema,name
assert "ADD COLUMN IF NOT EXISTS school_response_rows" in schema
assert "TST[0-9]{4}" in rpc, "HOLD must retain TST-only QA school ids"
functions=(
 "beagu_2026_admin_review_queue",
 "beagu_2026_admin_pipeline_status",
 "beagu_referral_quality_queue",
 "beagu_referral_quality_resolve",
 "beagu_2026_admin_record_basis_review",
 "beagu_2026_admin_hold_result",
)
for fn in functions:
    assert "FUNCTION public."+fn+"(" in rpc,fn
    assert "REVOKE ALL ON FUNCTION public."+fn+"(" in rpc,fn
    assert "GRANT EXECUTE ON FUNCTION public."+fn+"(" in rpc,fn
assert len(re.findall(r"\b(?:STABLE\s+)?SECURITY\s+DEFINER\s*(?:SET|\n)",rpc))==6, "All six must use server-only privileged SQL"
assert "not q.form_quality_attested" in rpc
assert "name='public_enabled' and s.enabled" in rpc
assert "p_session uuid" in rpc
assert "beagu_admin_active_mfa_session(p_actor,p_session)" in rpc
assert "INSERT INTO public.beagu_admin_audit_events" in rpc
assert "INSERT INTO beagu_private.beagu_2026_results_approval_audit" in rpc
assert "2026_review_hold" in rpc
assert "STAGING_QA_SOURCE_2026" in rpc
assert "1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4" not in rpc
assert "snvzwrexuqavnfvzgxqj" not in rpc+schema+edge
assert "https://baeguindex.com" not in edge
for n in ("REVIEW_NOT_READY","BEAGU_STAGING_REVIEW_APPROVED","STAGING_PROJECT_ONLY","BEAGU_STAGING_ALLOWED_ORIGIN",
          'p_session:claims.session_id','beagu_admin_active_mfa_session','claims.aal!=="aal2"'):
    assert n in edge,n
assert 'await db.from("beagu_admin_audit_events").insert' not in edge
assert sql_test.lstrip().startswith("-- Staging-only") and sql_test.rstrip().endswith("ROLLBACK;")
assert "owner/MFA-less HOLD unexpectedly succeeded" in sql_test
assert "owner/MFA-less Lv2 credit unexpectedly succeeded" in sql_test
assert "denied admin request mutated records" in sql_test
print("PASS six SQL RPCs and six private tables with server-only execution and RLS")
print("PASS MFA/session owner checks, verified-form-only Lv2 credits, atomic hold audit")
print("PASS stage Edge still locked and no duplicate post-commit audit")
print("NOT E2E: no genuine owner AAL2 positive browser decision or publish approval")
