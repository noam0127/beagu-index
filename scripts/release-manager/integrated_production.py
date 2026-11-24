"""Production control connector candidate. No live transport or deployment in tests.
The worker obtains a separately scoped OIDC token only in a trusted workflow.
Existing manifest verification and ordered step runner are reused.
"""
import json
import urllib.request
import re
import integrated_runner as r
import integrated_verify as v
import integrated_server_control as control

SCOPE="production_integrated_v1"
API="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-release-manager-v1"
ACTIONS={"status","claim","finish"}

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
    def finalize(self,*args):raise ValueError("production_final_observer_not_connected")

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

def github_worker_transport(action,payload):
    """Intentionally no operational network path before separate activation review."""
    raise ValueError("production_worker_transport_not_authorized")
