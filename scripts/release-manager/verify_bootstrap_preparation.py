#!/usr/bin/env python3
"""Read-only bootstrap core inventory check; no network or deployment."""
import json, pathlib, re, subprocess
root=pathlib.Path(__file__).resolve().parents[2]
m=json.loads((root/"docs/bootstrap-preparation-v1.json").read_text())
def require(ok,why):
    if not ok:raise SystemExit(why)
require(m["kind"]=="bootstrap_preparation_only" and m["executable"] is False and m["deployment_authorized"] is False,"invalid scope")
sha=m["verified_source_sha"]
require(re.fullmatch("[0-9a-f]{40}",sha),"invalid source")
seen=set()
for item in m["core_files"]:
    path=item["path"]
    require(not path.startswith("/") and ".." not in path.split("/") and path not in seen,"invalid path")
    seen.add(path)
    expected=item["blob_sha"]
    require(re.fullmatch("[0-9a-f]{40}",expected),"invalid blob")
    actual=subprocess.check_output(["git","rev-parse",sha+":"+path],cwd=root,text=True).strip()
    require(actual==expected,"source mismatch: "+path)
    current=subprocess.check_output(["git","hash-object","--no-filters","--",path],cwd=root,text=True).strip()
    require(current==expected,"working file mismatch: "+path)
require(len(seen)==11 and all(m["observed_gates"].values()) and m["blocked"],"incomplete inventory")
print("PASS: 11 pinned core source files; preparation only; deployment disabled")
