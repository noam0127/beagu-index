#!/usr/bin/env python3
"""Stage38 final read-only production/preview readiness probe.

Never uses an admin token, service_role, database mutation, or deployment API.
A website's HTTP 200 cannot prove that its version SHA matches an RC.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import re
import urllib.request
from urllib.error import HTTPError, URLError

ROOT=Path(__file__).resolve().parents[1]
rc=json.loads((ROOT/"docs/releases/v1.1.0-rc.1.json").read_text("utf8"))
stage=json.loads((ROOT/"docs/releases/v1.1.0-stage38-staging-state.json").read_text("utf8"))
assert rc["immutable_candidate"]["commit_sha"]==stage["rc_sha"]
assert stage["production_release_allowed"] is False
assert stage["staging_release_complete"] is False
assert rc["deployment"]["production_release"]=="NO_GO"

BASE="https://baeguindex.com"
paths={
 "production_home":"/",
 "preview_home":"/_preview/",
 "release_dashboard":"/admin-updates.html",
 "release_client":"/js/beagu-admin-updates-v1.js",
 "preview_release_dashboard":"/_preview/admin-updates.html"
}

def get(path):
    req=urllib.request.Request(BASE+path,headers={
        "User-Agent":"beagu-stage38-read-only-preflight/1.0",
        "Cache-Control":"no-cache",
    })
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            return response.status,response.url,response.read(1_000_000).decode("utf8","replace")
    except (HTTPError, URLError,TimeoutError) as exc:
        raise RuntimeError("Read-only web fetch failed for "+path+" ("+type(exc).__name__+")") from exc

results={}
for key,path in paths.items():
    status,url,body=get(path)
    assert status==200,(key,status)
    assert url.startswith(BASE+"/"),"Unexpected site host"
    results[key]={"status":status,"path":path,"size":len(body)}
    if key.endswith("_home"):
        assert "<html" in body.lower()
    elif key.endswith("dashboard"):
        assert "release" in body.lower() or "업데이트" in body
    else:
        assert "release" in body.lower() or "업데이트" in body
    if key=="preview_home":
        assert "beagu-preview-watermark" in body,"Preview is not visibly isolated"
    if key=="release_dashboard":
        results[key]["candidate_register_ui_present"]="id=\"releaseCandidateRegister\"" in body
    if key=="release_client":
        results[key]["candidate_register_action_present"]='register_stage_candidate' in body

# This public UI probe is advisory only. A marker appearing on the page is
# not proof that a privileged release API is installed or that an RC was deployed.
record={
 "stage":38,
 "candidate":rc["version"],
 "expected_candidate_sha":rc["immutable_candidate"]["commit_sha"],
 "published_staging_sha_last_server_read":stage["published_staging_sha"],
 "published_production_sha_last_server_read":stage["published_production_sha"],
 "candidate_sha_matches_recorded_staging":stage["rc_sha"]==stage["published_staging_sha"],
 "production_release_approved":False,
 "live_owner_aal2_verified":False,
 "read_only_http":results,
 "published_admin_client_has_rc_support":
   results["release_dashboard"]["candidate_register_ui_present"] and
   results["release_client"]["candidate_register_action_present"],
 "evaluation":"BLOCKED_NOT_DEPLOYED",
 "next_step":"Admin must separately verify active owner AAL2, live candidate API, exact staging SHA and CI release job success.",
 "warning":"HTTP 200 and client-side UI cannot prove actual deployed RC code or admin authorization."
}
assert record["candidate_sha_matches_recorded_staging"] is False
assert record["evaluation"]=="BLOCKED_NOT_DEPLOYED"
path=Path(os.environ.get("BEAGU_STAGE38_REPORT","stage38-readiness.json"))
path.write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
print("PASS: public production/preview/release dashboard read-only HTTP endpoints responded.")
print("STAGE38 LIVE UI RC REGISTRATION:",record["published_admin_client_has_rc_support"])
print("STAGE38 ACTUAL RC STAGING:",record["candidate_sha_matches_recorded_staging"])
print("STAGE38 DEPLOYMENT:",record["evaluation"])
print("No user account, GitHub Pages publish, DB mutation or GitHub Actions release job was created.")
