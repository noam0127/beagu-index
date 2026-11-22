#!/usr/bin/env python3
"""Read-only readiness check of an independently deployed Render staging site.

Usage: python3 scripts/verify-render-preview.py \
  --url https://your-site.onrender.com --sha <40-character-deployed-sha>

No login, secrets, mutations, form submissions, database writes or deployment
APIs. The checker never follows redirects and only accepts HTTPS Render hosts.
"""
from __future__ import annotations
import argparse
import json
import re
import urllib.error
import urllib.request
from urllib.parse import urlsplit

STAGE_REF = "ycwuugggqbunlbwuzvbx"
LIVE_REF = "snvzwrexuqavnfvzgxqj"
SHA_RE = re.compile(r"^[a-f0-9]{40}$")
PAGES = ("/", "/search.html", "/challenge.html", "/statistics.html",
         "/school-report.html", "/admin-updates.html")
MAX_RESPONSE = 3 * 1024 * 1024


def valid_origin(url: str) -> str:
    if not isinstance(url, str):
        raise ValueError("Origin must be a Render HTTPS URL")
    parts = urlsplit(url)
    if (parts.scheme != "https" or
        not parts.hostname or not parts.hostname.endswith(".onrender.com") or
        parts.hostname == "onrender.com" or parts.username or parts.password or
        parts.port or parts.path not in ("", "/") or parts.query or parts.fragment):
        raise ValueError("Only a plain https://*.onrender.com origin is allowed")
    return "https://" + parts.hostname


class NeverRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Unexpected redirect: " + req.full_url)


OPENER = urllib.request.build_opener(NeverRedirect)


def fetch_page(origin: str, path: str) -> tuple[int, dict, str]:
    req = urllib.request.Request(
        origin + path, headers={"User-Agent": "BaeguStagingReadOnlyCheck/1.0",
                                "Cache-Control": "no-cache"},
        method="GET")
    try:
        with OPENER.open(req, timeout=15) as response:
            status = response.status
            headers = {key.lower(): value for key, value in response.headers.items()}
            body = response.read(MAX_RESPONSE + 1)
    except urllib.error.HTTPError as ex:
        raise AssertionError(f"{path}: HTTP {ex.code} (not deployed?)") from ex
    if len(body) > MAX_RESPONSE:
        raise AssertionError(f"{path}: response unexpectedly large")
    return status, headers, body.decode("utf-8")


def check(origin: str, sha: str, loader=fetch_page) -> int:
    origin = valid_origin(origin)
    if not SHA_RE.fullmatch(sha):
        raise ValueError("The deployed Git SHA must be a full 40-character hex commit")
    checked = 0
    status, headers, body = loader(origin, "/beagu-preview-health.json")
    assert status == 200, "Health marker not published"
    assert "application/json" in headers.get("content-type", ""), "Health not JSON"
    assert headers.get("access-control-allow-origin") == "*", "Health CORS not configured"
    proof = json.loads(body)
    assert proof == {
        "schema": 1, "kind": "standalone-staging", "hosting": "independent-static",
        "staging_sha": sha, "supabase_ref": STAGE_REF,
    }, "Health marker has incorrect SHA, backend, host or schema"
    checked += 1

    status, headers, guard = loader(origin, "/beagu-staging-navigation-guard.js")
    assert status == 200 and "javascript" in headers.get("content-type", ""), "Guard unavailable"
    assert "STAGE_SUPABASE" in guard and "beagu-release-" in guard, "Runtime isolation absent"
    assert LIVE_REF not in guard, "Production database in guard"
    checked += 1

    status, headers, config = loader(origin, "/js/supabase-config.js")
    assert status == 200, "Supabase staging config missing"
    assert STAGE_REF in config and LIVE_REF not in config, "Production Supabase config leaked"
    checked += 1

    status, headers, robots = loader(origin, "/robots.txt")
    assert status == 200 and "Disallow: /" in robots, "Missing robots exclusion"
    checked += 1

    for path in PAGES:
        status, headers, html = loader(origin, path)
        assert status == 200, f"{path} is not deployed"
        assert "text/html" in headers.get("content-type", ""), f"{path} wrong content type"
        assert "beagu-staging-watermark" in html, f"{path} not marked staging"
        assert LIVE_REF not in html, f"{path} production backend reference"
        assert "noindex" in headers.get("x-robots-tag", "").lower(), "Missing noindex header"
        csp = headers.get("content-security-policy", "")
        assert "connect-src" in csp and STAGE_REF + ".supabase.co" in csp, (
            "Render staging-only CSP not applied")
        assert LIVE_REF not in csp, "Production Supabase CSP leak"
        if path == "/admin-updates.html":
            assert "업데이트 관리 · 읽기 전용" in html, "Privileged release screen exposed"
            for forbidden in ("releaseProdApply", "releaseStageApply", "releaseRegister",
                              "releaseDraftForm", "beagu-admin-updates-v1.js"):
                assert forbidden not in html, f"Privileged control included: {forbidden}"
        checked += 1
        print("PASS "+path+" staging HTML, backend and headers")

    print(f"PASS: {checked} real Render GET checks, SHA {sha[:12]}, "
          "staging-only headers, no writable release UI")
    return checked


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="Exact https://*.onrender.com origin")
    parser.add_argument("--sha", required=True, help="Expected deployed 40-character Git SHA")
    args = parser.parse_args()
    check(args.url, args.sha)


if __name__ == "__main__":
    main()
