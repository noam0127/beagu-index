#!/usr/bin/env python3
"""Stage 38: offline packaging audit against the actual pinned GitHub RC SHA.

The plan below is *synthetic* and only used for a local CI packaging test.
It is not an authorized release job, does not call Supabase, and does not
deploy or modify main, the RC commit, or any website.
"""
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

    config = (out / "js/supabase-config.js").read_text(encoding="utf-8")
    assert STAGING_REF in config and STAGING_KEY in config
    assert PRODUCTION_REF not in config and PRODUCTION_KEY not in config
    assert "https://" + STAGING_REF + ".supabase.co" in config

    html_count = 0
    static_count = 0
    links_to_production = 0
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
        links_to_production += len(re.findall(r"https://(?:www\.)?baeguindex\.com", body))
    assert html_count >= 1 and static_count >= html_count

    # Report rather than conceal navigation out of the staging host.
    # Nonzero links are a separate security review gate, not clearance.
    print("PASS: real immutable RC standalone bundle packaged entirely offline")
    print("Source pinned RC:", RC_SHA)
    print("HTML files:", html_count, "audited text files:", static_count)
    print("Remaining explicit production-site URL references:", links_to_production)
    print("NOTE: production-domain links require manual triage before live account QA.")
    print("NOTE: this synthetic plan is NOT a deploy approval and no website was published.")
