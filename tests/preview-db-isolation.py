#!/usr/bin/env python3
"""Regression: preview cannot reuse live API keys, runtime URLs, or survey links.

Runs on a disposable local GitHub Actions artifact only. NEVER calls real auth,
survey, release, or Supabase endpoints and NEVER deploys.
"""
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
worker_path = ROOT / "scripts/release-manager/worker.py"
spec = importlib.util.spec_from_file_location("beagu_release_worker", worker_path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()

with tempfile.TemporaryDirectory() as temporary:
    directory = pathlib.Path(temporary)
    worker.ROOT = ROOT
    worker.PLAN = directory / "release-job.json"
    worker.OUTPUT = directory / "release-site"
    worker.PLAN.write_text(json.dumps({
        "has_job": True,
        "production_sha": sha,
        "staging_sha": sha
    }), encoding="utf-8")
    worker.build()  # Offline archive only; does not invoke worker api or publish.
    production = worker.OUTPUT
    preview = production / "_preview"
    live_config = (production / "js/supabase-config.js").read_text(encoding="utf-8")
    staging_config = (preview / "js/supabase-config.js").read_text(encoding="utf-8")
    assert worker.PRODUCTION_PROJECT in live_config, "Production configuration was unexpectedly rewritten"
    assert worker.PRODUCTION_PUBLIC_KEY in live_config, "Live key should remain unchanged in root snapshot"
    assert worker.STAGING_PROJECT in staging_config
    assert worker.STAGING_PUBLIC_KEY in staging_config
    assert worker.PRODUCTION_PROJECT not in staging_config
    assert worker.PRODUCTION_PUBLIC_KEY not in staging_config

    # Explicitly check auth, level API, admin API, and the referral handoff.
    for path in ("js/beagu-level-state-v1.js",
                 "js/beagu-participation-auth-v2.js",
                 "js/beagu-admin-updates-v1.js",
                 "js/beagu-referral-form-v1.js",
                 "js/beagu-referral-form-config-v1.js",
                 "r/index.html"):
        text = (preview / path).read_text(encoding="utf-8")
        assert worker.PRODUCTION_PROJECT not in text, path
        assert worker.PRODUCTION_PUBLIC_KEY not in text, path

    survey_config = (preview / "js/beagu-referral-form-config-v1.js").read_text(encoding="utf-8")
    assert worker.PREVIEW_SURVEY_DISABLED in survey_config
    assert "docs.google.com/forms/d/e/" not in survey_config
    assert worker.PREVIEW_SURVEY_DISABLED in (
        preview / "staging-survey-disabled.html"
    ).read_text(encoding="utf-8") or (preview / "staging-survey-disabled.html").is_file()
    assert not (preview / "supabase").exists(), "Deployable preview must not publish SQL/Functions source"
    assert not (preview / "tests").exists(), "Deployable preview must not publish test files"

    # Every preview HTML is forced to isolated connect-src & no direct form posts.
    for path in (preview / "index.html", preview / "challenge.html",
                 preview / "r/index.html", preview / "admin-updates.html"):
        html = path.read_text(encoding="utf-8")
        assert worker.PREVIEW_CSP in html, str(path)
        assert 'form-action \'none\'' in html, str(path)
        assert "beagu-preview-navigation-guard.js" in html, str(path)

    worker.verify_isolated_preview(preview)
    index = preview / "index.html"
    original = index.read_text(encoding="utf-8")
    try:
        index.write_text(original + worker.PRODUCTION_PROJECT, encoding="utf-8")
        try:
            worker.verify_isolated_preview(preview)
        except RuntimeError as error:
            assert "Live Supabase reference" in str(error)
        else:
            raise AssertionError("Audit should fail closed on live Supabase ID")
    finally:
        index.write_text(original, encoding="utf-8")
    worker.verify_isolated_preview(preview)
    print("PASS: source archive unchanged for production, staging only URLs and public key, CSP, survey exclusion, fail-closed audit")
