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
read_only_release = (stage / "admin-updates.html").read_text(encoding="utf-8")
assert "업데이트 관리 · 읽기 전용" in read_only_release
assert "배포 명령 비활성화" in read_only_release
assert not (stage / "js/beagu-admin-updates-v1.js").exists()
for privileged in [
    "releaseStageApply", "releaseProdApply", "releaseProdRollback",
    "releaseRegister", "releaseDraftForm", "beagu-release-manager-v1",
    "beagu-admin-updates-v1.js",
]:
    assert privileged not in read_only_release, privileged
assert "<form" not in read_only_release and "<button" not in read_only_release
assert "beagu-release-" in guard and "STAGE_SUPABASE" in guard
assert '"forms.gle"' in guard
assert '"forms.google.com"' in guard
assert '"docs.google.com"' in guard
survey_page = stage / "staging-survey-unavailable.html"
assert survey_page.is_file(), "A same-origin staging survey notice is required"
assert "운영 설문은 시험 웹에서 연결하지 않습니다" in survey_page.read_text(encoding="utf-8")
assert "/staging-survey-unavailable.html" in (stage / "index.html").read_text(encoding="utf-8")
assert "/staging-survey-unavailable.html" in (stage / "challenge.html").read_text(encoding="utf-8")
print("PASS: standalone release center is read-only; privileged JS and API calls disabled")

texts = (".html", ".js", ".mjs", ".css", ".json", ".csv", ".txt", ".svg")
for file in stage.rglob("*"):
    if file.is_file() and file.suffix.lower() in texts:
        contents = file.read_text(encoding="utf-8")
        assert "snvzwrexuqavnfvzgxqj" not in contents, file
        assert "https://forms.gle/TPyCakK6Sj2zchRy7" not in contents, file
        assert "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2" not in contents, file

blueprint = (root / "render.yaml").read_text(encoding="utf-8")
assert "runtime: static" in blueprint
assert "autoDeployTrigger: off" in blueprint
assert "branch: fix/v110-staging-edited-api-recovery-20261123" in blueprint
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
