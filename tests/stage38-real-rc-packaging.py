#!/usr/bin/env python3
"""Stage 38: offline packaging audit against the actual pinned GitHub RC SHA.

The plan below is *synthetic* and only used for a local CI packaging test.
It is not an authorized release job, does not call Supabase, and does not
deploy or modify main, the RC commit, or any website.
"""
import hashlib
import importlib.util
import json
import pathlib
import re
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
RC_SHA = "5c95aadad971901a8222f83c52e93bf901a3aeb7"
STAGING_REF = "ycwuugggqbunlbwuzvbx"
PRODUCTION_REF = "snvzwrexuqavnfvzgxqj"
PRODUCTION_KEY = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2"
STAGING_KEY = "sb_publishable_c8h7TaIYONfP56Zc05K0Sw_SxyT3lZU"
TEXT_EXTENSIONS = {".html", ".htm", ".js", ".mjs", ".css", ".json", ".webmanifest", ".xml", ".svg"}

source_type = subprocess.check_output(
    ["git", "cat-file", "-t", RC_SHA], cwd=ROOT, text=True
).strip()
assert source_type == "commit", "The exact pinned release candidate commit was not fetched"

spec = importlib.util.spec_from_file_location(
    "stage38_release_worker", ROOT / "scripts/release-manager/worker.py"
)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

with tempfile.TemporaryDirectory(prefix="stage38-real-rc-audit-") as folder:
    scratch = pathlib.Path(folder)
    worker.ROOT = ROOT
    worker.PLAN = scratch / "synthetic-offline-plan.json"
    worker.INDEPENDENT_OUTPUT = scratch / "standalone"
    worker.PLAN.write_text(json.dumps({
        "has_job": True,
        "staging_sha": RC_SHA,
    }), encoding="utf-8")
    worker.package_independent_preview()
    out = worker.INDEPENDENT_OUTPUT
    assert (out / "index.html").exists()
    assert not (out / "CNAME").exists()
    assert not (out / "_preview").exists()
    assert (out / ".nojekyll").exists()

    manifest = json.loads((out / "stage38-release-manifest.json").read_text(encoding="utf-8"))
    assert manifest["source_sha"] == RC_SHA
    manifest_sha256 = hashlib.sha256(
        (out / "stage38-release-manifest.json").read_bytes()
    ).hexdigest()
    assert manifest["rc_version"] == "v1.1.0-rc.1"
    vercel = json.loads((out / "vercel.json").read_text(encoding="utf-8"))
    response_headers = {h["key"]: h["value"] for h in vercel["headers"][0]["headers"]}
    assert vercel["headers"][0]["source"] == "/(.*)"
    assert "ycwuugggqbunlbwuzvbx.supabase.co" in response_headers["Content-Security-Policy"]
    assert "snvzwrexuqavnfvzgxqj" not in response_headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in response_headers["Content-Security-Policy"]
    assert response_headers["X-Robots-Tag"].startswith("noindex")
    assert response_headers["X-Frame-Options"] == "DENY"
    assert manifest["supabase_project_ref"] == STAGING_REF
    assert manifest["environment"] == "isolated-test-package"
    assert manifest["deployment_status"] == "unverified"
    # git hash-object compares the checked-out RC dataset with a packaged
    # candidate. A newer HEAD dataset must never override this pinned source.
    rc_data = subprocess.check_output(
        ["git", "show", RC_SHA + ":data/public-compare-school-directory-v1.json"],
        cwd=ROOT
    )
    packaged_data = (out / "data/public-compare-school-directory-v1.json").read_bytes()
    assert packaged_data == rc_data, "Unapproved HEAD data overlaid pinned RC"
    assert manifest["files_sha256"]["data/public-compare-school-directory-v1.json"] == hashlib.sha256(
        packaged_data
    ).hexdigest()
    assert {"index.html", "js/supabase-config.js", "vercel.json",
            "data/public-compare-school-directory-v1.json"}.issubset(manifest["files_sha256"])
    assert ".nojekyll" in manifest["files_sha256"]
    published_files = {
        item.relative_to(out).as_posix()
        for item in out.rglob("*")
        if item.is_file() and item.name != "stage38-release-manifest.json"
    }
    assert set(manifest["files_sha256"]) == published_files
    assert all(not item.is_symlink() for item in out.rglob("*"))
    for path, digest in manifest["files_sha256"].items():
        assert re.fullmatch("[0-9a-f]{64}", digest)
        assert __import__("hashlib").sha256((out / path).read_bytes()).hexdigest() == digest

    for private in (".github", "tests", "docs", "supabase", "scripts",
                    "README.md", "wrangler.jsonc", "release-candidate.json",
                    "beagu_challenge_redesign.zip", "lv2-edited-column-schema.json"):
        assert not (out / private).exists(), "non-web sources leaked: " + private
    approved_roots = {"assets", "data", "js", "r", "styles", "\u200bcss", ".nojekyll"}
    for child in out.iterdir():
        assert (child.is_file() and child.suffix.lower() in (".html", ".htm")) or (
            child.is_dir() and child.name in approved_roots
        ) or child.name in {".nojekyll", "stage38-release-manifest.json", "vercel.json"}, "unexpected published root file: " + child.name
    homepage_nav = (out / "teacher-class-diary-play.html").read_text(encoding="utf-8")
    assert "window.location.assign('https://baeguindex.com/')" not in homepage_nav
    assert "window.location.assign('/')" in homepage_nav
    assert "home.href='https://baeguindex.com/'" not in (
        out / "js/class-diary-interface-rebalance-v1.js"
    ).read_text(encoding="utf-8")
    assert 'href="https://baeguindex.com/_preview/"' not in (
        out / "admin-updates.html"
    ).read_text(encoding="utf-8")

    config = (out / "js/supabase-config.js").read_text(encoding="utf-8")
    assert STAGING_REF in config and STAGING_KEY in config
    assert PRODUCTION_REF not in config and PRODUCTION_KEY not in config
    assert "https://" + STAGING_REF + ".supabase.co" in config

    html_count = 0
    static_count = 0
    links_to_production = 0
    production_link_files = {}
    for file in out.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        static_count += 1
        body = file.read_text(encoding="utf-8")
        assert PRODUCTION_REF not in body, str(file.relative_to(out))
        assert PRODUCTION_KEY not in body, str(file.relative_to(out))
        # A standalone host must not have the nested GitHub Pages preview path.
        if file.suffix.lower() == ".html":
            html_count += 1
            assert 'http-equiv="Content-Security-Policy"' in body, str(file.relative_to(out))
            assert "ycwuugggqbunlbwuzvbx.supabase.co" in body, str(file.relative_to(out))
            assert "https://snvzwrexuqavnfvzgxqj.supabase.co" not in body
        link_count = len(re.findall(r"https://(?:www\.)?baeguindex\.com", body))
        links_to_production += link_count
        if link_count:
            production_link_files[str(file.relative_to(out))] = link_count
    assert html_count >= 1 and static_count >= html_count
    # Three remaining references are deliberate only: one visibly labelled
    # "actual web" admin link, plus two SEO canonical URLs in noindex pages.
    # Unexpected new production-domain navigation fails the RC audit.
    expected_production_links = {
        "admin-updates.html": 1,
        "js/challenge.html": 1,
        "result.html": 1,
    }
    assert production_link_files == expected_production_links, (
        "Unreviewed production-domain links in standalone RC: " +
        repr(production_link_files)
    )
    assert 'href="https://baeguindex.com/"' in (
        out / "admin-updates.html"
    ).read_text(encoding="utf-8")
    assert '<link rel="canonical" href="https://baeguindex.com/challenge.html">' in (
        out / "js/challenge.html"
    ).read_text(encoding="utf-8")
    assert '<link rel="canonical" href="https://baeguindex.com/school-report.html">' in (
        out / "result.html"
    ).read_text(encoding="utf-8")

    # Report rather than conceal navigation out of the staging host.
    # Nonzero links are a separate security review gate, not clearance.
    print("PASS: real immutable RC standalone bundle packaged entirely offline")
    print("Source pinned RC:", RC_SHA)
    print("TRUSTED_STAGE38_MANIFEST_SHA256:", manifest_sha256)
    print("Operator must obtain this digest from approved CI, never from the deployed website.")
    print("HTML files:", html_count, "audited text files:", static_count)
    print("Remaining explicit production-site URL references:", links_to_production)
    for rel, count in sorted(production_link_files.items()):
        # Paths and counts only: never print URL query tokens or page source.
        print("PRODUCTION_LINK_REFERENCE:", rel, "count:", count)
    print("NOTE: production-domain links require manual triage before live account QA.")
    print("NOTE: this synthetic plan is NOT a deploy approval and no website was published.")
