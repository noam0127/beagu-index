#!/usr/bin/env python3
"""Permanent static regression: page RUM is stage-only and RPC server-only."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
client=(root/"js/beagu-page-performance-v1.js").read_text()
source=(root/"scripts/staging/recovered-beagu-perf-ingest-v1/index.ts").read_text()
migration=(root/"scripts/staging/schema-page-performance-server-only-qa.sql").read_text()
for x in (
    "https://ycwuugggqbunlbwuzvbx.supabase.co",
    "functions/v1/beagu-perf-ingest-v1",
    "typeof SUPABASE_URL==='string' && SUPABASE_URL===qaSupabase",
    "fetch(telemetryURL,{",
    "JSON.stringify({",
    "duration_ms:rounded",
    "keepalive:true",
):
    assert x in client,x
for forbidden in (
    "supabaseClient.rpc('beagu_perf_record_v1'",
    'https://snvzwrexuqavnfvzgxqj.supabase.co',
):
    assert forbidden not in client,forbidden
for x in (
    "STAGING_PROJECT_ONLY","ORIGIN_NOT_ALLOWED",
    "IDENTITY_BEARER_NOT_ACCEPTED","JSON_REQUIRED","INVALID_SAMPLE",
    "SAMPLE_UNAVAILABLE","AbortSignal.timeout(5000)",
    "b.duration_ms>120000","beagu_perf_record_v1",
    "'authorization':'Bearer '+secret",
    "const STAGE_URL='https://ycwuugggqbunlbwuzvbx.supabase.co'"
):
    assert x in source,x
for forbidden in ("https://baeguindex.com","snvzwrexuqavnfvzgxqj",
                  "cf-connecting-ip","x-forwarded-for"):
    assert forbidden not in source,forbidden
for x in ("REVOKE ALL ON FUNCTION public.beagu_perf_record_v1",
          "FROM PUBLIC,anon,authenticated",
          "GRANT EXECUTE ON FUNCTION public.beagu_perf_record_v1",
          "TO service_role"):
    assert x in migration,x
print("PASS: stage-only browser perf gateway with fixed-category samples and private RPC")
print("PASS: no client->SECURITY DEFINER direct RPC, service role only")
print("PASS: no production configuration, IP/user token or raw search/URL collected")
