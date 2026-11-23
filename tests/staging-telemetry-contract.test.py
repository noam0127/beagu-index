#!/usr/bin/env python3
"""Staging telemetry contract. No deployment or database credentials."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/"scripts/staging/recovered-beagu-telemetry-v2/index.ts").read_text()
sql=(root/"scripts/staging/schema-telemetry-rpcs-qa-only.sql").read_text()
for rule in [
 "https://ycwuugggqbunlbwuzvbx.supabase.co", "STAGING_PROJECT_ONLY",
 "BEAGU_STAGING_ALLOWED_ORIGIN", "ORIGIN_NOT_ALLOWED",
 "qa-unverified-network", "beagu_telemetry_guard_v2",
 "beagu_telemetry_totals_v2","beagu_record_visit",
 "beagu_presence_ping_v1","ADMIN_CHECK_UNAVAILABLE",
 "TELEMETRY_RATE_LIMITED", "rate_limited:true",
 "AbortSignal.timeout(7500)","!uuid4.test(input.visitor",
]:
 assert rule in source, "Missing stage gate: "+rule
for bad in ["https://baeguindex.com","snvzwrexuqavnfvzgxqj",
            "cf-connecting-ip", "x-forwarded-for", "X-Forwarded-For"]:
 assert bad.lower() not in source.lower(), "Untrusted production/IP reference "+bad
for rule in [
 "CREATE OR REPLACE FUNCTION public.beagu_telemetry_totals_v2()",
 "CREATE OR REPLACE FUNCTION public.beagu_record_visit(",
 "SECURITY DEFINER", "REVOKE ALL ON FUNCTION public.beagu_record_visit",
 "REVOKE ALL ON FUNCTION public.beagu_telemetry_totals_v2()",
 "FROM PUBLIC,anon,authenticated","GRANT EXECUTE ON FUNCTION",
 "pg_advisory_xact_lock", "ON CONFLICT(event_id) DO NOTHING",
 "BEAGU" if False else "beagu_private.visits"
]:
 assert rule in sql, "Missing private-only RPC rule: "+rule
print("PASS isolated telemetry project, trusted QA origins, no spoofable IP headers")
print("PASS private RPC ACL, event idempotence, server-only visit aggregation")
print("NOTE user-level real production ingress/rate-limit validation remains pending")
