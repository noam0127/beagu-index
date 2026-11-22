#!/usr/bin/env python3
"""Offline packaging smoke: preview and production should contain working HTML."""
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
with tempfile.TemporaryDirectory() as temp:
    worker.ROOT = root
    worker.PLAN = pathlib.Path(temp) / "job.json"
    worker.OUTPUT = pathlib.Path(temp) / "website"
    worker.PLAN.write_text(json.dumps({"has_job": True,
       "production_sha":sha,"staging_sha":sha}),encoding="utf8")
    worker.build()
    assert (worker.OUTPUT / "index.html").exists()
    preview = worker.OUTPUT / "_preview/index.html"
    assert preview.exists()
    source = preview.read_text(encoding="utf8")
    assert 'beagu-preview-watermark' in source
    assert '시험 웹' in source
    assert (worker.OUTPUT / "CNAME").read_text().strip()=="baeguindex.com"
    health=json.loads((worker.OUTPUT / "_preview/beagu-preview-health.json").read_text(encoding="utf8"))
    assert health["staging_sha"] == sha
    assert health["kind"] == "staging" and health["schema"] == 1
    assert health["supabase_ref"] == "ycwuugggqbunlbwuzvbx"
    assert not (worker.OUTPUT / "beagu-preview-health.json").exists()
print("PASS: immutable production snapshot + marked preview")
