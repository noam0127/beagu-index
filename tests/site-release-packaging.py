#!/usr/bin/env python3
"""Offline packaging smoke: deny production, preserve published public data in preview."""
import importlib.util
import json
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release_worker", root / "scripts/release-manager/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
published_blob = subprocess.check_output(
    ["git", "rev-parse", "HEAD:data/public-compare-school-directory-v1.json"],
    cwd=root, text=True,
).strip()
published_bytes = subprocess.check_output(["git", "cat-file", "blob", published_blob], cwd=root)

with tempfile.TemporaryDirectory() as temp:
    worker.ROOT = root
    worker.PLAN = pathlib.Path(temp) / "job.json"
    worker.OUTPUT = pathlib.Path(temp) / "website"
    frozen_job = {
        "has_job": True,
        "target": "production",
        "action": "prod_apply",
        "production_sha": sha,
        "staging_sha": sha,
        "public_data_blob_sha": published_blob,
    }
    worker.PLAN.write_text(json.dumps(frozen_job), encoding="utf8")
    try:
        worker.build()
        raise AssertionError("Production build was allowed despite the stage-3 interlock")
    except RuntimeError as exc:
        assert "Production publication is paused" in str(exc)
    assert not worker.OUTPUT.exists(), "Blocked production job prepared release files"

    frozen_job.update({"target": "staging", "action": "stage_apply"})
    worker.PLAN.write_text(json.dumps(frozen_job), encoding="utf8")
    worker.build()
    assert (worker.OUTPUT / "index.html").exists()
    preview = worker.OUTPUT / "_preview/index.html"
    assert preview.exists()
    source = preview.read_text(encoding="utf8")
    assert 'beagu-preview-watermark' in source
    assert '시험 웹' in source
    assert (worker.OUTPUT / "CNAME").read_text().strip() == "baeguindex.com"
    published_path = pathlib.Path("data/public-compare-school-directory-v1.json")
    assert (worker.OUTPUT / published_path).read_bytes() == published_bytes
    assert (worker.OUTPUT / "_preview" / published_path).read_bytes() == published_bytes

    # Never accept a forged or malformed blob identifier from a release plan.
    frozen_job["public_data_blob_sha"] = "../../unapproved.json"
    worker.PLAN.write_text(json.dumps(frozen_job), encoding="utf8")
    try:
        worker.build()
        raise AssertionError("Untrusted public-data blob identifier was accepted")
    except ValueError as exc:
        assert "Invalid approved public data blob SHA" in str(exc)

print("PASS: production blocked, staging built, published data pinned")
