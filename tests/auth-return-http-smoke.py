#!/usr/bin/env python3
"""Read-only smoke for Supabase Auth return destinations on deployed website.

Verifies page reachability only. It CANNOT inspect private Supabase Site URL /
Redirect URLs settings or prove an email confirmation works.
"""
import json
from pathlib import Path
import sys
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/releases/v1.1.0-auth-redirect-matrix.json"
UA = "Beagu-Auth-Return-Destination-ReadOnly/1.0"


def check(url, preview):
    request = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html",
        "Cache-Control": "no-cache",
    })
    with urllib.request.urlopen(request, timeout=15) as response:
        final = response.url
        status = response.status
        content_type = response.headers.get("Content-Type", "")
        body = response.read(250_000).decode("utf-8", "replace")
    if status != 200:
        raise AssertionError("non-200 status " + str(status))
    if final != url:
        raise AssertionError("unintended redirect " + final)
    if "text/html" not in content_type.lower() or "<html" not in body.lower():
        raise AssertionError("not a usable HTML page")
    if preview and "beagu-preview-watermark" not in body:
        raise AssertionError("preview visual marker missing")
    print(("PREVIEW " if preview else "PROD ") + str(status) + " " + final)


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for stage in ("production", "staging"):
        project = manifest["projects"][stage]
        # The new password-reset.html route is development-only until the
        # approved staging/production release. Keep live HTTP smoke scoped to
        # the three already-deployed return pages; test the fourth offline.
        urls = [u for u in project["allowed_redirect_urls"]
                if u.rsplit("/", 1)[-1] in ("challenge.html", "postit.html", "admin-enroll.html")]
        assert len(urls) == 3
        for url in urls:
            try:
                check(url, preview=stage == "staging")
            except (AssertionError, OSError, urllib.error.HTTPError) as error:
                print("FAIL:", stage, url, error, file=sys.stderr)
                return 1
    print("PASS: six deployed Auth return pages are reachable and correctly rooted.")
    print("NOT TESTED: new password-reset.html until released; dashboard URL allowlists, confirmation emails, Auth tokens or actual callbacks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
