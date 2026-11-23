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

    # Any stale preview plan is rejected before publication.
    try:
        build_with(staging)
    except RuntimeError as error:
        assert "Retired staging route" in str(error)
    else:
        raise AssertionError("Staging plan was accepted")
    assert not worker.OUTPUT.exists()

    # Even if HEAD contains a newer unapproved candidate, publish only the
    # selected immutable production SHA and the one approved directory overlay.
    build_with(None)
    out = worker.OUTPUT
    prod_html = (out / "index.html").read_text(encoding="utf-8")
    assert "PRODUCTION_SAFE" in prod_html and "STAGING_NEW" not in prod_html
    assert "beagu-preview-watermark" not in prod_html
    assert 'href="/school-report.html"' in prod_html
    assert 'src="/js/site.js"' in prod_html
    assert "PROD_JS" in (out / "js/site.js").read_text(encoding="utf-8")
    assert "PROD_REPORT" in (out / "school-report.html").read_text(encoding="utf-8")
    assert (out / "CNAME").read_text().strip() == "baeguindex.com"
    assert (out / ".nojekyll").exists()
    assert not (out / "_preview").exists()
    assert (out / "data/public-compare-school-directory-v1.json").read_text(encoding="utf-8") == '{"version":"LATEST_ALLOWED_DIRECTORY"}'
    # Selecting the other SHA explicitly changes production, not a preview.
    worker.PLAN.write_text(json.dumps({"has_job":True,"production_sha":staging,"staging_sha":None}),encoding="utf-8")
    worker.build()
    assert "STAGING_NEW" in (out / "index.html").read_text(encoding="utf-8")
    assert "STAGE_JS" in (out / "js/site.js").read_text(encoding="utf-8")
    assert not (out / "_preview").exists()

print("PASS: selected immutable production only; stale preview plan denied; public directory overlay preserved")
