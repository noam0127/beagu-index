"""One-step trusted production entry point. No live workflow or transport activation."""
import pathlib
import re
import integrated_production as prod
import integrated_verify as v
import integrated_runner as r
import integrated_backup as b

JOB=re.compile(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")
OPS=("apply_sql","apply_scheduler","deploy_edge","verify_backend","publish_pages","verify_live")

class PrivateBackup:
    def __init__(self,directory,config):
        self.directory=pathlib.Path(directory)
        b.safe_dir(self.directory)
        r.require(isinstance(config,dict) and set(config)=={"public_key","scope","checkpoint_sha256"},"backup_observer_not_connected")
        self.config=config
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
    wrapped=ApprovedAdapter(adapter,backup_source,job,verified)
    if nxt:r.require(steps[0]["evidence"]==r.digest(wrapped.evidence),"backup_checkpoint_changed")
    if status=="verified":
        r.require(final_proof is not None,"production_final_observer_not_connected")
        return {"status":"completed","advanced":True,"result":ledger.finalize(job,verified,registry,steps[-1]["evidence"],final_proof)}
    r.require(prod.ProductionRunner(ledger,root,envelope,registry,wrapped).once(job) is True,"production_step_not_claimed")
    return {"status":ledger.snapshot(job)["status"],"advanced":True}
