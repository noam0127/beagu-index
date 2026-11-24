"""One-step trusted production entry point. No live workflow or transport activation."""
import pathlib
import re
import integrated_production as prod
import integrated_verify as v
import integrated_runner as r
import integrated_backup as b

JOB=re.compile(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")
OPS=("apply_sql","apply_scheduler","deploy_edge","verify_backend","publish_pages","verify_live")

# The Pages release pointer is not evidence that external services were installed.
# This known inherited baseline has outstanding non-Pages obligations.
WATERWAY_BASE="76d2c01878d8242e62dd87e30cfb707ab431d3ee"
BASELINE_CHECKS=frozenset({"telemetry_sql","admin_status_sql","results_ingest_edge","review_admin_edge","apps_script_source","successful_authenticated_sync","publication_gates_unchanged"})

def verify_baseline_observation(proof,public_key,job,verified,now=None):
    import base64
    import time
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.exceptions import InvalidSignature
    r.require(isinstance(public_key,bytes) and len(public_key)==32,"baseline_observer_not_connected")
    r.require(isinstance(proof,dict) and set(proof)=={"statement","signature"},"invalid_baseline_observation")
    q=proof["statement"]
    r.require(isinstance(q,dict) and set(q)=={"schema","kind","scope","job_id","base_sha","candidate_sha","plan_sha256","observed_at","checks"} and q["schema"]==1 and q["kind"]=="waterway_baseline_v1" and q["scope"]==prod.SCOPE and q["job_id"]==job,"invalid_baseline_observation")
    r.require(all(q[k]==verified[k] for k in ("base_sha","candidate_sha","plan_sha256")) and q["base_sha"]==WATERWAY_BASE,"baseline_release_pin_mismatch")
    now=int(time.time()) if now is None else now
    r.require(type(q["observed_at"]) is int and now-1800<=q["observed_at"]<=now+60,"baseline_observation_stale")
    checks=q["checks"]
    r.require(isinstance(checks,dict) and set(checks)==BASELINE_CHECKS and all(isinstance(x,str) and v.DIGEST.fullmatch(x) for x in checks.values()),"baseline_obligations_unverified")
    try:
        Ed25519PublicKey.from_public_bytes(public_key).verify(base64.b64decode(proof["signature"],validate=True),r.canonical(q).encode("utf8"))
    except (ValueError,TypeError,InvalidSignature):
        raise ValueError("baseline_observer_signature_invalid") from None
    return r.digest(proof)

class PrivateBackup:
    def __init__(self,directory,config):
        self.directory=pathlib.Path(directory)
        b.safe_dir(self.directory)
        r.require(isinstance(config,dict) and set(config)=={"public_key","scope","checkpoint_sha256"},"backup_observer_not_connected")
        self.config=config
    def verify_inherited_baseline(self,job,verified):
        if verified["base_sha"]!=WATERWAY_BASE:
            return None
        r.require(isinstance(job,str) and JOB.fullmatch(job),"invalid_production_job")
        # Independent observer must write a separate, current signed record.
        # No inference from the web pointer, backup receipt or Git comparison.
        try:
            proof=v.read_json(b.private_read(self.directory/(job+".baseline.json"),128*1024))
        except FileNotFoundError:
            raise ValueError("waterway_baseline_observation_required") from None
        return verify_baseline_observation(proof,self.config["public_key"],job,verified)
    def evidence(self,job,verified):
        r.require(isinstance(job,str) and JOB.fullmatch(job),"invalid_production_job")
        proof=v.read_json(b.private_read(self.directory/(job+".backup.json"),128*1024))
        c=self.config
        return {**prod.verify_backup_observation(proof,c["public_key"],job,verified,c["scope"],c["checkpoint_sha256"]),"backup_proof":proof}

class ApprovedAdapter:
    scope=prod.SCOPE
    def __init__(self,adapter,source,job,verified):
        r.require(getattr(adapter,"scope",None)==prod.SCOPE and all(callable(getattr(adapter,k,None)) for k in (*OPS,"observed_base")),"production_effect_adapter_not_connected")
        r.require(type(source) is PrivateBackup,"backup_source_not_connected")
        self.adapter,self.job=adapter,job
        self.backup_observer_config=source.config
        self.evidence=source.evidence(job,verified)
    def observed_base(self):return self.adapter.observed_base()
    def bind_claim(self,job,claim):
        r.require(job==self.job,"production_job_pin_mismatch")
        if hasattr(self.adapter,"bind_claim"):self.adapter.bind_claim(job,claim)
    def backup(self,*args):return self.evidence
    def apply_sql(self,*args):return self.adapter.apply_sql(*args)
    def apply_scheduler(self,*args):return self.adapter.apply_scheduler(*args)
    def deploy_edge(self,*args):return self.adapter.deploy_edge(*args)
    def verify_backend(self,*args):return self.adapter.verify_backend(*args)
    def publish_pages(self,*args):return self.adapter.publish_pages(*args)
    def verify_live(self,*args):return self.adapter.verify_live(*args)

def execute_next(ledger,root,envelope,registry,adapter,backup_source,job,final_proof=None):
    """One approved step or signed finalization. No retries or candidate imports."""
    r.require(type(ledger) is prod.ProductionLedger and isinstance(job,str) and JOB.fullmatch(job),"invalid_production_job")
    verified=v.verify_manifest(root,envelope)
    v.validate_recipe(verified,registry)
    recipe=next(x for x in registry["recipes"] if x["plan_sha256"]==verified["plan_sha256"])
    r.require(recipe["tasks"][0]["op"]=="backup","production_backup_required")
    s=ledger.snapshot(job)
    r.require(s.get("id")==job and all(s.get(k)==verified[k] for k in ("base_sha","candidate_sha")) and s.get("plan_sha")==verified["plan_sha256"] and s.get("recipe_sha")==r.digest(recipe),"production_job_pin_mismatch")
    steps,nxt,status=s.get("steps"),s.get("next_step"),s.get("status")
    r.require(status in ("queued","running","verified","completed"),"release_blocked")
    r.require(type(nxt) is int and isinstance(steps,list) and len(steps)==s.get("task_count")==len(recipe["tasks"]) and 0<=nxt<=len(steps),"production_step_state_invalid")
    r.require(all(x.get("idx")==i and x.get("task")==recipe["tasks"][i] for i,x in enumerate(steps)),"production_task_state_mismatch")
    r.require(all(x.get("status")=="done" and isinstance(x.get("evidence"),str) and v.DIGEST.fullmatch(x["evidence"]) for x in steps[:nxt]),"missing_prior_checkpoint")
    if status in ("verified","completed"):
        r.require(nxt==len(steps),"production_step_state_invalid")
        if status=="completed":return {"status":"completed","advanced":False}
    else:
        r.require(nxt<len(steps) and all(x.get("status")=="pending" for x in steps[nxt:]),"step_already_claimed_or_uncertain")
    r.require(type(backup_source) is PrivateBackup,"backup_source_not_connected")
    backup_source.verify_inherited_baseline(job,verified)
    wrapped=ApprovedAdapter(adapter,backup_source,job,verified)
    if nxt:r.require(steps[0]["evidence"]==r.digest(wrapped.evidence),"backup_checkpoint_changed")
    if status=="verified":
        r.require(final_proof is not None,"production_final_observer_not_connected")
        return {"status":"completed","advanced":True,"result":ledger.finalize(job,verified,registry,steps[-1]["evidence"],final_proof)}
    r.require(prod.ProductionRunner(ledger,root,envelope,registry,wrapped).once(job) is True,"production_step_not_claimed")
    return {"status":ledger.snapshot(job)["status"],"advanced":True}
