#!/usr/bin/env python3
"""Offline packaging smoke: only a pinned production snapshot may contain working HTML."""
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
       "production_sha":sha,"staging_sha":None}),encoding="utf8")
    worker.build()
    assert (worker.OUTPUT / "index.html").exists()
    assert not (worker.OUTPUT / "_preview").exists()
    assert (worker.OUTPUT / "CNAME").read_text().strip()=="baeguindex.com"
print("PASS: immutable production snapshot, no preview")
