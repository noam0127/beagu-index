"""Provider adapter contract with synthetic HTTP responses only."""
import io
import json
import pathlib
import sys
import tarfile
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_provider as p
import integrated_verify as v
import integrated_package as pkg

BASE="a"*40;CAND="b"*40;PLAN="c"*64;BUNDLE="d"*64;PROJECT="x"*20
def response(code,value):return code,p.canonical(value)
def tar(files):
    buf=io.BytesIO()
    with tarfile.open(fileobj=buf,mode="w") as t:
        for name,data in files:
            info=tarfile.TarInfo(name);info.size=len(data);t.addfile(info,io.BytesIO(data))
    return buf.getvalue()
class Fake:
    def __init__(self,answers):self.answers=list(answers);self.calls=[]
    def request(self,host,method,path,headers,body=None):
        self.calls.append((host,method,path,headers,body))
        if not self.answers:raise AssertionError("unexpected provider request")
        return self.answers.pop(0)
class Provider(unittest.TestCase):
    def test_transport_disabled(self):
        with self.assertRaisesRegex(ValueError,"production_transport_disabled"):
            p.ProviderAdapter(PROJECT).edge_metadata("account","fixture")
    def test_edge_post_and_independent_readback(self):
        files=[("supabase/functions/account/index.ts",b"fixture")]
        raw=tar(files)
        inv={"operation":"deploy_edge","edge_function":"account","candidate_sha":CAND,"plan_sha256":PLAN,"files":[{"path":n,"sha256":p.hash_bytes(d)} for n,d in files]}
        approved={"project":PROJECT,"slug":"account","plan_sha256":PLAN,"candidate_sha":CAND,"inventory_sha256":p.hash_bytes(p.canonical(inv)),"artifact_sha256":p.hash_bytes(raw),"verify_jwt":False,"previous_version":1,"entrypoint_path":files[0][0],"import_map_path":None,"expected_bundle_sha256":BUNDLE}
        before={"slug":"account","status":"ACTIVE","version":1}
        after={"slug":"account","status":"ACTIVE","id":"fixture","version":2,"verify_jwt":False,"ezbr_sha256":BUNDLE}
        f=Fake([response(200,before),response(201,after),response(200,after)])
        result=p.ProviderAdapter(PROJECT,f).deploy_edge(raw,inv,p.hash_bytes(raw),approved,"write-fixture","read-fixture")
        self.assertEqual(result["version"],2);self.assertFalse(result["runtime_verified"])
        self.assertEqual([x[1] for x in f.calls],["GET","POST","GET"])
        self.assertIn(b'name="metadata"',f.calls[1][4]);self.assertIn(b'filename="supabase/functions/account/index.ts"',f.calls[1][4])
        self.assertEqual(f.calls[2][3]["Authorization"],"Bearer read-fixture")
        f=Fake([response(200,before),response(201,after),response(200,{**after,"ezbr_sha256":"0"*64})])
        with self.assertRaisesRegex(ValueError,"edge_readback_mismatch"):
            p.ProviderAdapter(PROJECT,f).deploy_edge(raw,inv,p.hash_bytes(raw),approved,"write-fixture","read-fixture")
        f=Fake([response(200,{**before,"version":8})])
        with self.assertRaisesRegex(ValueError,"edge_base_changed"):
            p.ProviderAdapter(PROJECT,f).deploy_edge(raw,inv,p.hash_bytes(raw),approved,"write-fixture","read-fixture")
        self.assertEqual(len(f.calls),1)
    def test_pages_indexed_artifact_and_live_verification(self):
        meta=p.canonical({"commit":CAND,"version":"v1.10.1","environment":"production"})
        inv={"operation":"publish_pages","candidate_sha":CAND,"plan_sha256":PLAN,"files":[{"path":"index.html","sha256":p.hash_bytes(b"new")},{"path":"release-info.json","sha256":p.hash_bytes(meta)}]}
        approved={"repository":v.REPOSITORY,"workflow_sha":BASE,"run_id":123,"artifact_id":456,"artifact_zip_sha256":BUNDLE,"candidate_sha":CAND,"plan_sha256":PLAN}
        art={"id":456,"name":"github-pages","expired":False,"digest":"sha256:"+BUNDLE,"workflow_run":{"id":123,"head_sha":BASE}}
        f=Fake([response(200,art),response(200,{"id":"fixture-deployment"}),response(200,{"status":"succeed"}),(200,b"new"),(200,meta)])
        a=p.ProviderAdapter(PROJECT,f)
        receipt=a.publish_pages(approved,"writer","reader","fixture-oidc")
        self.assertFalse(receipt["live_verified"])
        self.assertEqual(json.loads(f.calls[1][4])["pages_build_version"],BASE)
        self.assertTrue(a.verify_pages(receipt,"reader",inv,"v1.10.1")["live_verified"])
        self.assertTrue(all("Authorization" not in x[3] for x in f.calls[-2:]))
        f=Fake([response(200,{**art,"expired":True})])
        with self.assertRaisesRegex(ValueError,"pages_artifact_mismatch"):
            p.ProviderAdapter(PROJECT,f).publish_pages(approved,"writer","reader","oidc")
        self.assertEqual(len(f.calls),1)
        f=Fake([response(200,{"status":"succeed"}),(200,b"old")])
        with self.assertRaisesRegex(ValueError,"live_file_mismatch"):
            p.ProviderAdapter(PROJECT,f).verify_pages(receipt,"reader",inv,"v1.10.1")
        f=Fake([response(200,{"status":"building"})])
        with self.assertRaisesRegex(ValueError,"pages_not_ready"):
            p.ProviderAdapter(PROJECT,f).verify_pages(receipt,"reader",inv,"v1.10.1")
if __name__=="__main__":unittest.main()
