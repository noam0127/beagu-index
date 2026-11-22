#!/usr/bin/env python3
"""Read-only checks for the Vercel-free static preview bundle."""
import json
import pathlib
import re
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
stage = root / "_standalone_staging"
sha = subprocess.check_output(
    ["git", "rev-parse", "HEAD"], cwd=root, text=True
).strip()

if not stage.is_dir():
    raise AssertionError("Build first with scripts/build-standalone-staging.py")
health = json.loads((stage / "beagu-preview-health.json").read_text())
assert health == {
    "schema": 1,
    "kind": "standalone-staging",
    "staging_sha": sha,
    "supabase_ref": "ycwuugggqbunlbwuzvbx",
    "hosting": "independent-static",
}
assert (stage / "index.html").is_file()
assert not (stage / "CNAME").exists()
assert not (stage / ".github").exists()
assert not (stage / "supabase").exists()
assert not (stage / "tests").exists()
assert not (stage / "scripts").exists()
assert not (stage / "test-web").exists()
assert not (stage / "wrangler.jsonc").exists()
assert "Disallow: /" in (stage / "robots.txt").read_text()
guard = (stage / "beagu-staging-navigation-guard.js").read_text()
assert "baeguindex.com" in guard
assert "preventDefault" in guard
assert "XMLHttpRequest.prototype.open" in guard
assert "sendBeacon" in guard
assert "window.fetch" in guard
assert "WebSocket" in guard and "EventSource" in guard
assert "HTMLFormElement.prototype.submit" in guard
assert "different-project.supabase.co" not in guard
source_guard = subprocess.check_output(
    ["git", "show", sha + ":scripts/staging-runtime-guard.js"],
    cwd=root
).decode("utf-8")
assert guard == source_guard, "Runtime guard must originate from the immutable commit"

pages = list(stage.rglob("*.html"))
assert len(pages) >= 10
for page in pages:
    body = page.read_text(encoding="utf-8")
    assert 'id="beagu-staging-watermark"' in body, page
    assert 'name="robots" content="noindex,nofollow,noarchive"' in body, page
    assert 'src="/beagu-staging-navigation-guard.js"' in body, page
assert "ycwuugggqbunlbwuzvbx" in (stage / "js/supabase-config.js").read_text()

texts = (".html", ".js", ".mjs", ".css", ".json", ".csv", ".txt", ".svg")
for file in stage.rglob("*"):
    if file.is_file() and file.suffix.lower() in texts:
        contents = file.read_text(encoding="utf-8")
        assert "snvzwrexuqavnfvzgxqj" not in contents, file
        assert "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2" not in contents, file

blueprint = (root / "render.yaml").read_text(encoding="utf-8")
assert "runtime: static" in blueprint
assert "autoDeployTrigger: off" in blueprint
assert "branch: fix/v1.1.0-preview-isolation-gate-20261123" in blueprint
assert "staticPublishPath: ./_standalone_staging" in blueprint
assert "https://ycwuugggqbunlbwuzvbx.supabase.co" in blueprint
assert "snvzwrexuqavnfvzgxqj" not in blueprint
assert "https://baeguindex.com" not in blueprint
assert "X-Robots-Tag" in blueprint
assert "Content-Security-Policy" in blueprint
assert "/beagu-preview-health.json" in blueprint
assert "Access-Control-Allow-Origin" in blueprint
assert 'value: "*"' in blueprint
assert "Cache-Control" in blueprint
config = (stage / "js/beagu-independent-preview-target-v1.js").read_text(encoding="utf-8")
assert 'origin: ""' in config, "Independent host must be disconnected until verified"
assert "service_role" not in config and "baeguindex.com" not in config
print("PASS: Render uses manual staging-only deployment and no production hostname")

print("PASS: " + str(len(pages)) + " marked pages; immutable SHA; no production Supabase refs")
print("PASS: preview bundle has no CNAME, deployment scripts, SQL migrations or secrets")
print("PASS: staging-only config, public artifacts, blocked production link navigation")
