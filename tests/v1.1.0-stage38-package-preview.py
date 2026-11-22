#!/usr/bin/env python3
"""Stage38: package the immutable RC as an offline downloadable preview.

This is NOT a GitHub Pages deployment; no signed release job is enqueued and
no Supabase credentials or production data are written.
"""
import importlib.util
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
rc=json.loads((ROOT/"docs/releases/v1.1.0-rc.1.json").read_text("utf8"))
staging=rc["immutable_candidate"]["commit_sha"]
prod="5950755c8174788d7bb1fa879be73a15f25d9ae2"
assert re.fullmatch("[a-f0-9]{40}",staging)
assert re.fullmatch("[a-f0-9]{40}",prod)
assert staging!=prod
spec=importlib.util.spec_from_file_location("beagu_release_worker",ROOT/"scripts/release-manager/worker.py")
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
worker.ROOT=ROOT
worker.PLAN=ROOT/".release-stage38-job.json"
worker.OUTPUT=ROOT/"_stage38_site"
worker.PLAN.write_text(json.dumps({"has_job":True,"production_sha":prod,"staging_sha":staging}),encoding="utf8")
try:
    worker.build()
finally:
    worker.PLAN.unlink(missing_ok=True)
preview=worker.OUTPUT/"_preview"
assert (preview/"index.html").is_file()
assert not (preview/"CNAME").exists()
index=(preview/"index.html").read_text("utf8")
assert 'beagu-preview-watermark' in index
assert 'noindex,nofollow' in index
config=(preview/"js/supabase-config.js").read_text("utf8")
assert "ycwuugggqbunlbwuzvbx" in config
assert "snvzwrexuqavnfvzgxqj" not in config
for path in preview.rglob("*"):
    if path.is_file() and path.suffix.lower() in {".js",".html",".mjs"}:
        assert "snvzwrexuqavnfvzgxqj" not in path.read_text("utf8"),path
meta={
    "candidate":"v1.1.0-rc.1",
    "source_sha":staging,
    "production_snapshot_sha":prod,
    "environment":"offline-preview",
    "published":False,
    "backend":"isolated-staging-supabase",
    "production_release":"NO_GO",
    "note":"Static preview package only. Requires administrator AAL2 for online staging."
}
(preview/"stage38-package.json").write_text(json.dumps(meta,indent=2)+"\n","utf8")
print("PASS: exact RC SHA locally packed; preview/backend isolation and private source verified.")
print("DEPLOYMENT: NOT PUBLISHED. This artifact is not the live /_preview site.")
