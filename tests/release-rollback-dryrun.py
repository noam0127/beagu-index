#!/usr/bin/env python3
"""Offline code rollback drill (no deployment, no database or remote API writes)."""
import hashlib
import importlib.util
import json
import pathlib
import re
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASELINE = ROOT / "docs/releases/v1.1.0-rollback-baseline.json"
manifest = json.loads(BASELINE.read_text(encoding="utf-8"))
source = ROOT / "scripts/release-manager/worker.py"
spec = importlib.util.spec_from_file_location("beagu_release_worker", source)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)

def version_tree(sha):
    assert re.fullmatch(r"[a-f0-9]{40}", sha), sha
    git("cat-file", "-e", sha + "^{commit}")
    return sha

prod = version_tree(manifest["production"]["sha"])
stage = version_tree(manifest["staging"]["sha"])
head = git("rev-parse", "HEAD").decode("ascii").strip()
assert manifest["database"]["writes_blocked_until_backup_verified"], "DB safety gate removed"
assert not manifest["database"]["recovery_export_verified"], "Never claim a verified DB export without evidence"

with tempfile.TemporaryDirectory(prefix="beagu-rollback-dryrun-") as directory:
    work = pathlib.Path(directory)
    worker.ROOT = ROOT
    worker.PLAN = work / "job.json"
    worker.OUTPUT = work / "release_site"

    def assemble(production_sha, staging_sha):
        worker.PLAN.write_text(json.dumps({
            "has_job": True,
            "production_sha": production_sha,
            "staging_sha": staging_sha
        }), encoding="utf-8")
        worker.build()
        return (worker.OUTPUT / "index.html").read_bytes()

    def verify_production(sha):
        # Git archive preserves immutable index/CNAME/config byte for byte.
        for path in ("index.html", "CNAME", "js/supabase-config.js"):
            actual = (worker.OUTPUT / path).read_bytes()
            expected = git("show", sha + ":" + path)
            assert hashlib.sha256(actual).digest() == hashlib.sha256(expected).digest(), path
        assert (worker.OUTPUT / "CNAME").read_text(encoding="utf-8").strip() == "baeguindex.com"

    original = assemble(prod, stage)
    verify_production(prod)
    preview = worker.OUTPUT / "_preview"
    worker.verify_isolated_preview(preview)
    assert "beagu-preview-watermark" in (preview / "index.html").read_text(encoding="utf-8")
    assert worker.STAGING_PROJECT in (preview / "js/supabase-config.js").read_text(encoding="utf-8")
    assert worker.PRODUCTION_PROJECT not in (preview / "js/supabase-config.js").read_text(encoding="utf-8")

    # Simulate a later code candidate becoming production, then roll its pointer
    # back to the pinned production SHA. This never calls GitHub Pages or Supabase.
    assemble(head, stage)
    restored = assemble(prod, stage)
    verify_production(prod)
    assert hashlib.sha256(restored).digest() == hashlib.sha256(original).digest()
    print("PASS: immutable Git code baseline restored byte-for-byte")

    # Deliberately invalid rollback target must fail closed, not publish.
    try:
        assemble("not_a_valid_sha", stage)
    except ValueError:
        print("PASS: non-immutable release pointer rejected")
    else:
        raise AssertionError("unsafe rollback pointer accepted")

print("PASS: read-only artifact rollback drill; DB restore NOT verified and DB writes remain blocked")
