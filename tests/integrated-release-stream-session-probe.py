import pathlib
import sys
import tempfile
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_stream_session_probe as p
import integrated_drive_checkpoint as d
import integrated_vault as v
C={"schema":1,"folder_id":"fixture_folder","owner_permission_id":"fixture_owner","client_id":"test.apps.googleusercontent.com","client_secret":"fake","refresh_token":"fake"}
class Setup:
    def request(self,host,method,path,headers,body=None):
        if host=="oauth2.googleapis.com":
            return 200,{},v.canonical({"token_type":"Bearer","scope":"https://www.googleapis.com/auth/drive.file","expires_in":3600,"access_token":"synthetic"})
        assert method=="GET"
        if "/permissions?" in path:return 200,{},v.canonical({"permissions":[{"id":C["owner_permission_id"],"role":"owner","type":"user"}]})
        return 200,{},v.canonical({"id":C["folder_id"],"shared":False,"ownedByMe":True,"trashed":False,"mimeType":d.FOLDER,"capabilities":{"canAddChildren":True}})
class Response:
    status=200
    def read(self,n):return b""
    def getheaders(self):return [("Location","https://www.googleapis.com/upload/drive/v3/files?upload_id=DO_NOT_OUTPUT&upload_protocol=resumable&alt=json")]
class Connection:
    calls=[]
    def __init__(self,host,**kwargs):assert host==d.HOST
    def request(self,method,path,body=None,headers=None):
        assert method=="POST" and path==d.UPLOAD+"?uploadType=resumable"
        assert v.parse(body)["parents"]==[C["folder_id"]]
        self.calls.append(method)
    def getresponse(self):return Response()
    def close(self):pass
class Probe(unittest.TestCase):
    def test_redacts_values_and_preserves_attempts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp).resolve()
            for name in p.PREVIOUS:
                v.write_exclusive(root,name,v.canonical({"scope":"synthetic_large_pg17_attempt","execution_enabled":False}))
            before=[(root/n).read_bytes() for n in p.PREVIOUS]
            result=p.probe(C,root,Setup(),Connection)
            self.assertEqual(result["unknown_query_keys"],["alt"])
            self.assertFalse(result["current_parser_accepts"])
            self.assertFalse(result["media_upload_attempted"])
            self.assertNotIn("DO_NOT_OUTPUT",str(result))
            self.assertEqual(Connection.calls,["POST"])
            self.assertEqual(before,[(root/n).read_bytes() for n in p.PREVIOUS])
            with self.assertRaises(ValueError):p.probe(C,root,Setup(),Connection)
            self.assertEqual(Connection.calls,["POST"])
    def test_rejects_untrusted_origin(self):
        x=p.describe("https://evil.example/upload/drive/v3/files?secret=DO_NOT_OUTPUT")
        self.assertFalse(x["origin_and_path_valid"])
        self.assertEqual(x["query_keys"],[])
if __name__=="__main__":unittest.main()
