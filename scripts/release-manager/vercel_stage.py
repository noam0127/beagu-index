#!/usr/bin/env python3
"""Deploy only a pinned, sanitized static candidate to the independent test project."""
import hashlib, json, os, pathlib, re, subprocess, tempfile, time, urllib.request
from worker import ROOT, read_plan, archive, overlay_approved_directory

TEAM = "team_bSH5LPm82iDkTvE4ly21mrDg"
PROJECT = "prj_AfPd5IvdT6DlIJkTuSfGxu2PaVVA"
HOST = "baegu-index-test.vercel.app"
ORIGIN = "https://" + HOST + "/"
PROD = "snvzwrexuqavnfvzgxqj"
STAGE = "ycwuugggqbunlbwuzvbx"

def request(method, route, body=None, extra=None):
    token = os.environ.get("VERCEL_TOKEN")
    if not token:
        raise RuntimeError("Independent stage Vercel token is not configured")
    sep = "&" if "?" in route else "?"
    req = urllib.request.Request("https://api.vercel.com" + route + sep + "teamId=" + TEAM,
        data=body, method=method, headers={"Authorization":"Bearer "+token, **(extra or {})})
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read()
        return json.loads(raw) if raw else {}

def main():
    plan = read_plan()
    sha = plan.get("staging_sha")
    if plan.get("target") != "staging" or not re.fullmatch(r"[0-9a-f]{40}", sha or ""):
        raise RuntimeError("Only an approved pinned staging job is accepted")
    with tempfile.TemporaryDirectory() as tmp:
        source = pathlib.Path(tmp) / "source"
        archive(sha, source)
        overlay_approved_directory(source)
        # Use trusted packager from the controller checkout, never execute candidate code.
        subprocess.run(["node", str(ROOT / "scripts/build-vercel-test-mirror.mjs")], cwd=source,
                       env={**os.environ, "BEAGU_SOURCE_SHA":sha, "VERCEL_PROJECT_PRODUCTION_URL":HOST}, check=True)
        out = source / "dist"
        manifest = json.loads((out/"test-mirror-version.json").read_text())
        if manifest.get("productionBaseline") != sha or manifest.get("stageRef") != STAGE:
            raise RuntimeError("Mirror manifest mismatch")
        config = json.loads((ROOT/"vercel-stage-config.json").read_text())
        config.pop("buildCommand",None)
        config.pop("outputDirectory",None)
        config.pop("installCommand",None)
        (out/"vercel.json").write_text(json.dumps(config))
        files=[]
        for file in sorted(out.rglob("*")):
            if not file.is_file(): continue
            data=file.read_bytes()
            digest=hashlib.sha1(data).hexdigest()
            request("POST","/v2/files",data,{"Content-Type":"application/octet-stream","x-vercel-digest":digest,"Content-Length":str(len(data))})
            files.append({"file":file.relative_to(out).as_posix(),"sha":digest,"size":len(data)})
        payload={"name":"baegu-index-test","project":PROJECT,"target":"production","files":files,
                 "projectSettings":{"framework":None,"buildCommand":None,"installCommand":None,"outputDirectory":None,"rootDirectory":None},
                 "meta":{"approvedStageSha":sha,"releaseJobId":plan["job_id"]}}
        d=request("POST","/v13/deployments",json.dumps(payload).encode(),{"Content-Type":"application/json"})
        deployment=d.get("id")
        if not re.fullmatch(r"dpl_[A-Za-z0-9]+",deployment or ""): raise RuntimeError("Missing deployment ID")
        deadline=time.monotonic()+360
        while time.monotonic()<deadline:
            d=request("GET","/v13/deployments/"+deployment)
            if d.get("readyState")=="READY":
                if d.get("projectId")!=PROJECT and (d.get("project") or {}).get("id")!=PROJECT:
                    raise RuntimeError("Wrong Vercel project")
                if d.get("meta",{}).get("approvedStageSha")!=sha: raise RuntimeError("Deployment SHA mismatch")
                if HOST in (d.get("alias") or []):
                    alias=request("GET","/v4/aliases/"+HOST)
                    if (alias.get("deploymentId") or (alias.get("deployment") or {}).get("id"))!=deployment:
                        raise RuntimeError("Canonical alias mismatch")
                    (ROOT/".stage-proof.json").write_text(json.dumps({"verified_stage_sha":sha,"verified_stage_url":ORIGIN,"verified_deployment_id":deployment}))
                    print("Independent staging ready",sha[:8],deployment)
                    return
            if d.get("readyState") in ("ERROR","CANCELED","BLOCKED"): raise RuntimeError("Stage deployment failed")
            time.sleep(8)
        raise RuntimeError("Stage deployment not verified before deadline")
if __name__=="__main__": main()
