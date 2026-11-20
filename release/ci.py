"""Actions adapter. Credentials and temporary signed URLs stay out of step outputs."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

def call(action, **params):
    req=urllib.request.Request(os.environ["RELEASE_API"], data=json.dumps(dict(action=action,**params)).encode(),
        headers={"Authorization":"Bearer "+os.environ["RELEASE_SECRET"],"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=45) as response:
        return json.load(response)

def git(*args):
    return subprocess.check_output(["git",*args],text=True).strip()

action=sys.argv[1]
run=int(os.environ["GITHUB_RUN_ID"])
archive=Path("website.tar")
if action=="register":
    base=call("baseline") or os.environ["INITIAL_PRODUCTION_SHA"]
    sha=git("rev-parse","HEAD")
    commits=git("log","--format=%H %s",base+".."+sha).splitlines()
    files=git("diff","--name-status",base,sha).splitlines()
    import re
    prs=sorted(set(re.findall(r"#(\d+)", "\n".join(commits))))
    version="1."+os.environ["GITHUB_RUN_NUMBER"]
    call(action,candidate=run,sha=sha,version=version,title="배구지수 웹 "+version+" 업데이트",
         notes="\n".join(x[41:] for x in commits[:20]),changes=dict(base=base,files=files,commits=commits,prs=prs))
elif action=="tested":
    passed=os.environ["JOB_STATUS"]=="success"
    checks=json.loads(Path("checks.json").read_text()) if Path("checks.json").exists() else []
    checks.append(dict(name="보호된 테스트 웹 게시 및 SHA 검증",state="passed" if passed else "failed"))
    digest=None
    if passed:
        content=archive.read_bytes()
        digest=hashlib.sha256(content).hexdigest()
        url=call("upload",digest=digest)["url"]
        # Upload exactly once per newly built archive.
        with urllib.request.urlopen(urllib.request.Request(url,data=content,method="PUT",headers={"Content-Type":"application/octet-stream"}),timeout=90): pass
    call(action,candidate=run,result="passed" if passed else "failed",checks=checks,digest=digest)
elif action=="claim":
    data=call(action,request=os.environ["REQUEST_ID"],run=run)
    with urllib.request.urlopen(data["url"],timeout=90) as res:
        content=res.read()
    if hashlib.sha256(content).hexdigest()!=data["candidate"]["digest"]:
        raise SystemExit("승인 산출물 SHA-256 불일치")
    archive.write_bytes(content)
    Path("expected-sha").write_text(data["candidate"]["sha"])
elif action=="finish":
    call(action,request=os.environ["REQUEST_ID"],run=run,result=os.environ["JOB_STATUS"],reason=os.environ.get("FAILURE_STEP",""))
