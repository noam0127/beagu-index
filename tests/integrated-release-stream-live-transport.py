import hashlib
import io
import os
import pathlib
import sys
import tempfile
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_stream_drive_live_rehearsal as live
import integrated_stream_drive_fixture as r
import integrated_drive_checkpoint as d
class Response:
    status=200
    def read(self,n):return b""
    def getheaders(self):return [("Location","https://www.googleapis.com/upload/drive/v3/files?upload_id=fixture&upload_protocol=resumable")]
class Connection:
    def __init__(self,*args,**kwargs):pass
    def request(self,*args,**kwargs):pass
    def getresponse(self):return Response()
    def close(self):pass
class Guard(unittest.TestCase):
    def test_persistent_create_guard_and_endpoint_restrictions(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp).resolve()
            # Exercise network guard without generating another huge file or any live request.
            t=live.LocalFixtureHTTPS.__new__(live.LocalFixtureHTTPS)
            t.folder="fixture_folder";t.registry=root;t.connection=Connection
            t.total=192*1024**2;t.digest="a"*64;t.meta=b"fixed metadata"
            t.posted=False;t.session=None;t.file_id=None;t.offset=0
            path=d.UPLOAD+"?uploadType=resumable&fields="+d.FIELDS
            headers={"X-Upload-Content-Length":str(t.total),"X-Upload-Content-Type":d.MIME}
            for host,method,p,body in (("evil.example","POST",path,t.meta),(d.HOST,"DELETE",path,None),(d.HOST,"POST",path,b"other")):
                with self.assertRaises(ValueError):t.request(host,method,p,headers,body)
            self.assertFalse((root/live.MARKER).exists())
            t.request(d.HOST,"POST",path,headers,t.meta)
            self.assertTrue((root/live.MARKER).exists())
            self.assertEqual((root/live.MARKER).stat().st_mode&0o777,0o600)
            with self.assertRaises(ValueError):t.request(d.HOST,"POST",path,headers,t.meta)
            t.posted=False
            with self.assertRaises(FileExistsError):t.request(d.HOST,"POST",path,headers,t.meta)
            t.posted=True
            with self.assertRaises(ValueError):t.request(d.HOST,"PUT","/other",{},b"bad")
            with self.assertRaises(ValueError):t.request(d.HOST,"GET",d.API+"/unrelated",{})
if __name__=="__main__":unittest.main()
