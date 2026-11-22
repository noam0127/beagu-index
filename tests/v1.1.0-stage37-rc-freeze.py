#!/usr/bin/env python3
"""Step37: verify v1.1.0-rc.1 is the documented exact Git commit.

Read-only with respect to GitHub/Supabase. Builds a temporary local snapshot
using the existing production release packaging worker, without any deploy.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[1]
info=json.loads((ROOT/"docs/releases/v1.1.0-rc.1.json").read_text(encoding="utf-8"))
gate=json.loads((ROOT/"docs/releases/v1.1.0-stage36-gates.json").read_text(encoding="utf-8"))
sha=info["immutable_candidate"]["commit_sha"]
ref="refs/heads/"+info["immutable_candidate"]["branch"]
assert re.fullmatch(r"[0-9a-f]{40}",sha)
assert info["version"]=="v1.1.0-rc.1"
assert info["source"]["commit_sha"]==sha
assert info["status"]=="REGISTERED_NOT_DEPLOYED"
assert info["source"]["pr_number"]==195
assert info["source"]["pr_state"]=="draft"
assert info["candidate_sha_is_authority"] is True
assert info["deployment"]["staging_web_applied"] is False
assert info["deployment"]["production_applied"] is False
assert info["deployment"]["production_authorized"] is False
assert info["deployment"]["production_release"]=="NO_GO"
assert info["integration"]["merge_to_main"] is False
assert gate["production_release"]=="NO_GO"
unmet={v["id"] for v in gate["checks"] if v["status"]=="BLOCKED"}
assert len(unmet)==4, "Production must stay blocked on four unverified gates"
assert {"admin_aal2_positive","approved_2026_real_pipeline",
        "email_delivery","manual_production_approval"}==unmet
assert len(info["blocks"])==4
assert info["changes"]["changed_files_at_snapshot"]>=1
assert info["evidence"]["stage36_static_and_http"]==44971985581
assert info["evidence"]["stage35_security"]==44971548677

def git(*args: str) -> str:
    return subprocess.check_output(
      ["git",*args],cwd=ROOT,text=True,stderr=subprocess.PIPE).strip()

# Source SHA is immutable; a release branch NAME is only a mutable pointer.
remote=git("ls-remote","--heads","origin",ref)
assert len(remote.splitlines())==1, "Release branch must exist on GitHub"
recorded,actual_ref=remote.split()
assert actual_ref==ref
assert recorded==sha, "REJECT: release candidate branch was moved"
assert git("cat-file","-t",sha)=="commit"
assert git("rev-parse",sha+"^{commit}")==sha
main_remote=git("ls-remote","--heads","origin","refs/heads/main")
main_sha=main_remote.split()[0]
assert re.fullmatch(r"[0-9a-f]{40}",main_sha)
assert main_sha!=sha, "Candidate must not be silently promoted to main"

spec=importlib.util.spec_from_file_location(
  "beagu_release_worker",ROOT/"scripts/release-manager/worker.py")
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
with tempfile.TemporaryDirectory(prefix="beagu-rc1-") as folder:
    temp=Path(folder)
    worker.ROOT=ROOT
    worker.PLAN=temp/"plan.json"
    worker.OUTPUT=temp/"published"
    worker.PLAN.write_text(json.dumps({
      "has_job":True,"production_sha":main_sha,"staging_sha":sha
    }),encoding="utf-8")
    worker.build()
    prod=worker.OUTPUT
    preview=prod/"_preview"
    assert (prod/"index.html").is_file()
    assert (preview/"index.html").is_file()
    assert "beagu-preview-watermark" in (preview/"index.html").read_text(encoding="utf-8")
    assert (prod/"CNAME").read_text(encoding="utf-8").strip()=="baeguindex.com"
    assert not (preview/"CNAME").exists()
    pc=(prod/"js/supabase-config.js").read_text(encoding="utf-8")
    sc=(preview/"js/supabase-config.js").read_text(encoding="utf-8")
    prod_ref="snvzwrexuqavnfvzgxqj"
    stage_ref="ycwuugggqbunlbwuzvbx"
    assert prod_ref in pc
    assert prod_ref not in sc and stage_ref in sc
    for p in preview.rglob("*"):
        if p.is_file() and p.suffix.lower() in (".html",".js",".mjs"):
            assert prod_ref not in p.read_text(encoding="utf-8"),p
    assert (preview/"js/beagu-level-state-v1.js").is_file()
    assert (preview/"admin-updates.html").is_file()
print("PASS v1.1.0-rc.1: pinned source SHA equals remote release branch, packaging complete, preview isolated.")
print("RELEASE STATUS: registered candidate ONLY; no web deployment or production release approval.")
