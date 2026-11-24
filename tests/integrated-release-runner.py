"""Durable fixture runner tests; no production credentials or remote endpoints."""
import copy
import importlib.util
import os
import pathlib
import sys
import tempfile
import threading
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_runner as r
import integrated_verify as v
import integrated_backup as b
spec=importlib.util.spec_from_file_location("git_fixture",ROOT/"tests/integrated-release-verification.py")
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

class Adapter:
    scope=r.SCOPE
    def __init__(self,base,cluster,directory,root):
        self.base,self.cluster,self.directory,self.root=base,cluster,directory,root
        self.key=os.urandom(32)
        self.calls=[]
        self.fail=None
    def observed_base(self):return self.base
    def result(self,op,p,**kw):
        self.calls.append(op)
        if self.fail==op:raise RuntimeError("fixture injected failure")
        return {"scope":r.SCOPE,"ok":True,"operation":op,"plan_sha256":p["plan_sha256"],**kw}
    def backup(self,t,f,p):
        pins=[p[k] for k in ("plan_sha256","base_sha","candidate_sha")]
        pin=b.encrypted_checkpoint(self.cluster,self.directory,self.key,"fixture-only",*pins)
        proof=b.rehearse_encrypted_restore(self.cluster,self.directory,self.key,"fixture-only",pin,*pins)
        return self.result("backup",p,encrypted=proof["encrypted"],restore_verified=proof["restore_verified"],checkpoint_sha256=pin["object_sha256"])
    def apply_sql(self,t,f,p):
        # Only the fixed synthetic SQL fixture is allowed by this adapter.
        r.require(list(f.values())==[b"CREATE TABLE public.fixture_added(id integer PRIMARY KEY);\n"],"unexpected_fixture_sql")
        self.cluster.sql("fixture_source","BEGIN;\n"+next(iter(f.values())).decode()+"\nCOMMIT;")
        return self.result("apply_sql",p)
    def apply_scheduler(self,t,f,p):raise ValueError("unsupported_fixture_scheduler")
    def deploy_edge(self,t,f,p):
        # Deliberately a local package receipt, not real Edge deployment.
        r.require(t["edge_function"]=="account" and len(f)==1,"unexpected_fixture_edge")
        dest=self.directory/"fixture-edge-package"
        b.private_write(dest,next(iter(f.values())))
        return self.result("deploy_edge",p,local_package_sha256=b.hash_bytes(dest.read_bytes()))
    def verify_backend(self,t,f,p):
        r.require(self.cluster.sql("fixture_source","SELECT to_regclass('public.fixture_added');").strip()==b"fixture_added","fixture_database_missing")
        r.require(self.cluster.sql("fixture_source","SELECT count(*) FROM public.existing;").strip()==b"2","existing_data_lost")
        r.require((self.directory/"fixture-edge-package").read_bytes()==b"// fixture only\n","fixture_package_missing")
        return self.result("verify_backend",p)
    def publish_pages(self,t,f,p):
        _,_,data=v.tree_blob(self.root,p["candidate_sha"],"index.html")
        b.private_write(self.directory/"fixture-index.html",data)
        return self.result("publish_pages",p,local_artifact_sha256=b.hash_bytes(data))
    def verify_live(self,t,f,p):
        r.require((self.directory/"fixture-index.html").read_bytes()==b"new","fixture_artifact_mismatch")
        return self.result("verify_live",p)

class Runner(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        root=pathlib.Path(self.tmp.name)
        self.git=root/"git";self.git.mkdir()
        self.store=root/"ledger";self.store.mkdir(mode=0o700)
        self.objects=root/"objects";self.objects.mkdir(mode=0o700)
        g.run(self.git,"init","-q")
        g.write(self.git,"index.html",b"old")
        g.write(self.git,"release-candidate.json",b'{"version":"v1.10.1","summary":"fixture"}')
        self.base=g.commit(self.git)
        g.write(self.git,"index.html",b"new")
        g.write(self.git,"supabase/account.sql",b"CREATE TABLE public.fixture_added(id integer PRIMARY KEY);\n")
        g.write(self.git,"supabase/functions/account/index.ts",b"// fixture only\n")
        self.candidate=g.commit(self.git)
        items=[]
        for path,status in [("index.html","modified"),("supabase/account.sql","added"),("supabase/functions/account/index.ts","added")]:
            k=v.kind(path)
            items.append({"path":path,"status":status,"blob_sha":g.run(self.git,"rev-parse",self.candidate+":"+path),"blob_ref":"candidate","previous_path":None,"review_kinds":[k],"backend":k!="web_review","manual_review_required":False})
        plan={"schema":1,"policy":"integrated-review-v1","repository":v.REPOSITORY,"base_sha":self.base,"candidate_sha":self.candidate,"version":"v1.10.1","summary":"fixture","backend_required":True,"execution_enabled":False,"inventory":items,"edge_functions":["account"],"requires_shared_dependency_review":False,"requires_manual_review":False,"required_checks":["backup_review","database_review","edge_review","server_verification","pages_verification","post_release_verification"]}
        self.envelope=g.env(plan);self.verified=v.verify_manifest(self.git,self.envelope)
        files={f["path"]:f["sha256"] for f in self.verified["files"]}
        def task(op,path=None,edge=None):
            return {"op":op,"files":[{"path":path,"sha256":files[path]}] if path else [],"edge_function":edge}
        self.pins={k:self.verified[k] for k in ("base_sha","candidate_sha","plan_sha256")}
        self.recipe={**self.pins,"tasks":[task("backup"),task("apply_sql","supabase/account.sql"),task("deploy_edge","supabase/functions/account/index.ts","account"),task("verify_backend"),task("publish_pages"),task("verify_live")]}
        self.registry={"schema":1,"recipes":[self.recipe]}
        self.approval={"scope":r.SCOPE,**self.pins,"recipe_sha256":r.digest(self.recipe),"confirmed":True}
        self.ledger=r.Ledger(self.store)
        self.job=self.ledger.create(self.verified,self.registry,self.approval)
    def test_atomic_claim_persistence_and_fail_closed(self):
        self.assertEqual(self.job,r.Ledger(self.store).create(self.verified,self.registry,self.approval))
        with self.assertRaisesRegex(ValueError,"approval_pin_mismatch"):
            self.ledger.create(self.verified,self.registry,{**self.approval,"confirmed":False})
        with self.assertRaisesRegex(ValueError,"stale_or_changed_plan"):
            self.ledger.claim(self.job,self.verified,self.registry,"f"*40)
        claims=[];errors=[];barrier=threading.Barrier(2)
        def worker():
            barrier.wait()
            try:claims.append(r.Ledger(self.store).claim(self.job,self.verified,self.registry,self.base))
            except ValueError as e:errors.append(str(e))
        threads=[threading.Thread(target=worker) for _ in range(2)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertEqual(len(claims),1);self.assertEqual(errors,["step_already_claimed_or_uncertain"])
        claim=claims[0]
        restarted=r.Ledger(self.store)
        with self.assertRaisesRegex(ValueError,"step_already_claimed_or_uncertain"):
            restarted.claim(self.job,self.verified,self.registry,self.base)
        with self.assertRaisesRegex(ValueError,"wrong_step_lease"):
            restarted.finish(self.job,{**claim,"lease":"invalid"},"a"*64)
        restarted.finish(self.job,claim,"a"*64)
        with self.assertRaisesRegex(ValueError,"stale_step_receipt"):
            restarted.finish(self.job,claim,"a"*64)
        second=restarted.claim(self.job,self.verified,self.registry,self.base)
        self.assertEqual(second["task"]["op"],"apply_sql")
        restarted.finish(self.job,second)
        state=r.Ledger(self.store).snapshot(self.job)
        self.assertEqual(state["status"],"blocked")
        self.assertEqual([s["status"] for s in state["steps"]],["done","blocked","pending","pending","pending","pending"])
        with self.assertRaisesRegex(ValueError,"release_blocked"):
            restarted.claim(self.job,self.verified,self.registry,self.base)
    def test_actual_database_and_local_package_sequence(self):
        with b.FixtureCluster() as cluster:
            cluster.sql("fixture_source","CREATE TABLE public.existing(id integer PRIMARY KEY); INSERT INTO public.existing VALUES (1),(2);")
            adapter=Adapter(self.base,cluster,self.objects,self.git)
            # Reopen durable ledger between every step.
            for task in self.recipe["tasks"]:
                runner=r.FixtureRunner(r.Ledger(self.store),self.git,self.envelope,self.registry,adapter)
                self.assertTrue(runner.once(self.job))
            self.assertFalse(runner.once(self.job))
            state=r.Ledger(self.store).snapshot(self.job)
            self.assertEqual(state["status"],"completed")
            self.assertTrue(all(s["status"]=="done" and s["evidence"] for s in state["steps"]))
            self.assertEqual(adapter.calls,[t["op"] for t in self.recipe["tasks"]])
            self.assertFalse(state["execution_enabled"])
    def test_adapter_failure_blocks_web(self):
        class Fail:
            scope=r.SCOPE
            def observed_base(inner):return self.base
            def backup(inner,t,f,p):raise RuntimeError("injected")
            apply_sql=apply_scheduler=deploy_edge=verify_backend=publish_pages=verify_live=backup
        runner=r.FixtureRunner(self.ledger,self.git,self.envelope,self.registry,Fail())
        with self.assertRaises(RuntimeError):runner.once(self.job)
        self.assertEqual(self.ledger.snapshot(self.job)["status"],"blocked")
        with self.assertRaisesRegex(ValueError,"release_blocked"):runner.once(self.job)

if __name__=="__main__":unittest.main()
