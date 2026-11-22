#!/usr/bin/env python3
"""Build a distributable standalone test-site zip source directory for review.

This script creates only local static files from the immutable v1.1.0-rc.1
commit. It does NOT use a real admin approval, call an API, publish a site,
or change any release job. The workflow uploads this folder as a short-lived
review artifact only; production deploys are never allowed from it.
"""
import importlib.util
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
RC_SHA = "5c95aadad971901a8222f83c52e93bf901a3aeb7"
OUTPUT = ROOT / "_preview_standalone_site"

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()

def main():
    if git("cat-file", "-t", RC_SHA) != "commit":
        raise RuntimeError("Pinned v1.1.0-rc.1 commit not available")
    # Remote branch may move independently from the fixed commit. Never
    # silently use another SHA even if a future branch points elsewhere.
    remote_rc = git("rev-parse", "refs/remotes/origin/release/v1.1.0-rc.1")
    if remote_rc != RC_SHA:
        raise RuntimeError("RC branch no longer matches pinned candidate")
    spec = importlib.util.spec_from_file_location(
        "stage38_worker", ROOT / "scripts/release-manager/worker.py"
    )
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    worker.ROOT = ROOT
    worker.INDEPENDENT_OUTPUT = OUTPUT
    with tempfile.TemporaryDirectory(prefix="stage38-offline-review-plan-") as folder:
        worker.PLAN = pathlib.Path(folder) / "synthetic-offline-job.json"
        worker.PLAN.write_text(json.dumps({
            "has_job": True,
            "staging_sha": RC_SHA
        }), encoding="utf8")
        worker.package_independent_preview()
    if not (OUTPUT / "index.html").is_file() or (OUTPUT / "CNAME").exists():
        raise RuntimeError("Unusable standalone review distribution")
    print("OFFLINE REVIEW ARTIFACT BUILT: " + str(OUTPUT))
    print("PINNED RC: " + RC_SHA)
    print("NO LIVE DEPLOYMENT. This distribution is for owner review only.")

if __name__ == "__main__":
    main()
