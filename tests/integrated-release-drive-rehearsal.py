"""Synthetic actual SQLite restore with simulated Drive network only."""
import pathlib
import sys
import tempfile
import unittest
from urllib.parse import parse_qs,urlsplit
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_drive_rehearsal as r
import integrated_drive_checkpoint as d
import integrated_drive_setup as s
import integrated_vault as v
C={"schema":1,"folder_id":"fixture_folder","owner_permission_id":"fixture_owner","client_id":"fixture.apps.googleusercontent.com","client_secret":"fixture-secret","refresh_token":"fixture-refresh"}
FILE="fixture_file_123"
def resp(x):return 200,{},v.canonical(x)
class Refresh:
    def request(self,*args):return resp({"access_token":"fixture-access","expires_in":3600,"scope":s.SCOPE,"token_type":"Bearer"})
class Fake:
    def __init__(self,folder,raw,bad=False):
        self.folder,self.raw,self.bad=folder,raw,bad
        self.downloaded=None;self.calls=[]
    def request(self,host,method,path,headers,body=None):
        self.calls.append(method)
        u=urlsplit(path)
        if method=="POST":return 200,{"Location":"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=fixture"},b""
        if method=="PUT":
            assert body==self.raw
            return resp({"id":FILE})
        if u.path.endswith("/permissions"):return resp({"permissions":[{"id":C["owner_permission_id"],"type":"user","role":"owner"}]})
        if parse_qs(u.query)=={"alt":["media"]}:
            self.downloaded=b"x"*len(self.raw) if self.bad else self.raw
            return 200,{},self.downloaded
        if u.path.endswith("/"+self.folder):return resp({"id":self.folder,"mimeType":d.FOLDER,"shared":False,"ownedByMe":True,"trashed":False,"capabilities":{"canAddChildren":True}})
        return resp({"id":FILE,"mimeType":d.MIME,"name":v.digest(self.raw)+".vault","parents":[self.folder],"size":str(len(self.raw)),"sha256Checksum":v.digest(self.raw),"shared":False,"ownedByMe":True,"trashed":False})
class Rehearsal(unittest.TestCase):
    def test_remote_bytes_are_restored(self):
        # Temp folder must be a canonical private directory outside checkout.
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp).resolve()
            result=r.rehearsal(root,C,Fake,Refresh())
            self.assertTrue(result["encrypted_upload_verified"] and result["fixture_restore_verified"])
            self.assertEqual(result["fixture_rows"],3)
            for k in ("actual_postgresql_remote_restore_verified","production_backup_executed","independent_observer_verified","execution_enabled"):self.assertFalse(result[k])
            self.assertEqual(list(root.iterdir()),[])
            with self.assertRaisesRegex(ValueError,"drive_upload_readback_mismatch"):r.rehearsal(root,C,lambda folder,raw:Fake(folder,raw,True),Refresh())
    def test_preflight_is_read_only_and_error_output_is_safe(self):
        class ReadOnly:
            def request(self,host,method,path,headers,body=None):
                if host==s.TOKEN_HOST:return Refresh().request()
                assert method=="GET" and body is None
                return Fake(C["folder_id"],b"").request(host,method,path,headers,body)
        def denied(*a,**k):raise AssertionError("upload transport constructed")
        with tempfile.TemporaryDirectory() as temp:
            state={}
            result=r.rehearsal(pathlib.Path(temp).resolve(),C,denied,ReadOnly(),preflight_only=True,state=state)
            self.assertTrue(result["local_fixture_verified"] and result["folder_private"])
            self.assertFalse(result["upload_attempted"] or result["execution_enabled"])
            self.assertFalse(state.get("upload_may_be_attempted"))
        self.assertEqual(r.error_code(ValueError("drive_upload_readback_mismatch")),"drive_upload_readback_mismatch")
        self.assertEqual(r.error_code(ValueError("untrusted secret payload")),"unclassified_error")
        self.assertEqual(r.error_code(OSError("private path")),"local_io_error")
    def test_real_transport_denies_unrelated_effects(self):
        def forbidden(*a,**k):raise AssertionError("network attempted")
        t=r.FixtureTransport(C["folder_id"],v.MAGIC+b"fixture",connection=forbidden)
        for method,path,body in (("DELETE",d.API+"/"+C["folder_id"],None),("GET",d.API+"/other_file",None),("PUT",d.UPLOAD+"?upload_id=unexpected",b"bad"),("POST",d.UPLOAD+"?uploadType=resumable",b"bad")):
            with self.assertRaises(ValueError):t.request(d.HOST,method,path,{},body)
if __name__=="__main__":unittest.main()
