"""Production control connector candidate. No live transport or deployment in tests.
The worker obtains a separately scoped OIDC token only in a trusted workflow.
Existing manifest verification and ordered step runner are reused.
"""
import json
import http.client
import ssl
import os
import re
from urllib.parse import urlsplit,parse_qsl,urlencode
import integrated_runner as r
import integrated_verify as v
import integrated_server_control as control

SCOPE="production_integrated_v1"
API="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-release-manager-v1"
PRODUCTION_WORKER_TRANSPORT_ENABLED=False
AUDIENCE="beagu-integrated-production-worker"
MAX_RESPONSE=2*1024*1024
ACTIONS={"status","claim","finish","finalize"}

class ProductionLedger(control.PostgresLedger):
    """RPC transport is injected; no database password is passed to a worker."""
    def __init__(self,transport,worker_run):
        r.require(callable(transport) and re.fullmatch(r"[0-9]{1,24}:[0-9]{1,8}",worker_run),"invalid_production_control")
        self.transport,self.worker_run=transport,worker_run
    def rpc(self,action,payload):
        r.require(action in ACTIONS,"production_worker_action_forbidden")
        result=self.transport(action,{**payload,"scope":SCOPE})
        r.require(isinstance(result,dict),"invalid_production_response")
        if result.get("error"):raise ValueError(result["error"])
        r.require(result.get("scope")==SCOPE and result.get("execution_enabled") is True,"production_execution_disabled")
        return result
    def create(self,*args):raise ValueError("owner_approval_required")
    def finalize(self,job,verified,registry,final_evidence,proof=None):
        r.require(isinstance(proof,dict) and set(proof)=={"statement","signature"},"production_final_observer_not_connected")
        v.validate_recipe(verified,registry)
        recipe=next(x for x in registry["recipes"] if x["plan_sha256"]==verified["plan_sha256"])
        q=proof["statement"]
        r.require(isinstance(q,dict) and q.get("scope")==SCOPE and q.get("job_id")==job and q.get("base_sha")==verified["base_sha"] and q.get("candidate_sha")==verified["candidate_sha"] and q.get("plan_sha256")==verified["plan_sha256"] and q.get("recipe_sha256")==r.digest(recipe) and q.get("final_evidence")==final_evidence,"final_observation_pin_mismatch")
        # The control Edge, not this worker, verifies the independent observer signature.
        return self.rpc("finalize",{"job_id":job,"proof":proof})

class ProductionRunner(r.ScopedRunner):
    scope=SCOPE
    def __init__(self,ledger,root,envelope,registry,adapter):
        r.require(type(ledger) is ProductionLedger,"production_ledger_required")
        super().__init__(ledger,root,envelope,registry,adapter)
    def once(self,job):
        verified=v.verify_manifest(self.root,self.envelope)
        state=self.ledger.snapshot(job)
        r.require(state.get("id")==job and state.get("base_sha")==verified["base_sha"] and state.get("candidate_sha")==verified["candidate_sha"] and state.get("plan_sha")==verified["plan_sha256"],"production_job_pin_mismatch")
        return super().once(job)

def _https_json(host,path,method,headers,body=None,connection=http.client.HTTPSConnection):
    """One bounded TLS request. No proxy, redirect, retry or arbitrary host."""
    r.require(path.startswith("/") and not path.startswith("//") and not any(c in path for c in "\r\n"),"invalid_control_path")
    conn=connection(host,timeout=25,context=ssl.create_default_context())
    try:
        conn.request(method,path,body=body,headers=headers)
        res=conn.getresponse()
        r.require(res.status in (200,400,401,403,409,503),"unexpected_control_status")
        raw=res.read(MAX_RESPONSE+1)
        r.require(len(raw)<=MAX_RESPONSE,"control_response_too_large")
        out=v.read_json(raw)
        r.require(isinstance(out,dict),"invalid_control_response")
        if res.status!=200:r.require(isinstance(out.get("error"),str),"control_http_error")
        return out
    finally:conn.close()

def _oidc_token(request):
    endpoint=urlsplit(os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"])
    host=endpoint.hostname or ""
    # GitHub Actions OIDC runtime endpoint only; never send its credential to
    # an arbitrary host, userinfo, alternate port, or redirected request.
    r.require(endpoint.scheme=="https" and host.endswith(".actions.githubusercontent.com") and endpoint.username is None and endpoint.password is None and endpoint.port in (None,443) and not endpoint.fragment,"invalid_oidc_endpoint")
    query=parse_qsl(endpoint.query,keep_blank_values=True)
    r.require(not any(k=="audience" for k,_ in query),"unexpected_oidc_audience")
    query.append(("audience",AUDIENCE))
    result=request(host,endpoint.path+"?"+urlencode(query),"GET",{"Authorization":"Bearer "+os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
    token=result.get("value","")
    r.require(isinstance(token,str) and len(token)<16000 and re.fullmatch(r"[A-Za-z0-9._-]+",token),"invalid_oidc_token")
    return token

def _control_request(action,payload,request,token):
    r.require(action in ACTIONS and isinstance(payload,dict) and payload.get("scope")==SCOPE,"invalid_production_request")
    endpoint=urlsplit(API)
    data=json.dumps({**payload,"action":"worker_integrated_production_"+action},separators=(",",":")).encode()
    r.require(len(data)<=14000,"control_request_too_large")
    import worker
    return request(endpoint.hostname,endpoint.path,"POST",{"Authorization":"Bearer "+token,"apikey":worker.PUBLIC_KEY,"Content-Type":"application/json"},data)

def github_worker_transport(action,payload):
    """Operational call path; disabled in this candidate even with env credentials."""
    r.require(PRODUCTION_WORKER_TRANSPORT_ENABLED,"production_worker_transport_not_authorized")
    r.require(os.environ.get("GITHUB_ACTIONS")=="true" and os.environ.get("GITHUB_REF")=="refs/heads/main" and os.environ.get("GITHUB_REPOSITORY")==v.REPOSITORY,"untrusted_production_workflow")
    return _control_request(action,payload,_https_json,_oidc_token(_https_json))
