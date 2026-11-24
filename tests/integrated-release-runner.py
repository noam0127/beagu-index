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
import integrated_server_control as server
import integrated_package as package
import integrated_recovery as recovery
import base64
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
spec=importlib.util.spec_from_file_location("git_fixture",ROOT/"tests/integrated-release-verification.py")
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

class Adapter:
    scope=r.SCOPE
    def __init__(self,base,cluster,directory,root):
        self.base,self.cluster,self.directory,self.root=base,cluster,directory,root
        self.key=os.urandom(32)
        self.calls=[]
        self.fail=None
        self.package_pins={}
        self.package_receipts={}
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
        dest=self.directory/"fixture-edge-package.tar"
        inventory,pin=self.package_pins["deploy_edge"]
        receipt=package.build(self.root,p,inventory,pin,dest)
        self.package_receipts["deploy_edge"]=receipt
        return self.result("deploy_edge",p,local_package_sha256=receipt["artifact_sha256"])
    def verify_backend(self,t,f,p):
        r.require(self.cluster.sql("fixture_source","SELECT to_regclass('public.fixture_added');").strip()==b"fixture_added","fixture_database_missing")
        r.require(self.cluster.sql("fixture_source","SELECT count(*) FROM public.existing;").strip()==b"2","existing_data_lost")
        r.require(package.verify_artifact(self.directory/"fixture-edge-package.tar",self.package_pins["deploy_edge"][0],self.package_receipts["deploy_edge"]),"fixture_package_missing")
        return self.result("verify_backend",p)
    def publish_pages(self,t,f,p):
        inventory,pin=self.package_pins["publish_pages"]
        receipt=package.build(self.root,p,inventory,pin,self.directory/"fixture-pages.tar")
        self.package_receipts["publish_pages"]=receipt
        return self.result("publish_pages",p,local_artifact_sha256=receipt["artifact_sha256"])
    def verify_live(self,t,f,p):
        r.require(package.verify_artifact(self.directory/"fixture-pages.tar",self.package_pins["publish_pages"][0],self.package_receipts["publish_pages"]),"fixture_artifact_mismatch")
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
        g.write(self.git,"supabase/functions/_shared/fixture.ts",b"// unchanged shared dependency\n")
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
        self.package_pins={}
        for op,edge,pages in [("deploy_edge","account",None),("publish_pages",None,["index.html"])]:
            inventory=package.inspect(self.git,self.verified,op,edge,pages)
            self.package_pins[op]=(inventory,package.hash_bytes(package.canonical(inventory)))
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
            adapter.package_pins=self.package_pins
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

    def test_postgres_control_and_legacy_queue_exclusion(self):
        with b.FixtureCluster() as cluster:
            cluster.sql("fixture_source","CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.existing(id integer PRIMARY KEY); INSERT INTO public.existing VALUES (1),(2);")
            server.install(cluster,ROOT,self.base,self.candidate)
            ledger=server.PostgresLedger(cluster)
            # Public/anonymous calls cannot access the new transition RPC.
            with self.assertRaises(RuntimeError):
                server.execute(cluster,b"SELECT public.beagu_integrated_fixture_transition_v1('status','{}');","anon")
            with self.assertRaises(RuntimeError):
                server.execute(cluster,b"SELECT * FROM public.beagu_integrated_fixture_jobs_v1;","authenticated")
            legacy=("INSERT INTO public.beagu_site_release_jobs_v1(action,target,from_sha,to_sha,version,summary) VALUES('prod_apply','production','"+self.base+"','"+self.candidate+"','fixture','fixture');").encode()
            server.execute(cluster,legacy,"service_role")
            with self.assertRaisesRegex(ValueError,"active_release_exists"):
                ledger.create(self.verified,self.registry,self.approval)
            server.execute(cluster,b"UPDATE public.beagu_site_release_jobs_v1 SET status='failed';","service_role")
            job=ledger.create(self.verified,self.registry,self.approval)
            self.assertEqual(job,server.PostgresLedger(cluster).create(self.verified,self.registry,self.approval))
            with self.assertRaisesRegex(ValueError,"finalization_not_ready"):
                ledger.finalize(job,self.verified,self.registry,"a"*64)
            with self.assertRaises(RuntimeError):
                server.execute(cluster,legacy,"service_role")
            with self.assertRaises(RuntimeError):
                server.execute(cluster,b"UPDATE public.beagu_site_release_state_v1 SET draft_summary='stale';","service_role")
            with self.assertRaisesRegex(ValueError,"stale_or_changed_plan"):
                ledger.claim(job,self.verified,self.registry,"f"*40)
            adapter=Adapter(self.base,cluster,self.objects,self.git)
            adapter.package_pins=self.package_pins
            # Real DB operations via runner; control state survives reopening the PostgreSQL client.
            for task in self.recipe["tasks"]:
                runner=r.FixtureRunner(server.PostgresLedger(cluster),self.git,self.envelope,self.registry,adapter)
                self.assertTrue(runner.once(job))
            self.assertFalse(runner.once(job))
            state=ledger.snapshot(job)
            self.assertEqual(state["status"],"verified")
            self.assertTrue(all(s["status"]=="done" and "lease" not in s for s in state["steps"]))
            self.assertFalse(state["execution_enabled"])
            self.assertEqual(server.execute(cluster,b"SELECT production_sha FROM public.beagu_site_release_state_v1 WHERE id=1;").decode().strip(),self.base)
            with self.assertRaises(RuntimeError):
                server.execute(cluster,legacy,"service_role")
            with self.assertRaisesRegex(ValueError,"final_evidence_mismatch"):
                ledger.finalize(job,self.verified,self.registry,"0"*64)
            final=state["steps"][-1]["evidence"]
            result=ledger.finalize(job,self.verified,self.registry,final)
            self.assertTrue(result["rehearsal"])
            self.assertEqual(result,ledger.finalize(job,self.verified,self.registry,final))
            self.assertEqual(ledger.snapshot(job)["status"],"completed")
            self.assertEqual(server.execute(cluster,b"SELECT production_sha FROM public.beagu_site_release_state_v1 WHERE id=1;").decode().strip(),self.candidate)
            self.assertEqual(server.execute(cluster,("SELECT count(*) FROM public.beagu_site_release_history_v1 WHERE job_id='"+job+"';").encode()).strip(),b"1")
            with self.assertRaisesRegex(ValueError,"finalization_pin_mismatch"):
                ledger.finalize(job,self.verified,self.registry,"0"*64)
            server.execute(cluster,legacy,"service_role")

    def test_postgres_concurrent_claim_and_uncertain_effect(self):
        with b.FixtureCluster() as cluster:
            cluster.sql("fixture_source","CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;")
            server.install(cluster,ROOT,self.base,self.candidate)
            ledger=server.PostgresLedger(cluster)
            job=ledger.create(self.verified,self.registry,self.approval)
            results=[];errors=[];barrier=threading.Barrier(2)
            def worker():
                barrier.wait()
                try:results.append(server.PostgresLedger(cluster).claim(job,self.verified,self.registry,self.base))
                except ValueError as e:errors.append(str(e))
            threads=[threading.Thread(target=worker) for _ in range(2)]
            for t in threads:t.start()
            for t in threads:t.join()
            self.assertEqual(len(results),1);self.assertEqual(errors,["step_already_claimed_or_uncertain"])
            claim=results[0]
            with self.assertRaisesRegex(ValueError,"wrong_step_lease"):
                server.PostgresLedger(cluster,worker_run="2:1").finish(job,claim,"a"*64)
            with self.assertRaisesRegex(ValueError,"step_already_claimed_or_uncertain"):
                server.PostgresLedger(cluster).claim(job,self.verified,self.registry,self.base)
            with self.assertRaisesRegex(ValueError,"wrong_step_lease"):
                ledger.finish(job,{**claim,"lease":"wrong"},"a"*64)
            ledger.finish(job,claim)
            self.assertEqual(ledger.snapshot(job)["status"],"blocked")
            with self.assertRaisesRegex(ValueError,"release_blocked"):
                ledger.claim(job,self.verified,self.registry,self.base)

    def test_complete_pinned_artifact_and_public_exclusion(self):
        inventory,pin=self.package_pins["deploy_edge"]
        self.assertIn("supabase/functions/_shared/fixture.ts",[f["path"] for f in inventory["files"]])
        missing=copy.deepcopy(inventory)
        missing["files"]=[f for f in missing["files"] if "_shared" not in f["path"]]
        with self.assertRaisesRegex(ValueError,"package_inventory_changed"):
            package.build(self.git,self.verified,missing,package.hash_bytes(package.canonical(missing)),self.objects/"bad.tar")
        with self.assertRaisesRegex(ValueError,"package_inventory_pin_mismatch"):
            package.build(self.git,self.verified,inventory,"a"*64,self.objects/"bad.tar")
        with self.assertRaisesRegex(ValueError,"invalid_public_file_set"):
            package.inspect(self.git,self.verified,"publish_pages",None,["index.html","supabase/account.sql"])
        dest=self.objects/"verified.tar"
        receipt=package.build(self.git,self.verified,inventory,pin,dest)
        self.assertTrue(package.verify_artifact(dest,inventory,receipt))
        self.assertFalse(receipt["execution_enabled"])
        dest.write_bytes(dest.read_bytes()+b"tampered")
        with self.assertRaisesRegex(ValueError,"package_artifact_mismatch"):
            package.verify_artifact(dest,inventory,receipt)

    def test_recovery_decisions_preserve_partial_effect_and_require_separate_approval(self):
        with b.FixtureCluster() as cluster:
            cluster.sql("fixture_source","CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.existing(id integer PRIMARY KEY); INSERT INTO public.existing VALUES (1);")
            server.install(cluster,ROOT,self.base,self.candidate)
            ledger=server.PostgresLedger(cluster)
            job=ledger.create(self.verified,self.registry,self.approval)
            obs,owner=Ed25519PrivateKey.generate(),Ed25519PrivateKey.generate()
            def pub(k):return k.public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw)
            def sign(k,p):return {"payload":p,"signature":base64.b64encode(k.sign(recovery.canonical(p))).decode()}
            def evidence(decision,retired=True,absent=True):
                incident=recovery.inspect(ledger,job)
                o=sign(obs,{"kind":"recovery_observation","incident":incident,"worker_retired":retired,"no_effect_verified":absent,
                    "current_state_sha256":r.digest(b.fingerprint(cluster,"fixture_source"))})
                a=sign(owner,{"kind":"recovery_approval","incident_sha256":r.digest(incident),"observation_sha256":r.digest(o),"decision":decision,"confirmed":True})
                return o,a
            proofs=pathlib.Path(self.tmp.name)/"recovery";proofs.mkdir(mode=0o700)
            backup_claim=ledger.claim(job,self.verified,self.registry,self.base)
            ledger.finish(job,backup_claim,"a"*64)
            sql_claim=ledger.claim(job,self.verified,self.registry,self.base)
            # Simulate a mutation which succeeded but whose completion receipt was lost.
            cluster.sql("fixture_source","CREATE TABLE public.fixture_added(id integer PRIMARY KEY); INSERT INTO public.existing VALUES(2);")
            o,a=evidence("abandon_before_mutation")
            with self.assertRaisesRegex(ValueError,"partial_effect_requires_manual_recovery"):
                recovery.decide(ledger,job,o,a,pub(obs),pub(owner),proofs)
            o,a=evidence("hold",absent=False)
            with self.assertRaisesRegex(ValueError,"invalid_recovery_signature"):
                recovery.decide(ledger,job,o,{**a,"signature":"AAAA"},pub(obs),pub(owner),proofs)
            result=recovery.decide(ledger,job,o,a,pub(obs),pub(owner),proofs)
            self.assertEqual(result["status"],"blocked")
            state=ledger.snapshot(job)
            self.assertEqual(state["recovery"][0]["decision"],"hold")
            self.assertEqual(state["steps"][0]["status"],"done")
            self.assertEqual(state["steps"][1]["incident_id"],o["payload"]["incident"]["incident_id"])
            with self.assertRaisesRegex(ValueError,"stale_step_receipt"):
                ledger.finish(job,sql_claim,"a"*64)
            with self.assertRaisesRegex(ValueError,"release_blocked"):
                ledger.claim(job,self.verified,self.registry,self.base)
            self.assertEqual(cluster.sql("fixture_source","SELECT count(*) FROM public.existing;").strip(),b"2")
            self.assertEqual(cluster.sql("fixture_source","SELECT to_regclass('public.fixture_added');").strip(),b"fixture_added")
            self.assertEqual(server.execute(cluster,b"SELECT production_sha FROM public.beagu_site_release_state_v1 WHERE id=1;").decode().strip(),self.base)
            self.assertEqual(len(list(proofs.iterdir())),1)
            with self.assertRaises(RuntimeError):
                server.execute(cluster,b"DELETE FROM public.beagu_integrated_fixture_recovery_v1;","service_role")

    def test_recovery_abandon_only_before_mutation(self):
        with b.FixtureCluster() as cluster:
            cluster.sql("fixture_source","CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;")
            server.install(cluster,ROOT,self.base,self.candidate)
            ledger=server.PostgresLedger(cluster)
            job=ledger.create(self.verified,self.registry,self.approval)
            claim=ledger.claim(job,self.verified,self.registry,self.base)
            ledger.finish(job,claim)
            obs,owner=Ed25519PrivateKey.generate(),Ed25519PrivateKey.generate()
            def pub(k):return k.public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw)
            def sign(k,p):return {"payload":p,"signature":base64.b64encode(k.sign(recovery.canonical(p))).decode()}
            incident=recovery.inspect(ledger,job)
            def signed(retired):
                o=sign(obs,{"kind":"recovery_observation","incident":incident,"worker_retired":retired,"no_effect_verified":True,"current_state_sha256":r.digest(b.fingerprint(cluster,"fixture_source"))})
                a=sign(owner,{"kind":"recovery_approval","incident_sha256":r.digest(incident),"observation_sha256":r.digest(o),"decision":"abandon_before_mutation","confirmed":True})
                return o,a
            proofs=pathlib.Path(self.tmp.name)/"recovery";proofs.mkdir(mode=0o700)
            o,a=signed(False)
            with self.assertRaisesRegex(ValueError,"absence_of_effect_not_verified"):
                recovery.decide(ledger,job,o,a,pub(obs),pub(owner),proofs)
            o,a=signed(True)
            result=recovery.decide(ledger,job,o,a,pub(obs),pub(owner),proofs)
            self.assertEqual(result["status"],"abandoned")
            self.assertEqual(ledger.snapshot(job)["recovery"][0]["decision"],"abandon_before_mutation")
            with self.assertRaisesRegex(ValueError,"release_blocked"):
                ledger.claim(job,self.verified,self.registry,self.base)
            self.assertEqual(ledger.create(self.verified,self.registry,self.approval),job)
            # Old job never reopens; a new candidate would require a separate approval.
            self.assertEqual(server.execute(cluster,b"SELECT production_sha FROM public.beagu_site_release_state_v1 WHERE id=1;").decode().strip(),self.base)

if __name__=="__main__":unittest.main()
