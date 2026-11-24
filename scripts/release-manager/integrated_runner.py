"""Durable, fail-closed integrated release sequencer, isolated fixture only.

No production API, remote deployment, candidate commands or automatic retry.
The trusted caller supplies the validated fixture registry and adapters.
"""
import hashlib
import json
import os
import pathlib
import sqlite3
import stat
import uuid
from contextlib import contextmanager
import integrated_verify as verify

SCOPE="isolated_fixture_only"
def canonical(obj):
    return json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=False,allow_nan=False)
def digest(obj):
    return hashlib.sha256(canonical(obj).encode()).hexdigest()
def require(ok,code):
    if not ok:raise ValueError(code)

class Ledger:
    def __init__(self,directory):
        directory=pathlib.Path(directory)
        st=directory.lstat()
        require(stat.S_ISDIR(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700,"unsafe_ledger_directory")
        self.path=directory/"fixture-ledger.sqlite"
        if not self.path.exists():
            try:
                fd=os.open(self.path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
                os.close(fd)
            except FileExistsError:pass
        st=self.path.lstat()
        require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o600 and st.st_nlink==1,"unsafe_ledger_file")
        with self.tx() as c:
            c.execute("""CREATE TABLE IF NOT EXISTS jobs(
              id TEXT PRIMARY KEY,scope TEXT NOT NULL CHECK(scope='isolated_fixture_only'),
              base TEXT NOT NULL,candidate TEXT NOT NULL,plan TEXT NOT NULL,recipe TEXT NOT NULL,
              approval TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('queued','running','blocked','completed')),
              next_step INTEGER NOT NULL DEFAULT 0,task_count INTEGER NOT NULL,
              UNIQUE(base,candidate))""")
            c.execute("""CREATE UNIQUE INDEX IF NOT EXISTS one_active_fixture
              ON jobs(scope) WHERE status IN ('queued','running','blocked')""")
            c.execute("""CREATE TABLE IF NOT EXISTS steps(
              job TEXT NOT NULL REFERENCES jobs(id),idx INTEGER NOT NULL,task TEXT NOT NULL,
              status TEXT NOT NULL CHECK(status IN ('pending','running','done','blocked')),
              lease TEXT,evidence TEXT,error TEXT,PRIMARY KEY(job,idx))""")
    @contextmanager
    def tx(self):
        c=sqlite3.connect(self.path,timeout=10,isolation_level=None)
        c.row_factory=sqlite3.Row
        try:
            c.execute("PRAGMA foreign_keys=ON")
            c.execute("PRAGMA synchronous=FULL")
            c.execute("BEGIN IMMEDIATE")
            yield c
            c.commit()
        except BaseException:
            c.rollback()
            raise
        finally:c.close()

    def create(self,verified,registry,approval):
        verify.validate_recipe(verified,registry)
        recipe=next(r for r in registry["recipes"] if r["plan_sha256"]==verified["plan_sha256"])
        pins={k:verified[k] for k in ("base_sha","candidate_sha","plan_sha256")}
        recipe_sha=digest(recipe)
        require(approval=={"scope":SCOPE,**pins,"recipe_sha256":recipe_sha,"confirmed":True},"approval_pin_mismatch")
        with self.tx() as c:
            prior=c.execute("SELECT * FROM jobs WHERE base=? AND candidate=?",(pins["base_sha"],pins["candidate_sha"])).fetchone()
            if prior:
                require(prior["plan"]==pins["plan_sha256"] and prior["recipe"]==recipe_sha and prior["approval"]==digest(approval),"duplicate_candidate_conflict")
                return prior["id"]
            require(c.execute("SELECT 1 FROM jobs WHERE status IN ('queued','running','blocked')").fetchone() is None,"active_release_exists")
            job=uuid.uuid4().hex
            c.execute("INSERT INTO jobs(id,scope,base,candidate,plan,recipe,approval,status,task_count) VALUES(?,?,?,?,?,?,?,'queued',?)",
                (job,SCOPE,pins["base_sha"],pins["candidate_sha"],pins["plan_sha256"],recipe_sha,digest(approval),len(recipe["tasks"])))
            c.executemany("INSERT INTO steps(job,idx,task,status) VALUES(?,?,?,'pending')",
                [(job,i,canonical(t)) for i,t in enumerate(recipe["tasks"])])
            return job

    def snapshot(self,job):
        with self.tx() as c:
            row=c.execute("SELECT * FROM jobs WHERE id=?",(job,)).fetchone()
            require(row is not None,"unknown_job")
            steps=c.execute("SELECT idx,task,status,evidence,error FROM steps WHERE job=? ORDER BY idx",(job,)).fetchall()
            # No lease token or sensitive backup data exposed by status.
            return {**dict(row),"steps":[dict(s) for s in steps],"execution_enabled":False}

    def claim(self,job,verified,registry,observed_base):
        verify.validate_recipe(verified,registry)
        recipe=next(r for r in registry["recipes"] if r["plan_sha256"]==verified["plan_sha256"])
        with self.tx() as c:
            row=c.execute("SELECT * FROM jobs WHERE id=?",(job,)).fetchone()
            require(row is not None,"unknown_job")
            require((row["base"],row["candidate"],row["plan"],row["recipe"])==
                (observed_base,verified["candidate_sha"],verified["plan_sha256"],digest(recipe)) and observed_base==verified["base_sha"],"stale_or_changed_plan")
            if row["status"]=="completed":return None
            require(row["status"] in ("queued","running"),"release_blocked")
            i=row["next_step"]
            step=c.execute("SELECT * FROM steps WHERE job=? AND idx=?",(job,i)).fetchone()
            require(step is not None and step["status"]=="pending","step_already_claimed_or_uncertain")
            require(step["task"]==canonical(recipe["tasks"][i]),"stored_task_mismatch")
            prior=c.execute("SELECT count(*) FROM steps WHERE job=? AND idx<? AND status='done'",(job,i)).fetchone()[0]
            require(prior==i,"missing_prior_checkpoint")
            lease=uuid.uuid4().hex
            c.execute("UPDATE steps SET status='running',lease=? WHERE job=? AND idx=?",(lease,job,i))
            c.execute("UPDATE jobs SET status='running' WHERE id=?",(job,))
            return {"idx":i,"lease":lease,"task":json.loads(step["task"])}

    def finish(self,job,claim,evidence=None):
        with self.tx() as c:
            row=c.execute("SELECT * FROM jobs WHERE id=?",(job,)).fetchone()
            require(row is not None and row["status"]=="running" and row["next_step"]==claim["idx"],"stale_step_receipt")
            step=c.execute("SELECT * FROM steps WHERE job=? AND idx=?",(job,claim["idx"])).fetchone()
            require(step["status"]=="running" and step["lease"]==claim["lease"] and step["task"]==canonical(claim["task"]),"wrong_step_lease")
            if evidence is None:
                c.execute("UPDATE steps SET status='blocked',error='effect_uncertain_or_failed',lease=NULL WHERE job=? AND idx=?",(job,claim["idx"]))
                c.execute("UPDATE jobs SET status='blocked' WHERE id=?",(job,))
                return
            require(isinstance(evidence,str) and verify.DIGEST.fullmatch(evidence),"invalid_step_evidence")
            c.execute("UPDATE steps SET status='done',evidence=?,lease=NULL WHERE job=? AND idx=?",(evidence,job,claim["idx"]))
            nxt=claim["idx"]+1
            c.execute("UPDATE jobs SET next_step=?,status=? WHERE id=?",(nxt,"completed" if nxt==row["task_count"] else "running",job))

class FixtureRunner:
    """Fixed trusted handler interface. Only fixture-scoped, never a production worker."""
    def __init__(self,ledger,root,envelope,registry,adapter):
        require(getattr(adapter,"scope",None)==SCOPE,"non_fixture_adapter")
        self.ledger,self.root,self.envelope,self.registry,self.adapter=ledger,root,envelope,registry,adapter
    def once(self,job):
        verified=verify.verify_manifest(self.root,self.envelope)
        claim=self.ledger.claim(job,verified,self.registry,self.adapter.observed_base())
        if claim is None:return False
        try:
            task=claim["task"]
            if hasattr(self.adapter,"bind_claim"):
                self.adapter.bind_claim(job,claim)
            # Read exactly pinned bytes; never execute candidate shell or import candidate code.
            files={}
            for pin in task["files"]:
                _,sha,data=verify.tree_blob(self.root,verified["candidate_sha"],pin["path"])
                require(sha==pin["sha256"],"file_pin_mismatch")
                files[pin["path"]]=data
            handlers={"backup":self.adapter.backup,"apply_sql":self.adapter.apply_sql,
                "apply_scheduler":self.adapter.apply_scheduler,"deploy_edge":self.adapter.deploy_edge,
                "verify_backend":self.adapter.verify_backend,"publish_pages":self.adapter.publish_pages,
                "verify_live":self.adapter.verify_live}
            evidence=handlers[task["op"]](task,files,verified)
            require(isinstance(evidence,dict) and evidence.get("scope")==SCOPE and evidence.get("ok") is True,"missing_fixture_evidence")
            require(evidence.get("plan_sha256")==verified["plan_sha256"] and evidence.get("operation")==task["op"],"wrong_fixture_evidence")
            if task["op"]=="backup":require(evidence.get("restore_verified") is True and evidence.get("encrypted") is True,"backup_not_verified")
            self.ledger.finish(job,claim,digest(evidence))
            return True
        except Exception:
            # Effects may have occurred. Block, never roll back or retry implicitly.
            self.ledger.finish(job,claim)
            raise
