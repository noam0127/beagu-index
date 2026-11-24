import copy
import importlib.util
import pathlib
import sys
import unittest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_fixture_attestation as a
import integrated_vault as v
import integrated_drive_setup as s
import integrated_production as prod
spec=importlib.util.spec_from_file_location("drive_fixture_test",ROOT/"tests/integrated-release-drive-rehearsal.py")
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class Fake(f.Fake):
    def request(self,host,method,path,headers,body=None):
        if host==s.TOKEN_HOST:return f.Refresh().request()
        assert method=="GET" and body is None
        return super().request(host,method,path,headers,body)
class Attestation(unittest.TestCase):
    def test_pins_signature_and_scope(self):
        raw=v.MAGIC+b"synthetic"
        pins={"challenge":"a"*64,"candidate_sha":"b"*40,"plan_sha256":"c"*64,"fixture_object_sha256":v.digest(raw),"file_id":f.FILE,"folder_id":f.C["folder_id"]}
        key=Ed25519PrivateKey.generate()
        pub=key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        proof=a.sign_observed(f.C,pins,key,Fake(f.C["folder_id"],raw))
        result=a.verify(proof,pub,pins)
        self.assertTrue(result["signature_verified"])
        for k in ("independent_observer_verified","production_backup_proof","execution_enabled"):self.assertFalse(result[k])
        with self.assertRaises(ValueError):a.verify(proof,pub,{**pins,"challenge":"d"*64})
        with self.assertRaises(ValueError):a.verify(proof,pub,pins,now=proof["statement"]["observed_at"]+1801)
        with self.assertRaises(ValueError):a.verify(proof,Ed25519PrivateKey.generate().public_key().public_bytes(Encoding.Raw,PublicFormat.Raw),pins)
        tampered=copy.deepcopy(proof);tampered["statement"]["observation"]["bytes"]+=1
        with self.assertRaises(ValueError):a.verify(tampered,pub,pins)
        tampered=copy.deepcopy(proof);tampered["statement"]["scope"]=prod.SCOPE
        with self.assertRaises(ValueError):a.verify(tampered,pub,pins)
        with self.assertRaises(ValueError):a.sign_observed(f.C,pins,key,Fake(f.C["folder_id"],raw,True))
        self.assertNotEqual(a.SCOPE,prod.SCOPE)
if __name__=="__main__":unittest.main()
