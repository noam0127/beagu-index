#!/usr/bin/env python3
"""Read-only HTTP smoke test for the admin-approved GitHub Pages preview.

Usage: python3 tests/staging-http-smoke.py
Checks both production and preview to distinguish DNS/TLS/domain failures from
preview-only routing/packaging errors. Never publishes a release.
"""
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.environ.get("BEAGU_SITE_ORIGIN", "https://baeguindex.com").rstrip("/")
WAIT = float(os.environ.get("BEAGU_SMOKE_RETRY_SECONDS", "2"))
TRIES = int(os.environ.get("BEAGU_SMOKE_ATTEMPTS", "3"))
TIMEOUT = float(os.environ.get("BEAGU_SMOKE_TIMEOUT", "12"))


def fetch(path):
    url = ROOT + path
    last = None
    for attempt in range(TRIES):
        try:
            request = urllib.request.Request(url, headers={
                "User-Agent": "BeaguIndex-Preview-ReadOnly-Smoke/1.0",
                "Cache-Control": "no-cache",
            })
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                status = response.status
                final_url = response.url
                body = response.read(750_000)
                content_type = response.headers.get("Content-Type", "")
            return status, final_url, content_type, body
        except (OSError, urllib.error.HTTPError) as exc:
            last = str(exc)
            if attempt + 1 < TRIES:
                time.sleep(WAIT)
    raise RuntimeError(f"{path}: {last}")


def check():
    failures = []
    results = {}
    for name, path in (("production", "/"), ("preview", "/_preview/"),
                       ("preview-index", "/_preview/index.html"),
                       ("preview-challenge", "/_preview/challenge.html"),
                       ("preview-updates", "/_preview/admin-updates.html")):
        try:
            status, url, content_type, body = fetch(path)
            html = body.decode("utf-8", errors="replace")
            valid = status == 200 and "<html" in html.lower()
            if name != "production":
                valid = valid and 'beagu-preview-watermark' in html
            if not valid:
                failures.append(f"{name}: HTTP {status}, unexpected HTML or missing preview marker")
            results[name] = (url, html, content_type)
            print(f"{name}: HTTP {status}, {len(body)} bytes, url={url}")
        except RuntimeError as exc:
            failures.append(str(exc))
            print(f"{name}: ERROR {exc}")
    if "preview" in results and "preview-index" in results:
        main_html = results["preview"][1]
        explicit_html = results["preview-index"][1]
        if main_html != explicit_html:
            failures.append("Preview directory index differs from /_preview/index.html")
        local_assets = re.findall(r"""(?:href|src)\s*=\s*["']([^"'#]+)["']""", main_html, re.I)
        paths = []
        for asset in local_assets:
            parsed = urllib.parse.urlparse(asset)
            if parsed.scheme or asset.startswith("//") or asset.startswith("data:"):
                continue
            destination = urllib.parse.urljoin(ROOT + "/_preview/", asset)
            parsed_path = urllib.parse.urlparse(destination).path
            if not parsed_path.startswith("/_preview/"):
                failures.append(f"Preview asset escapes /_preview/: {asset}")
            elif parsed_path not in paths and re.search(r"\.(css|js)(?:$|\?)", asset, re.I):
                paths.append(parsed_path)
        for path in paths[:8]:
            try:
                status, _, content_type, data = fetch(path)
                if status != 200 or not data:
                    failures.append(f"Preview asset missing: {path}")
                print(f"asset: HTTP {status} {path}")
            except RuntimeError as exc:
                failures.append(str(exc))
                print(f"asset: ERROR {exc}")
    for issue in failures:
        print("FAIL:", issue, file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(check())
