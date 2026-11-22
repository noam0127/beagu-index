#!/usr/bin/env python3
"""Test the *actual* GitHub Pages release packager with two fictitious commits.

No network, GitHub authorization, deployment, Supabase access, real school data,
or modification of the repository under test.
"""
import importlib.util
import json
import pathlib
import subprocess
import tempfile

SOURCE_ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "beagu_release_worker", SOURCE_ROOT / "scripts/release-manager/worker.py"
)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

def git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()

def put(root, filename, value):
    file = root / filename
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(value, encoding="utf-8")

with tempfile.TemporaryDirectory(prefix="beagu-preview-isolation-") as scratch:
    scratch = pathlib.Path(scratch)
    repo = scratch / "fixture"
    repo.mkdir()
    git(repo, "init", "-q")
    git(repo, "config", "user.email", "qa@example.invalid")
    git(repo, "config", "user.name", "QA Fixture")

    # Production fixture: deliberately different HTML and JavaScript.
    put(repo, "CNAME", "baeguindex.com\n")
    put(repo, "index.html",
        '<html><head></head><body><h1>PRODUCTION_SAFE</h1>'
        '<a href="/school-report.html">School</a>'
        '<script src="/js/site.js"></script></body></html>')
    put(repo, "school-report.html",
        "<html><head></head><body>PROD_REPORT</body></html>")
    put(repo, "js/site.js", "window.mock='PROD_JS';")
    put(repo, "js/supabase-config.js",
        "window.supabaseUrl='https://snvzwrexuqavnfvzgxqj.supabase.co'; "
        "window.supabaseKey='sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2';")
    put(repo, "styles/api.css", '/* production ref snvzwrexuqavnfvzgxqj */')
    put(repo, "assets/endpoints.json",
        '{"api":"https://snvzwrexuqavnfvzgxqj.supabase.co"}')
    put(repo, "data/public-compare-school-directory-v1.json",
        '{"version":"OLD_APPROVED_DIRECTORY"}')
    git(repo, "add", ".")
    git(repo, "commit", "-qm", "synthetic production")
    production = git(repo, "rev-parse", "HEAD")

    # Staging fixture: includes candidate code and the latest allowed public
    # directory artifact. This should *not* replace production's HTML or JS.
    put(repo, "index.html",
        '<html><head></head><body><h1>STAGING_NEW</h1>'
        '<a href="/school-report.html">School</a>'
        '<script src="/js/site.js"></script></body></html>')
    put(repo, "school-report.html",
        "<html><head></head><body>STAGE_REPORT</body></html>")
    put(repo, "js/site.js", "window.mock='STAGE_JS';")
    put(repo, "data/public-compare-school-directory-v1.json",
        '{"version":"LATEST_ALLOWED_DIRECTORY"}')
    git(repo, "add", ".")
    git(repo, "commit", "-qm", "synthetic candidate")
    staging = git(repo, "rev-parse", "HEAD")
    assert production != staging

    worker.ROOT = repo
    worker.PLAN = scratch / "plan.json"
    worker.OUTPUT = scratch / "published"

    def build_with(stage_sha):
        worker.PLAN.write_text(json.dumps({
            "has_job": True,
            "production_sha": production,
            "staging_sha": stage_sha
        }), encoding="utf-8")
        worker.build()

    build_with(staging)
    out = worker.OUTPUT
    prod_html = (out / "index.html").read_text(encoding="utf-8")
    stage_html = (out / "_preview/index.html").read_text(encoding="utf-8")
    assert "PRODUCTION_SAFE" in prod_html and "STAGING_NEW" not in prod_html
    assert "STAGING_NEW" in stage_html and "PRODUCTION_SAFE" not in stage_html
    assert "beagu-preview-watermark" not in prod_html
    assert "beagu-preview-watermark" in stage_html
    assert "운영 웹과 브라우저 저장공간 공유" in stage_html
    assert "실제 계정 사용 금지" in stage_html
    assert 'http-equiv="Content-Security-Policy"' in stage_html
    assert "connect-src 'self' https://ycwuugggqbunlbwuzvbx.supabase.co" in stage_html
    assert "wss://ycwuugggqbunlbwuzvbx.supabase.co; form-action 'self'" in stage_html
    assert "https://snvzwrexuqavnfvzgxqj.supabase.co;" not in stage_html
    assert "Content-Security-Policy" not in prod_html
    assert 'href="/_preview/school-report.html"' in stage_html
    assert 'src="/_preview/js/site.js"' in stage_html
    assert 'href="/school-report.html"' in prod_html
    assert 'src="/js/site.js"' in prod_html
    assert "STAGE_JS" in (out / "_preview/js/site.js").read_text(encoding="utf-8")
    assert "PROD_JS" in (out / "js/site.js").read_text(encoding="utf-8")
    # A pinned staging SHA must not inherit production API endpoints or keys.
    # The published production snapshot must remain byte-for-byte as before.
    live_ref = "snvzwrexuqavnfvzgxqj"
    stage_ref = "ycwuugggqbunlbwuzvbx"
    live_key = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2"
    stage_key = "sb_publishable_c8h7TaIYONfP56Zc05K0Sw_SxyT3lZU"
    prod_config = (out / "js/supabase-config.js").read_text()
    stage_config = (out / "_preview/js/supabase-config.js").read_text()
    assert live_ref in prod_config and live_key in prod_config
    assert stage_ref in stage_config and stage_key in stage_config
    assert live_ref not in stage_config and live_key not in stage_config
    assert live_ref in (out / "styles/api.css").read_text()
    assert stage_ref in (out / "_preview/styles/api.css").read_text()
    assert live_ref in (out / "assets/endpoints.json").read_text()
    assert stage_ref in (out / "_preview/assets/endpoints.json").read_text()
    for published in (out / "_preview").rglob("*"):
        if published.is_file() and published.suffix.lower() in (
            ".html", ".js", ".mjs", ".json", ".css", ".webmanifest", ".xml", ".svg"
        ):
            body = published.read_text(encoding="utf-8")
            assert live_ref not in body and live_key not in body, published
    assert "STAGE_REPORT" in (out / "_preview/school-report.html").read_text(encoding="utf-8")
    assert "PROD_REPORT" in (out / "school-report.html").read_text(encoding="utf-8")
    assert (out / "CNAME").read_text().strip() == "baeguindex.com"
    assert not (out / "_preview/CNAME").exists()
    assert '<meta name="robots" content="noindex,nofollow">' in stage_html
    assert '<meta name="robots" content="noindex,nofollow">' not in prod_html
    assert (out / ".nojekyll").exists()
    assert (out / "_preview/.nojekyll").exists()
    for prefix in (out, out / "_preview"):
        assert (prefix / "data/public-compare-school-directory-v1.json").read_text(
            encoding="utf-8"
        ) == '{"version":"LATEST_ALLOWED_DIRECTORY"}'

    # Fail closed: any page lacking an explicit head must not receive a
    # preview that silently drops the connect-src policy.
    no_head = scratch / "no_head"
    no_head.mkdir()
    put(no_head, "broken.html", "<html><body>NO_HEAD</body></html>")
    try:
        worker.make_preview_banner(no_head)
    except RuntimeError as exc:
        assert "missing <head>" in str(exc)
    else:
        raise AssertionError("headless preview must fail CSP packaging")

    # A separate host must receive its own root-hosted, pinned staging-only
    # artifact, not /_preview/-prefixed links or production HTML/JS/CNAME.
    worker.INDEPENDENT_OUTPUT = scratch / "standalone-stage"
    worker.package_independent_preview()
    standalone = worker.INDEPENDENT_OUTPUT
    standalone_html = (standalone / "index.html").read_text(encoding="utf-8")
    assert "STAGING_NEW" in standalone_html
    assert "PRODUCTION_SAFE" not in standalone_html
    assert 'href="/school-report.html"' in standalone_html
    assert 'src="/js/site.js"' in standalone_html
    assert 'href="/_preview/school-report.html"' not in standalone_html
    assert "독립 시험 후보" in standalone_html
    assert "브라우저 저장공간 공유" not in standalone_html
    assert 'http-equiv="Content-Security-Policy"' in standalone_html
    assert "ycwuugggqbunlbwuzvbx.supabase.co" in standalone_html
    assert not (standalone / "CNAME").exists()
    assert (standalone / ".nojekyll").exists()

    manifest = json.loads((standalone / "stage38-release-manifest.json").read_text(encoding="utf-8"))
    assert manifest["source_sha"] == staging
    assert manifest["environment"] == "isolated-test-package"
    vercel = json.loads((standalone / "vercel.json").read_text(encoding="utf-8"))
    response_headers = {h["key"]: h["value"] for h in vercel["headers"][0]["headers"]}
    assert vercel["headers"][0]["source"] == "/(.*)"
    assert "ycwuugggqbunlbwuzvbx.supabase.co" in response_headers["Content-Security-Policy"]
    assert "snvzwrexuqavnfvzgxqj" not in response_headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in response_headers["Content-Security-Policy"]
    assert response_headers["X-Robots-Tag"].startswith("noindex")
    assert response_headers["X-Frame-Options"] == "DENY"
    assert manifest["deployment_status"] == "unverified"
    assert manifest["supabase_project_ref"] == "ycwuugggqbunlbwuzvbx"
    assert set(manifest["files_sha256"]) == {"index.html", "js/supabase-config.js", "vercel.json"}
    assert all(len(value) == 64 for value in manifest["files_sha256"].values())
    assert "snvzwrexuqavnfvzgxqj" not in json.dumps(manifest)

    assert (standalone / "data/public-compare-school-directory-v1.json").read_text(
        encoding="utf-8") == '{"version":"LATEST_ALLOWED_DIRECTORY"}'
    assert "PROD_JS" in (out / "js/site.js").read_text(encoding="utf-8")
    assert "STAGE_JS" in (standalone / "js/site.js").read_text(encoding="utf-8")
    assert live_ref in (out / "js/supabase-config.js").read_text(encoding="utf-8")
    assert stage_ref in (standalone / "js/supabase-config.js").read_text(encoding="utf-8")
    # Signed release job precondition: never fabricate a standalone artifact
    # from a missing/invalid staging SHA.
    worker.PLAN.write_text(json.dumps({"has_job": True, "staging_sha": None}), encoding="utf-8")
    try:
        worker.package_independent_preview()
    except RuntimeError as exc:
        assert "immutable staging SHA" in str(exc)
    else:
        raise AssertionError("standalone packaging requires approved immutable staging SHA")

    # A rollback to a null staging SHA removes preview, without replacing the
    # previously approved production HTML or JavaScript. Such a rollback is
    # currently queued in the real release manager and must NOT be forced.
    build_with(None)
    assert not (out / "_preview").exists()
    assert "PRODUCTION_SAFE" in (out / "index.html").read_text(encoding="utf-8")
    assert "PROD_JS" in (out / "js/site.js").read_text(encoding="utf-8")
    assert (out / "CNAME").read_text().strip() == "baeguindex.com"

print("PASS: two immutable SHAs isolate approved production from marked preview")
print("PASS: empty staging rollback removes preview only; no live deployment performed")
