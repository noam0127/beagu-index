"""Offline setup preflight; no real OAuth credentials or network."""
import pathlib
import sys
import tempfile
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_drive_setup as s
import integrated_vault as v
import integrated_drive_checkpoint as d

C={"schema":1,"folder_id":"fixture_folder","owner_permission_id":"fixture_owner","client_id":"fixture.apps.googleusercontent.com","client_secret":"secret-fixture","refresh_token":"refresh-fixture"}
def resp(o):return 200,{},v.canonical(o)
class Fake:
    def __init__(self,responses):self.responses=list(responses);self.calls=[]
    def request(self,*args):self.calls.append(args);return self.responses.pop(0)
class Setup(unittest.TestCase):
    def test_private_key_and_config(self):
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td);repo=root/"repo";repo.mkdir()
            private=root/"private";private.mkdir(mode=0o700)
            path=private/"oauth.json";path.write_bytes(v.canonical(C));path.chmod(0o600)
            self.assertEqual(s.read_config(path,repo),C)
            path.chmod(0o644)
            with self.assertRaisesRegex(ValueError,"unsafe_credential_file"):s.read_config(path,repo)
            with self.assertRaisesRegex(ValueError,"credential_inside_checkout_or_link"):s.key_file(repo/"key",True,repo)
            key=private/"key";s.key_file(key,True,repo);s.key_file(key,False,repo)
            self.assertEqual(key.stat().st_size,32)
            with self.assertRaises(FileExistsError):s.key_file(key,True,repo)
    def test_refresh_scope_and_readonly_preflight(self):
        token={"access_token":"access-fixture","expires_in":3600,"scope":s.SCOPE,"token_type":"Bearer"}
        folder={"id":C["folder_id"],"mimeType":d.FOLDER,"shared":False,"ownedByMe":True,"trashed":False,"capabilities":{"canAddChildren":True}}
        perms={"permissions":[{"id":C["owner_permission_id"],"type":"user","role":"owner"}]}
        f=Fake([resp(token),resp(folder),resp(perms)])
        result=s.preflight(C,f)
        self.assertTrue(result["oauth_scope_verified"] and result["folder_private"])
        self.assertFalse(result["actual_upload_verified"] or result["execution_enabled"])
        self.assertEqual([c[1] for c in f.calls],["POST","GET","GET"])
        self.assertNotIn("fixture",str(result))
        for scope in ("https://www.googleapis.com/auth/drive",s.SCOPE+" https://www.googleapis.com/auth/drive",None):
            f=Fake([resp({**token,"scope":scope})])
            with self.assertRaisesRegex(ValueError,"oauth_scope_or_expiry_not_verified"):s.preflight(C,f)
            self.assertEqual(len(f.calls),1)
        # Real transport's endpoint guard rejects writes before constructing TLS connection.
        def forbidden(*a,**k):raise AssertionError("network attempted")
        t=s.SetupHTTPS(C["folder_id"],connection=forbidden)
        for host,method,path,body in [(d.HOST,"POST",d.UPLOAD+"?uploadType=resumable",b"x"),(d.HOST,"GET",d.API+"/other_folder",None),("evil.invalid","POST","/token",b"x")]:
            with self.assertRaisesRegex(ValueError,"setup_endpoint_denied"):t.request(host,method,path,{},body)
if __name__=="__main__":unittest.main()
