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
    put(repo, "js/site.js", "window.mock='PROD_JS'; window.backend='https://snvzwrexuqavnfvzgxqj.supabase.co';")
    put(repo, "js/supabase-config.js", "window.SUPABASE_URL='https://snvzwrexuqavnfvzgxqj.supabase.co';")
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
    put(repo, "js/site.js", "window.mock='STAGE_JS'; window.backend='https://snvzwrexuqavnfvzgxqj.supabase.co';")
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
    assert 'href="/_preview/school-report.html"' in stage_html
    assert 'src="/_preview/js/site.js"' in stage_html
    assert 'href="/school-report.html"' in prod_html
    assert 'src="/js/site.js"' in prod_html
    assert "STAGE_JS" in (out / "_preview/js/site.js").read_text(encoding="utf-8")
    assert "PROD_JS" in (out / "js/site.js").read_text(encoding="utf-8")
    # Live backend URLs and public keys MUST be rewritten only in preview.
    assert "snvzwrexuqavnfvzgxqj" in (out / "js/supabase-config.js").read_text(encoding="utf-8")
    assert "ycwuugggqbunlbwuzvbx" not in (out / "js/supabase-config.js").read_text(encoding="utf-8")
    assert "ycwuugggqbunlbwuzvbx" in (out / "_preview/js/supabase-config.js").read_text(encoding="utf-8")
    for asset in (out / "_preview").rglob("*"):
        if asset.is_file() and asset.suffix.lower() in (".js", ".mjs", ".html"):
            assert "snvzwrexuqavnfvzgxqj" not in asset.read_text(encoding="utf-8"), asset
    assert "snvzwrexuqavnfvzgxqj" in (out / "js/site.js").read_text(encoding="utf-8")
    assert "ycwuugggqbunlbwuzvbx" in (out / "_preview/js/site.js").read_text(encoding="utf-8")
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

    # A rollback to a null staging SHA removes preview, without replacing the
    # previously approved production HTML or JavaScript. Such a rollback is
    # currently queued in the real release manager and must NOT be forced.
    build_with(None)
    assert not (out / "_preview").exists()
    assert "PRODUCTION_SAFE" in (out / "index.html").read_text(encoding="utf-8")
    assert "PROD_JS" in (out / "js/site.js").read_text(encoding="utf-8")
    assert (out / "CNAME").read_text().strip() == "baeguindex.com"

# A missing or unexpected preview config must abort before it can be deployed.
with tempfile.TemporaryDirectory(prefix="beagu-preview-negative-") as root_dir:
    empty = pathlib.Path(root_dir)
    try:
        worker.isolate_preview_backend(empty)
    except RuntimeError as exc:
        assert "missing" in str(exc).lower()
    else:
        raise AssertionError("Preview without Supabase config must fail closed")

print("PASS: two immutable SHAs isolate approved production from marked preview")
print("PASS: candidate preview uses staging Supabase only, denies missing config")
print("PASS: empty staging rollback removes preview only; no live deployment performed")
