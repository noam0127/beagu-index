import importlib.util
import pathlib
import sys
import unittest
import json
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
    def test_stream_range_observation(self):
        import integrated_stream_fixture as stream
        raw=stream.MAGIC+b"x"*(o.RANGE+9)
        expected=v.digest(raw)
        class Fake(f.Fake):
            def request(self,host,method,path,headers,body=None):
                if host==s.TOKEN_HOST:return f.Refresh().request()
                assert method=="GET" and body is None
                if path==d.API+"/"+f.FILE+"?alt=media":
                    a,b=map(int,headers["Range"][6:].split("-"))
                    return 206,{"Content-Range":f"bytes {a}-{b}/{len(raw)}"},raw[a:b+1]
                status,h,body=super().request(host,method,path,headers,body)
                if path.startswith(d.API+"/"+f.FILE+"?fields="):
                    q=json.loads(body);q["name"]=expected+".stream";body=json.dumps(q).encode()
                return status,h,body
        r=o.observe(f.C,f.FILE,expected,Fake(f.C["folder_id"],raw))
        self.assertEqual(r["bytes"],len(raw))
        self.assertTrue(r["remote_ciphertext_verified"])
        self.assertFalse(r["independent_observer_verified"])
        self.assertFalse(r["production_backup_proof"])
        class WrongRange(Fake):
            def request(self,host,method,path,headers,body=None):
                status,h,raw=super().request(host,method,path,headers,body)
                if status==206:h={"Content-Range":"bytes 0-1/2"}
                return status,h,raw
        with self.assertRaisesRegex(ValueError,"observer_range_mismatch"):
            o.observe(f.C,f.FILE,expected,WrongRange(f.C["folder_id"],raw))
    def test_denies_mutation(self):
        def denied(*a,**k):raise AssertionError("network called")
        t=o.ReadOnly(f.C["folder_id"],f.FILE,denied)
        for method,path in (("POST",d.UPLOAD+"?uploadType=multipart"),("DELETE",d.API+"/"+f.FILE),("GET",d.API+"/unrelated_file")):
            with self.assertRaises(ValueError):t.request(d.HOST,method,path,{})
if __name__=="__main__":unittest.main()
