#!/usr/bin/env python3
"""Read-only release integration smoke against a disposable local build tree.

This does NOT run the deployed staging website or modify any Supabase project.
It exercises the *combined* worker/HTML/Supabase-configuration packaging path.
"""
import importlib.util
import json
import pathlib
import re
import subprocess
import tempfile
import urllib.parse
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "beagu_release_worker_step11", ROOT / "scripts/release-manager/worker.py"
)
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)
sha = subprocess.check_output(
    ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
).strip()
approved_blob = subprocess.check_output(
    ["git", "rev-parse", "HEAD:data/public-compare-school-directory-v1.json"],
    cwd=ROOT, text=True
).strip()
LIVE = "snvzwrexuqavnfvzgxqj"
STAGING = "ycwuugggqbunlbwuzvbx"


class ReferencedAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "script" and data.get("src"):
            self.assets.append(data["src"])
        elif tag == "link" and data.get("rel", "").lower() in (
            "stylesheet", "modulepreload", "preload"
        ) and data.get("href"):
            self.assets.append(data["href"])


def immutable(sha_id, relative):
    return subprocess.check_output(
        ["git", "show", f"{sha_id}:{relative}"], cwd=ROOT
    )


def check_snapshot(root, prefix):
    assert (root / "index.html").is_file()
    assert (root / "js/supabase-config.js").is_file()
    index = (root / "index.html").read_text(encoding="utf8")
    parser = ReferencedAssets()
    parser.feed(index)
    present = 0
    for ref in parser.assets:
        parsed = urllib.parse.urlparse(ref)
        if parsed.scheme or ref.startswith("//") or ref.startswith("data:"):
            continue
        if parsed.path == "":
            continue
        joined = urllib.parse.urljoin("https://baeguindex.com/" + prefix + "index.html", ref)
        relative = urllib.parse.urlparse(joined).path
        assert relative.startswith("/" + prefix), (
            f"{prefix or 'production'} local asset escaped its snapshot: {ref}"
        )
        path = relative.lstrip("/")
        assert (root if prefix == "" else root.parent).joinpath(path).is_file(), (
            f"Missing {prefix or 'production'} asset {ref} -> {path}"
        )
        present += 1
    assert present >= 2, f"HTML contains too few checked local assets: {prefix}"
    return present


with tempfile.TemporaryDirectory() as temp:
    worker.ROOT = ROOT
    worker.PLAN = pathlib.Path(temp) / "plan.json"
    worker.OUTPUT = pathlib.Path(temp) / "pages"
    plan = {
        "has_job": True, "target": "staging", "action": "stage_apply",
        "production_sha": sha, "staging_sha": sha,
        "public_data_blob_sha": approved_blob,
    }
    worker.PLAN.write_text(json.dumps(plan), encoding="utf8")
    worker.build()
    output = worker.OUTPUT
    preview = output / "_preview"

    # A staging build MUST NOT change published root HTML/JS bytes.
    for rel in ("index.html", "js/supabase-config.js", "js/beagu-level-state-v1.js"):
        assert (output / rel).read_bytes() == immutable(sha, rel), (
            f"Root file changed during staging build: {rel}"
        )
    assert (output / "CNAME").read_text(encoding="utf8").strip() == "baeguindex.com"
    assert not (preview / "CNAME").exists()
    assert (preview / ".nojekyll").exists()

    prod_config = (output / "js/supabase-config.js").read_text(encoding="utf8")
    stage_config = (preview / "js/supabase-config.js").read_text(encoding="utf8")
    assert LIVE in prod_config and STAGING not in prod_config
    assert STAGING in stage_config and LIVE not in stage_config

    # Check ALL preview client files, not just the entry page.
    examined = 0
    for file in preview.rglob("*"):
        if file.is_file() and file.suffix.lower() in (".html", ".js", ".mjs"):
            text = file.read_text(encoding="utf8")
            assert LIVE not in text, f"Prod Supabase project leaked: {file}"
            assert "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2" not in text, (
                f"Prod Supabase public key leaked: {file}"
            )
            examined += 1
    assert examined >= 20

    assert "beagu-preview-watermark" in (preview / "index.html").read_text(encoding="utf8")
    assert "noindex,nofollow" in (preview / "index.html").read_text(encoding="utf8")
    prod_assets = check_snapshot(output, "")
    preview_assets = check_snapshot(preview, "_preview/")

    approved = subprocess.check_output(
        ["git", "cat-file", "blob", approved_blob], cwd=ROOT
    )
    for directory in (output, preview):
        assert (directory / "data/public-compare-school-directory-v1.json").read_bytes() == approved

    # A queued production job must not replace an already-built preview.
    original_preview = (preview / "index.html").read_bytes()
    production_plan = dict(plan, target="production", action="prod_apply")
    worker.PLAN.write_text(json.dumps(production_plan), encoding="utf8")
    try:
        worker.build()
        raise AssertionError("A production job bypassed the local build lock")
    except RuntimeError as exc:
        assert "Production publication is paused" in str(exc)
    assert (preview / "index.html").read_bytes() == original_preview

    # Rollback from an unknown / NULL predecessor must not erase preview.
    invalid = dict(plan, action="stage_rollback", staging_sha=None)
    worker.PLAN.write_text(json.dumps(invalid), encoding="utf8")
    try:
        worker.build()
        raise AssertionError("An invalid rollback unexpectedly built")
    except RuntimeError as exc:
        assert "Invalid staging release SHA" in str(exc)
    assert (preview / "index.html").read_bytes() == original_preview

print(
    "PASS: offline integration packaging; immutable root preserved, "
    f"{examined} preview sources isolated, "
    f"{prod_assets} prod and {preview_assets} preview assets resolved; "
    "production/NULL rollback blocked"
)
