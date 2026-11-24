"""Drive adapter tests: synthetic encrypted data and fake HTTP only."""
import os
import pathlib
import sys
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_drive_checkpoint as d
import integrated_vault as v

FOLDER="fixture_folder_123"
OWNER="fixture_owner_123"
FILE="fixture_file_123"
PINS=("a"*64,"b"*40,"c"*40)
class Fake:
    def __init__(self,answers):self.answers=list(answers);self.calls=[]
    def request(self,host,method,path,headers,body=None):
        self.calls.append((host,method,path,headers,body))
        if not self.answers:raise AssertionError("unexpected request")
        return self.answers.pop(0)

def response(meta):return (200,{},v.canonical(meta))
def permissions():return response({"permissions":[{"id":OWNER,"type":"user","role":"owner"}]})
def folder():return response({"id":FOLDER,"mimeType":d.FOLDER,"shared":False,"ownedByMe":True,"trashed":False,"capabilities":{"canAddChildren":True}})

class Drive(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=pathlib.Path(self.tmp.name);self.key=os.urandom(32);self.data=b"synthetic private fixture"
        manifest={"schema":1,"scope":v.SCOPE,"checkpoint_id":"d"*32,"plan_sha256":PINS[0],"base_sha":PINS[1],"candidate_sha":PINS[2],"dump_sha256":v.digest(self.data),"dump_size":len(self.data),"fingerprint":{}}
        self.pin=v.seal(self.root,self.key,"fixture-key",manifest,self.data,*PINS)
        self.raw=(self.root/("d"*32+".vault")).read_bytes()
        self.sha=v.digest(self.raw)
    def run_transfer(self,f,key=None):
        return d.DriveCheckpoint(FOLDER,OWNER,f).transfer_fixture(self.root,key if key is not None else self.key,"fixture-key",self.pin,*PINS,"write-fixture","read-fixture")
    def answers(self):
        return [folder(),permissions(),folder(),permissions(),(200,{"Location":"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=fixture_session"},b""),response({"id":FILE}),response({"id":FILE,"mimeType":d.MIME,"name":self.sha+".vault","parents":[FOLDER],"size":str(len(self.raw)),"sha256Checksum":self.sha,"shared":False,"ownedByMe":True,"trashed":False}),permissions(),(200,{},self.raw),folder(),permissions()]
    def test_encrypted_only_and_private_readback(self):
        f=Fake(self.answers())
        receipt=self.run_transfer(f)
        self.assertTrue(receipt["readback_verified"] and receipt["encryption_verified"])
        for k in ("durable_storage_verified","restore_verified","execution_enabled"):self.assertFalse(receipt[k])
        self.assertEqual([c[1] for c in f.calls],["GET","GET","GET","GET","POST","PUT","GET","GET","GET","GET","GET"])
        self.assertEqual(f.calls[5][4],self.raw);self.assertNotIn(self.data,self.raw)
        self.assertNotIn(self.key,f.calls[5][4])
        self.assertTrue(all(c[0]==d.HOST for c in f.calls))
        self.assertEqual(f.calls[8][3]["Authorization"],"Bearer read-fixture")
        self.assertEqual(f.answers,[])
    def test_denials_before_transfer(self):
        f=Fake([])
        with self.assertRaisesRegex(ValueError,"vault_authentication_failed"):self.run_transfer(f,os.urandom(32))
        self.assertEqual(f.calls,[])
        for bad in [{"permissions":[{"id":OWNER,"type":"user","role":"owner"},{"type":"anyone","role":"reader"}]},{"nextPageToken":"more","permissions":[{"id":OWNER,"type":"user","role":"owner"}]}]:
            f=Fake([folder(),response(bad)])
            with self.assertRaisesRegex(ValueError,"drive_permissions_not_private"):self.run_transfer(f)
            self.assertEqual(len(f.calls),2)
        f=Fake(self.answers()[:4]+[(200,{"Location":"https://evil.invalid/upload/drive/v3/files?uploadType=resumable&upload_id=bad"},b"")])
        with self.assertRaisesRegex(ValueError,"drive_invalid_upload_session"):self.run_transfer(f)
        self.assertEqual(len(f.calls),5)
        with self.assertRaisesRegex(ValueError,"drive_live_transport_disabled"):d.DriveCheckpoint(FOLDER,OWNER).verify_folder("fixture")
    def test_uncertain_and_tampered_readback(self):
        a=self.answers();a[5]=(308,{},b"")
        f=Fake(a)
        with self.assertRaisesRegex(ValueError,"drive_upload_outcome_uncertain"):self.run_transfer(f)
        self.assertEqual(len(f.calls),6)
        a=self.answers();a[8]=(200,{},b"x"*len(self.raw))
        f=Fake(a)
        with self.assertRaisesRegex(ValueError,"drive_upload_readback_mismatch"):self.run_transfer(f)
        self.assertEqual(len(f.calls),9)
if __name__=="__main__":unittest.main()
