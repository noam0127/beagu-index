import importlib.util
import pathlib
import sys
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_drive_fixture_observer as o
import integrated_vault as v
import integrated_drive_checkpoint as d
import integrated_drive_setup as s
spec=importlib.util.spec_from_file_location("drive_fixture_test",ROOT/"tests/integrated-release-drive-rehearsal.py")
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class Observer(unittest.TestCase):
    def test_exact_readback_never_authorizes(self):
        raw=v.MAGIC+b"synthetic"
        class Fake(f.Fake):
            def request(self,host,method,path,headers,body=None):
                if host==s.TOKEN_HOST:return f.Refresh().request()
                assert method=="GET" and body is None
                return super().request(host,method,path,headers,body)
        result=o.observe(f.C,f.FILE,v.digest(raw),Fake(f.C["folder_id"],raw))
        self.assertTrue(result["remote_ciphertext_verified"])
        for k in ("independent_observer_verified","restore_verified","production_backup_proof","execution_enabled"):self.assertFalse(result[k])
        with self.assertRaisesRegex(ValueError,"observer_bytes_mismatch"):o.observe(f.C,f.FILE,v.digest(raw),Fake(f.C["folder_id"],raw,True))
    def test_denies_mutation(self):
        def denied(*a,**k):raise AssertionError("network called")
        t=o.ReadOnly(f.C["folder_id"],f.FILE,denied)
        for method,path in (("POST",d.UPLOAD+"?uploadType=multipart"),("DELETE",d.API+"/"+f.FILE),("GET",d.API+"/unrelated_file")):
            with self.assertRaises(ValueError):t.request(d.HOST,method,path,{})
if __name__=="__main__":unittest.main()
