#!/usr/bin/env python3
"""Stage38 signed real Git ref publish: OIDC -> isolated DB -> Git A/B/A -> atomic DB.

Uses a unique static-only sandbox branch, never main, Pages or the production DB.
GitHub token stays inside the CI runner and only pushes immutable A/B commits.
"""
import base64
import json
import os
import subprocess
import time
import urllib.error
import urllib.request

REPO="noam0127/beagu-index"
BRANCH="stage38-oidc-atomic-publish-rc-5c95aad"
REMOTE="https://github.com/"+REPO+".git"
URL="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-stage38-signed-publish-worker-once"
AUD="beagu-stage38-signed-publish-worker-qa"
A="037a14afa252c52eaa130d7cbe2e08e649adf5bd"
B="5512e798633eeb8163e8eab20c9ab9678b66f0cd"
RESULTS=[]

def request(url, body=None, headers=None):
    req=urllib.request.Request(url, data=body,
      method="POST" if body is not None else "GET",headers=headers or {})
    try:
        with urllib.request.urlopen(req,timeout=24) as f:return f.status,f.read()
    except urllib.error.HTTPError as exc:return exc.code,exc.read(6500)

def token():
    url=os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL","")
    api_token=os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN","")
    assert url and api_token,"GitHub OIDC unavailable"
    status,data=request(url+("&" if "?" in url else "?")+"audience="+AUD,
      headers={"Authorization":"Bearer "+api_token})
    assert status==200,"GitHub OIDC token issuance denied"
    signed=json.loads(data)["value"]
    assert isinstance(signed,str) and len(signed)>120,"Missing OIDC assertion"
    return signed

def invoke(action,identity=None,**kwargs):
    raw=json.dumps({"action":action,**kwargs},separators=(",",":")).encode()
    headers={"Content-Type":"application/json"}
    if identity:headers["Authorization"]="Bearer "+identity
    status,data=request(URL,body=raw,headers=headers)
    try:return status,json.loads(data)
    except:raise AssertionError("Non-JSON response: "+str(status))

def expect(response,status,error=None):
    code,body=response
    assert code==status,"Unexpected isolated API response HTTP "+str(code)+" (expected "+str(status)+")"
    if error:assert body.get("error")==error,"Unexpected QA error code"
    return body

def git(*args,authorize=False):
    command=["git"]
    if authorize:
        secret=os.environ.get("GH_TOKEN","")
        assert len(secret)>15,"CI GitHub token unavailable"
        b64=base64.b64encode(("x-access-token:"+secret).encode()).decode()
        command.extend(["-c","http.https://github.com/.extraheader=AUTHORIZATION: basic "+b64])
    command.extend(args)
    output=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if output.returncode!=0:
        # Never expose git command args, GH_TOKEN, authorization headers, stderr.
        raise RuntimeError("Isolated Git operation failed at "+args[0]+" ("+str(output.returncode)+")")
    return output.stdout.strip()

def branch_head(name):
    rows=git("ls-remote","--heads",REMOTE,"refs/heads/"+name)
    if not rows:return None
    assert len(rows.splitlines())==1,"Ambiguous sandbox ref"
    return rows.split()[0]

def assert_published(sha,version):
    assert sha in (A,B),"Unreviewed remote Git commit SHA"
    actual=branch_head(BRANCH)
    assert actual==sha,"Sandbox Git ref not published at expected immutable SHA"
    uri="https://raw.githubusercontent.com/"+REPO+"/"+sha+"/stage38-lifecycle-check.html"
    status,raw=request(uri)
    assert status==200 and len(raw)<5000,"Static sandbox file not publicly accessible"
    assert ('id="stage38-lifecycle-version">SANDBOX-'+version).encode() in raw
    assert b"connect-src &#39;none&#39;" in raw
    RESULTS.append("published_branch_at_"+version+"_sha_verified")
    print("PASS: actual isolated Git branch has "+version+" SHA "+sha[:12])

def update_branch(from_sha,to_sha):
    assert to_sha in (A,B),"Unreviewed release target"
    old=branch_head(BRANCH)
    assert old==from_sha,"Sandbox branch changed unexpectedly"
    if old is None:
        git("push","--quiet",REMOTE,to_sha+":refs/heads/"+BRANCH,authorize=True)
    elif old==A and to_sha==B:
        git("push","--quiet",REMOTE,to_sha+":refs/heads/"+BRANCH,authorize=True)
    elif old==B and to_sha==A:
        # Force-with-lease is permitted ONLY on this never-production test ref;
        # rejects another worker's concurrent branch change.
        git("push","--quiet","--force-with-lease=refs/heads/"+BRANCH+":"+B,
            REMOTE,to_sha+":refs/heads/"+BRANCH,authorize=True)
    else:raise AssertionError("Unsupported sandbox state transition")
    assert branch_head(BRANCH)==to_sha,"Remote SHA did not match actual Git publication"
    print("PASS: real Git publishing "+(from_sha[:8] if from_sha else "none")+" → "+to_sha[:8])

def commit_verified(identity,job_id,sha):
    for i in range(5):
        code,body=invoke("worker_complete",identity,job_id=job_id)
        if code==200:
            assert body.get("ok") is True and body.get("to_sha")==sha
            assert body.get("finalized") is True
            return
        if code==409 and body.get("error")=="sandbox_branch_not_at_claimed_sha" and i<4:
            time.sleep(1.5)
            continue
        raise AssertionError("Signed Edge rejected previously published sandbox target HTTP "+str(code))
    raise AssertionError("GitHub SHA propagation timeout")

def run():
    expect(invoke("status"),401,"signed_github_identity_required")
    expect(invoke("status","fake.stage38.jwt"),403,"invalid_github_oidc")
    RESULTS.append("anonymous_and_forged_oidc_denied")
    signed=token()
    main_before=branch_head("main")
    assert main_before,"Production main ref missing"
    assert branch_head(BRANCH) is None,"Unique isolated sandbox branch already exists"
    baseline=expect(invoke("status",signed),200)
    assert baseline["jobs"]==0 and baseline["history"]==0
    assert baseline["production_sha"] is None and baseline["staging_sha"] is None
    fixture_started=False
    try:
        # Initial A is a genuine Git branch publication but no DB release job.
        update_branch(None,A)
        assert_published(A,"A")
        prepared=expect(invoke("prepare",signed),200)
        fixture_started=True
        assert prepared["from_sha"]==A and prepared["to_sha"]==B
        queued_id=prepared["queued_job"]
        claimed=expect(invoke("worker_next",signed),200)
        assert claimed["has_job"] and claimed["job_id"]==queued_id
        assert claimed["action"]=="stage_apply" and claimed["to_sha"]==B
        busy=expect(invoke("worker_next",signed),200)
        assert busy["already_running"] and not busy["has_job"]
        # A worker CANNOT mark B as deployed until Git ref is ACTUALLY B.
        expect(invoke("worker_complete",signed,job_id=queued_id),409,
               "sandbox_branch_not_at_claimed_sha")
        RESULTS.append("premature_release_ack_denied")
        update_branch(A,B)
        assert_published(B,"B")
        commit_verified(signed,queued_id,B)
        after=expect(invoke("status",signed),200)
        assert after["staging_sha"]==B and after["production_sha"] is None
        assert after["jobs"]==1 and after["history"]==1
        RESULTS.append("real_git_file_update_then_atomic_release_completion")

        rollback=expect(invoke("prepare_rollback",signed),200)
        assert rollback["from_sha"]==B and rollback["to_sha"]==A
        rollback_id=rollback["queued_job"]
        claimed=expect(invoke("worker_next",signed),200)
        assert claimed["has_job"] and claimed["job_id"]==rollback_id
        assert claimed["action"]=="stage_rollback"
        expect(invoke("worker_complete",signed,job_id=rollback_id),409,
               "sandbox_branch_not_at_claimed_sha")
        update_branch(B,A)
        assert_published(A,"A")
        commit_verified(signed,rollback_id,A)
        final=expect(invoke("status",signed),200)
        assert final["staging_sha"]==A and final["production_sha"] is None
        assert final["jobs"]==2 and final["history"]==2
        assert final["queued"]==0 and final["running"]==0
        RESULTS.append("real_git_rollback_then_atomic_release_history")
        expect(invoke("prod_apply",signed),403,"only_sandbox_actions_allowed")
        expect(invoke("worker_fail",signed),403,"only_sandbox_actions_allowed")
        RESULTS.append("real_production_release_actions_denied")
    finally:
        # Only the unique test ref may be reverted; avoid touching other branches.
        if branch_head(BRANCH)==B:
            update_branch(B,A)
        clean=expect(invoke("cleanup",signed),200)
        assert clean["cleanup"] and clean["ok"],"Fixture cleanup failed"
        post=expect(invoke("status",signed),200)
        assert post["jobs"]==0 and post["history"]==0
        assert post["production_sha"] is None and post["staging_sha"] is None
        assert branch_head("main")==main_before,"Production main ref changed"
        assert branch_head(BRANCH)==A,"Final sandbox files were not restored"
        RESULTS.append("only_sandbox_branch_preserved_at_A_no_staging_rows")
    print("PASS: signed GitHub OIDC work claims and publishes real files BEFORE atomic staging completion")
    for c in RESULTS:print("PASS: "+c)
    print("LIMITATION: only isolated static Git branch, not production Pages or interactive external Auth")

if __name__=="__main__":
    try:run()
    except Exception as err:
        print("FAIL: "+str(err).split("\n")[0][:160])
        raise SystemExit(1)
