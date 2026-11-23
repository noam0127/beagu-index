#!/usr/bin/env python3
"""VERIFY a REAL deployed Render test host, its immutable SHA and stage CORS.

Pure read-only HTTP: GET for public pages + OPTIONS for stage Edge endpoints.
No POST, credentials, account signup, test records, deployment or mutations.

An onrender.com hostname guessed from a Render Blueprint is NOT proof of a
deployed service. No live host or stale/mismatched revision => NOT VERIFIED.

Usage:
 python3 scripts/staging/check-render-live-sha-cors.py \
  --url https://ACTUAL-HOST.onrender.com \
  --sha <expected full 40-char Git commit SHA>
"""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
from urllib import error, request

CHECKER = Path(__file__).resolve().parents[1] / "verify-render-preview.py"
spec = importlib.util.spec_from_file_location("v110_render_readonly", CHECKER)
assert spec is not None and spec.loader is not None
site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)

STAGE_URL = "https://ycwuugggqbunlbwuzvbx.supabase.co"
FUNCTIONS = {
    "beagu-level-api": ("POST", {"content-type", "x-beagu-session"}),
    "beagu-postit-api-v1": ("POST", {"content-type", "authorization", "x-beagu-level-session"}),
    "beagu-perf-ingest-v1": ("POST", {"content-type"}),
    "beagu-2026-review-admin": ("POST", {"content-type", "authorization"}),
}

# Require an EXACT configured Render origin in each Edge function, NOT wildcard
# and NOT production. OPTIONS cannot create accounts, progress or samples.
def get_cors(origin: str, slug: str) -> tuple[int, dict[str, str]]:
    req = request.Request(
        STAGE_URL + "/functions/v1/" + slug,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers":
                "authorization,content-type,x-beagu-session,x-beagu-level-session",
            "User-Agent": "BeaguStagingCORSReadOnly/1.0",
            "Cache-Control": "no-store",
        },
        method="OPTIONS",
    )
    try:
        with site.OPENER.open(req, timeout=15) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}
    except error.HTTPError as ex:
        return ex.code, {k.lower(): v for k, v in ex.headers.items()}

def check(
    origin: str, sha: str,
    page_loader=site.fetch_page,
    preflight_loader=get_cors,
) -> int:
    origin = site.valid_origin(origin)
    # The site must be deployed from the exact expected commit, no other.
    checked = site.check(origin, sha, page_loader)
    assert checked == 10, "Unexpected Render site test count"
    for slug, (method, required_headers) in FUNCTIONS.items():
        code, headers = preflight_loader(origin, slug)
        assert code == 204, f"{slug}: OPTIONS status {code}, expected 204"
        allow_origin = headers.get("access-control-allow-origin", "")
        assert allow_origin == origin and allow_origin != "*", (
            f"{slug}: exact Render Origin NOT yet configured in staging Supabase")
        allow_methods = {m.strip().upper() for m in
                         headers.get("access-control-allow-methods", "").split(",")}
        assert method in allow_methods, f"{slug}: POST method not allowed"
        allowed_headers = {h.strip().lower() for h in
                           headers.get("access-control-allow-headers", "").split(",")}
        assert required_headers.issubset(allowed_headers), (
            f"{slug}: missing CORS request headers {required_headers - allowed_headers}")
        vary = {h.strip().lower() for h in headers.get("vary", "").split(",")}
        assert "origin" in vary, f"{slug}: Origin-dependent CORS missing Vary"
        print(f"PASS: {slug} exact staging-origin CORS, no writes")
    if page_loader is site.fetch_page and preflight_loader is get_cors:
        print("VERIFIED: actual live Render SHA, ten static/headers checks, four staging CORS preflights")
    else:
        print("MOCK_ONLY: strict SHA/CORS contract passed with injected offline fixtures")
    print("LIMITATION: real Lv3 email signup, MFA, real account browser E2E NOT tested")
    return checked + len(FUNCTIONS)

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--sha", required=True)
    args = parser.parse_args()
    try:
        check(args.url, args.sha)
    except (AssertionError, ValueError, OSError, error.URLError) as ex:
        # No URLs containing query params, no tokens, no response-body dumps.
        print("NOT_VERIFIED: live Render staging SHA/CORS gate blocked: " +
              type(ex).__name__ + ": " + str(ex)[:240])
        return 3
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
