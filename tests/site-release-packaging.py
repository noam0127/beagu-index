#!/usr/bin/env python3
"""Offline packaging smoke: preview is staging-only, production remains immutable."""
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
    live = "snvzwrexuqavnfvzgxqj"
    stage = "ycwuugggqbunlbwuzvbx"
    prod_config = (worker.OUTPUT / "js/supabase-config.js").read_text()
    stage_config = (worker.OUTPUT / "_preview/js/supabase-config.js").read_text()
    assert live in prod_config
    assert live not in stage_config
    assert stage in stage_config
    for file in (worker.OUTPUT / "_preview").rglob("*"):
        if file.is_file() and file.suffix in (".html", ".js", ".mjs"):
            assert live not in file.read_text(encoding="utf-8"), file
    assert live in (worker.OUTPUT / "js/beagu-level-state-v1.js").read_text()
    assert stage in (worker.OUTPUT / "_preview/js/beagu-level-state-v1.js").read_text()
    assert (worker.OUTPUT / "index.html").read_bytes() == (root / "index.html").read_bytes()
    assert (worker.OUTPUT / "_preview/CNAME").exists() is False
    # Fail closed if candidate backend configuration is not the approved live source.
    with tempfile.TemporaryDirectory() as malformed:
        test_root = pathlib.Path(malformed)
        (test_root / "js").mkdir()
        (test_root / "js/supabase-config.js").write_text("unexpected Supabase project", encoding="utf8")
        try:
            worker.isolate_preview_backend(test_root)
            raise AssertionError("Preview isolation accepted an unknown backend")
        except RuntimeError as error:
            assert "Unexpected live Supabase configuration" in str(error)
print("PASS: production unchanged, staging-only preview, unknown backend rejected")
