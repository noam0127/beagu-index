"""Real isolated PG17, disk-backed simulated Drive resumable and range transport."""
import hashlib
import io
import os
import pathlib
import sys
import tempfile
import unittest
from urllib.parse import urlsplit,parse_qs
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_stream_pg_fixture as pg
import integrated_stream_drive_fixture as r
import integrated_stream_fixture as s
import integrated_drive_checkpoint as d
import integrated_vault as v

FID="fixture_file"
class Fake:
    scope=r.SCOPE
    def __init__(self,root,fail=None):
        self.path=root/"remote.bin";self.fail=fail;self.offset=0;self.posts=0;self.puts=0;self.hash=hashlib.sha256()
    def request(self,host,method,path,headers,body=None):
        assert host==d.HOST and headers["Authorization"]=="Bearer "+r.TOKEN
        u=urlsplit(path)
        def response(obj):return 200,{},v.canonical(obj)
        if method=="POST":
            self.posts+=1;assert self.posts==1
            self.meta=v.parse(body);self.total=int(headers["X-Upload-Content-Length"])
            assert parse_qs(u.query)["uploadType"]==["resumable"]
            self.path.touch(mode=0o600,exist_ok=False)
            return 200,{"Location":"https://www.googleapis.com/upload/drive/v3/files?upload_id=fixture&upload_protocol=resumable"},b""
        if method=="PUT":
            self.puts+=1
            assert len(body)<=r.UPLOAD_CHUNK and headers["Content-Range"]==f"bytes {self.offset}-{self.offset+len(body)-1}/{self.total}"
            with self.path.open("ab") as f:f.write(body)
            self.hash.update(body);self.offset+=len(body)
            if self.fail=="ack":return 308,{"Range":"bytes=0-0"},b""
            if self.offset<self.total:return 308,{"Range":f"bytes=0-{self.offset-1}"},b""
            return response({"id":FID})
        assert method=="GET"
        if u.path.endswith("/permissions"):return response({"permissions":[{"id":r.OWNER,"type":"user","role":"owner"}]})
        if u.path.endswith("/"+r.FOLDER):return response({"id":r.FOLDER,"mimeType":d.FOLDER,"shared":False,"ownedByMe":True,"trashed":False,"capabilities":{"canAddChildren":True}})
        assert u.path.endswith("/"+FID)
        if parse_qs(u.query)=={"alt":["media"]}:
            start,end=map(int,headers["Range"][6:].split("-"))
            with self.path.open("rb") as f:f.seek(start);raw=f.read(end-start+1)
            if self.fail=="readback":raw=bytes([raw[0]^1])+raw[1:]
            return 206,{"Content-Range":f"bytes {start}-{end}/{self.total}"},raw
        return response({"id":FID,**self.meta,"size":str(self.total),"sha256Checksum":self.hash.hexdigest(),"shared":False,"ownedByMe":True,"trashed":False})
class PGStream(unittest.TestCase):
    def test_actual_pg17_large_simulated_remote(self):
        with tempfile.TemporaryDirectory() as temp:
            result=pg.rehearsal(pathlib.Path(temp).resolve(),Fake)
            self.assertGreater(result["dump_bytes"],128*1024**2)
            self.assertEqual(result["fixture_rows"],192)
            self.assertTrue(result["stream_restore_verified"] and result["remote_readback_verified"] and result["schema_rows_sequences_rls_verified"])
            self.assertFalse(result["actual_drive_transfer_verified"] or result["production_backup_proof"] or result["execution_enabled"])
    def test_no_retry_or_partial_publication(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp).resolve()
            a=root/"send";a.mkdir(mode=0o700)
            b=root/"receive";b.mkdir(mode=0o700)
            raw=b"synthetic"*(600000)
            pin=s.seal(a,io.BytesIO(raw),len(raw),os.urandom(32),pg.KEY_ID,*pg.PINS)
            for fail in ("ack","readback"):
                remote=root/fail;remote.mkdir(mode=0o700)
                fake=Fake(remote,fail)
                with self.assertRaises(ValueError):r.transfer(a,b,pin,fake)
                self.assertEqual(fake.posts,1)
                if fail=="ack":self.assertEqual(fake.puts,1)
                self.assertEqual(list(b.iterdir()),[])
            with self.assertRaises(ValueError):r.transfer(a,b,pin,object())
            for bad in ("https://evil.example/upload/drive/v3/files?upload_id=fixture","https://www.googleapis.com/upload/drive/v3/files?upload_id=x&upload_id=y"):
                with self.assertRaises(ValueError):r.session_path(bad)
if __name__=="__main__":unittest.main()
