#!/usr/bin/env python3
"""Trusted GitHub Actions Pages publisher. No GitHub PAT or secrets needed.

A signed GitHub Actions OIDC identity authorizes claims/acks to the
MFA-protected Supabase release queue. Every artifact uses immutable SHAs.
"""
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
API = "https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-release-manager-v1"
PUBLIC_KEY = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2"
PLAN = ROOT / ".release-job.json"
OUTPUT = ROOT / "_release_site"
SHA = re.compile(r"^[0-9a-f]{40}$")
AUDIENCE = "beagu-release-worker"


def token():
    endpoint = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    credential = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not endpoint or not credential:
        raise RuntimeError("This command must run in GitHub Actions with id-token: write")
    separator = "&" if "?" in endpoint else "?"
    url = endpoint + separator + "audience=" + AUDIENCE
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + credential})
    with urllib.request.urlopen(req, timeout=15) as response:
        value = json.load(response)["value"]
    if not value:
        raise RuntimeError("OIDC token is missing")
    return value


def api(action, **fields):
    body = json.dumps({"action": action, **fields}).encode()
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Authorization": "Bearer " + token(),
        "Content-Type": "application/json",
        "apikey": PUBLIC_KEY,
        "User-Agent": "beaguindex-release-controller-v1",
    })
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)


def output(name, value):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf8") as file:
            file.write(name + "=" + str(value) + "\n")
    print(name + ": " + str(value))


def read_plan():
    if not PLAN.is_file():
        raise RuntimeError("Release job was not claimed")
    plan = json.loads(PLAN.read_text(encoding="utf8"))
    if not plan.get("has_job"):
        raise RuntimeError("No active release job")
    return plan


def archive(sha, destination):
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError("Not an immutable Git commit SHA")
    destination.mkdir(parents=True, exist_ok=True)
    # Git archive only includes tracked files from the vetted repository SHA.
    subprocess.run(["bash", "-eo", "pipefail", "-c",
                    "git archive --format=tar " + sha + " | tar -xf - -C " + str(destination)],
                   cwd=ROOT, check=True)
    if not (destination / "index.html").is_file():
        raise RuntimeError("Website build is missing index.html")


def overlay_approved_directory(target):
    # Only this previously approved public JSON artifact may bypass code-release approval.
    # Never overlay JS, HTML, workflows, or SQL from an unapproved main commit.
    subprocess.run(["bash", "-eo", "pipefail", "-c",
      "git archive --format=tar HEAD data/public-compare-school-directory-v1.json | "
      "tar -xf - -C " + str(target)], cwd=ROOT, check=True)


def stamp_release_metadata(target, sha, environment):
    """Stamp the selected archive with its immutable source SHA; publication time is not fabricated."""
    file = target / "release-info.json"
    if not file.is_file():
        return
    meta = json.loads(file.read_text(encoding="utf8"))
    if meta.get("schema") != 1 or not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?", meta.get("version", "")):
        raise RuntimeError("Invalid release metadata")
    if not SHA.fullmatch(sha):
        raise RuntimeError("Invalid release SHA")
    import datetime
    meta.update(environment=environment, commit=sha, builtAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), deployedAt=None)
    file.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def build():
    plan = read_plan()
    production = plan.get("production_sha")
    if plan.get("staging_sha") is not None:
        raise RuntimeError("Retired staging route must not publish a preview")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    archive(production, OUTPUT)
    overlay_approved_directory(OUTPUT)
    stamp_release_metadata(OUTPUT, production, "production")
    # Internal roadmap is not part of the public site artifact.
    (OUTPUT / "development-roadmap.json").unlink(missing_ok=True)
    if (OUTPUT / "CNAME").read_text(encoding="utf8").strip() != "baeguindex.com":
        raise RuntimeError("Production domain mismatch")
    (OUTPUT / ".nojekyll").touch()
    print("Build ready:", str(OUTPUT), "prod", production[:8], "direct only")


def main():
    op = sys.argv[1] if len(sys.argv) > 1 else ""
    if op == "next":
        sha = os.environ["GITHUB_SHA"]
        if not SHA.fullmatch(sha):
            raise ValueError("Untrusted GitHub SHA")
        data_blob = subprocess.check_output([
            "git", "rev-parse", "HEAD:data/public-compare-school-directory-v1.json"],
            cwd=ROOT, text=True).strip()
        if not SHA.fullmatch(data_blob):
            raise RuntimeError("Approved public directory is missing")
        plan = api("worker_next", head_sha=sha, data_blob_sha=data_blob)
        PLAN.write_text(json.dumps(plan), encoding="utf8")
        output("has_job", "true" if plan.get("has_job") else "false")
        if plan.get("has_job"):
            print("Claimed", plan.get("action"), plan.get("job_id"))
    elif op == "build":
        build()
    elif op in ("complete", "fail"):
        plan = read_plan()
        if op == "complete":
            result = api("worker_complete", job_id=plan["job_id"])
        else:
            result = api("worker_fail", job_id=plan["job_id"])
        print("Release worker", op, json.dumps(result, ensure_ascii=False))
    else:
        raise SystemExit("usage: worker.py next|build|complete|fail")


if __name__ == "__main__":
    main()
