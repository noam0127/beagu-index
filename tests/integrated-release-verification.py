#!/usr/bin/env python3
"""Actual disposable Git objects; no external services or production credentials."""
import copy
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("integrated_verify",ROOT/"scripts/release-manager/integrated_verify.py")
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)

def run(root,*args):
    return subprocess.check_output(["git","-C",str(root),*args],stderr=subprocess.PIPE).decode().strip()

def write(root,path,data):
    f=root/path
    f.parent.mkdir(parents=True,exist_ok=True)
    f.write_bytes(data)

def commit(root):
    run(root,"add","-A")
    run(root,"-c","user.name=fixture","-c","user.email=fixture@example.invalid","commit","-m","fixture")
    return run(root,"rev-parse","HEAD")

def env(plan):
    return {"plan":plan,"plan_sha256":v.digest(plan),"approved":False,"execution_enabled":False}

class Verify(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name)
        run(self.root,"init","-q")
        write(self.root,"index.html",b"old")
        write(self.root,"release-candidate.json",b'{"version":"v1.10.1","summary":"fixture"}')
        self.base=commit(self.root)
        write(self.root,"index.html",b"new")
        write(self.root,"supabase/account.sql",b"SELECT 1;\n")
        write(self.root,"supabase/functions/account/index.ts",b"// fixture only\n")
        self.candidate=commit(self.root)
        items=[]
        for path,status in [("index.html","modified"),("supabase/account.sql","added"),("supabase/functions/account/index.ts","added")]:
            k=v.kind(path)
            items.append({"path":path,"status":status,"blob_sha":run(self.root,"rev-parse",self.candidate+":"+path),"blob_ref":"candidate","previous_path":None,"review_kinds":[k],"backend":k!="web_review","manual_review_required":False})
        self.plan={"schema":1,"policy":"integrated-review-v1","repository":v.REPOSITORY,"base_sha":self.base,"candidate_sha":self.candidate,"version":"v1.10.1","summary":"fixture","backend_required":True,"execution_enabled":False,"inventory":items,"edge_functions":["account"],"requires_shared_dependency_review":False,"requires_manual_review":False,"required_checks":["backup_review","database_review","edge_review","server_verification","pages_verification","post_release_verification"]}

    def verify(self,p=None):
        return v.verify_manifest(self.root,env(self.plan if p is None else p))

    def test_apps_script_is_external_manual_review(self):
        for path in ("scripts/beagu-2026-noon-sync.gs","scripts/beagu-2026-results-core.js","scripts/beagu-2026-results-runtime.js","scripts/build-2026-results.mjs"):
            self.assertEqual(v.kind(path),"manual_review")
        self.assertEqual(v.kind("js/beagu-2026-admin-review.js"),"web_review")
        path="scripts/beagu-2026-noon-sync.gs"
        write(self.root,path,b"// fixture external Apps Script\n")
        target=commit(self.root)
        p=copy.deepcopy(self.plan)
        p.update(candidate_sha=target,requires_manual_review=True)
        p["inventory"].append({"path":path,"status":"added","blob_sha":run(self.root,"rev-parse",target+":"+path),"blob_ref":"candidate","previous_path":None,"review_kinds":["manual_review"],"backend":True,"manual_review_required":True})
        p["inventory"].sort(key=lambda f:f["path"])
        verified=self.verify(p)
        self.assertTrue(next(f for f in verified["files"] if f["path"]==path)["manual"])
        altered=copy.deepcopy(p)
        next(f for f in altered["inventory"] if f["path"]==path).update(backend=False,manual_review_required=False,review_kinds=["web_review"])
        with self.assertRaises(ValueError):self.verify(altered)

    def test_actual_blobs_and_worktree_independence(self):
        a=self.verify()
        write(self.root,"supabase/account.sql",b"tampered worktree")
        self.assertEqual(a,self.verify())
        self.assertEqual(a["files"][1]["sha256"],v.hashlib.sha256(b"SELECT 1;\n").hexdigest())
        self.assertFalse(a["execution_enabled"])

    def test_tamper_and_missing_paths(self):
        for mutate in [
            lambda p:p["inventory"].pop(),
            lambda p:p["inventory"][1].update(blob_sha="a"*40),
            lambda p:p["inventory"][1].update(backend=False),
            lambda p:p["inventory"][1].update(blob_ref="base"),
            lambda p:p["inventory"][1].update(path="../escape"),
            lambda p:p.update(base_sha=self.candidate,candidate_sha=self.base),
            lambda p:p.update(summary="forged")]:
            p=copy.deepcopy(self.plan)
            mutate(p)
            with self.assertRaises(ValueError):self.verify(p)
        forged=env(self.plan)
        forged["plan_sha256"]="a"*64
        with self.assertRaisesRegex(ValueError,"plan_digest_mismatch"):v.verify_manifest(self.root,forged)

    def test_rename_and_removal(self):
        (self.root/"index.html").unlink()
        (self.root/"supabase/account.sql").rename(self.root/"supabase/renamed.sql")
        target=commit(self.root)
        p=copy.deepcopy(self.plan)
        p.update(base_sha=self.candidate,candidate_sha=target,edge_functions=[],requires_manual_review=True)
        p["inventory"]=[
            {"path":"index.html","status":"removed","blob_sha":run(self.root,"rev-parse",self.candidate+":index.html"),"blob_ref":"base","previous_path":None,"review_kinds":["web_review"],"backend":False,"manual_review_required":False},
            {"path":"supabase/renamed.sql","status":"renamed","blob_sha":run(self.root,"rev-parse",target+":supabase/renamed.sql"),"blob_ref":"candidate","previous_path":"supabase/account.sql","review_kinds":["db_review"],"backend":True,"manual_review_required":True}]
        self.assertEqual(len(self.verify(p)["files"]),2)
        p["inventory"][1]["previous_path"]="supabase/missing.sql"
        with self.assertRaises(ValueError):self.verify(p)

    def test_symlink_denied(self):
        (self.root/"supabase/account.sql").unlink()
        (self.root/"supabase/account.sql").symlink_to("/etc/passwd")
        target=commit(self.root)
        p=copy.deepcopy(self.plan)
        p["candidate_sha"]=target
        p["inventory"][1]["blob_sha"]=run(self.root,"rev-parse",target+":supabase/account.sql")
        with self.assertRaisesRegex(ValueError,"non_regular_git_file"):self.verify(p)

    def test_trusted_registry_and_operation_order(self):
        verified=self.verify()
        def task(op,files=[],edge=None):
            return {"op":op,"files":files,"edge_function":edge}
        pin=lambda f:{"path":f["path"],"sha256":f["sha256"]}
        recipe={k:verified[k] for k in ("plan_sha256","base_sha","candidate_sha")}
        recipe["tasks"]=[task("backup"),task("apply_sql",[pin(verified["files"][1])]),task("deploy_edge",[pin(verified["files"][2])],"account"),task("verify_backend"),task("publish_pages"),task("verify_live")]
        registry={"schema":1,"recipes":[recipe]}
        self.assertTrue(v.validate_recipe(verified,registry)["recipe_verified"])
        self.assertFalse(v.validate_recipe(verified,registry)["execution_enabled"])
        for mutate in [
            lambda r:r["recipes"].clear(),
            lambda r:r["recipes"].append(copy.deepcopy(r["recipes"][0])),
            lambda r:r["recipes"][0].update(candidate_sha="a"*40),
            lambda r:r["recipes"][0]["tasks"][1].update(op="shell"),
            lambda r:r["recipes"][0]["tasks"][1]["files"][0].update(sha256="a"*64),
            lambda r:r["recipes"][0]["tasks"][2].update(edge_function="other"),
            lambda r:r["recipes"][0]["tasks"].pop(1),
            lambda r:r["recipes"][0]["tasks"].reverse(),
            lambda r:r["recipes"][0]["tasks"][0].update(command="untrusted")]:
            bad=copy.deepcopy(registry)
            mutate(bad)
            with self.assertRaises(ValueError):v.validate_recipe(verified,bad)
        with self.assertRaisesRegex(ValueError,"no_unique_trusted_recipe"):v.inspect_trusted_recipe(self.root,env(self.plan))

if __name__=="__main__":unittest.main()
