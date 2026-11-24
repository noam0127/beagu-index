import concurrent.futures
import importlib.util
import pathlib
import sys
import tempfile
import time
import unittest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_fixture_challenge as c
import integrated_vault as v
spec=importlib.util.spec_from_file_location("attestation_test",ROOT/"tests/integrated-release-fixture-attestation.py")
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class Challenge(unittest.TestCase):
    def test_concurrent_single_consumption_and_reopen(self):
        raw=v.MAGIC+b"synthetic"
        target={"candidate_sha":"b"*40,"plan_sha256":"c"*64,"fixture_object_sha256":v.digest(raw),"file_id":a.f.FILE,"folder_id":a.f.C["folder_id"]}
        key=Ed25519PrivateKey.generate()
        pub=key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp).resolve()
            req=c.issue(root,target,pub)
            challenge=req["pins"]["challenge"]
            proof=c.sign_request(a.f.C,req,key,a.Fake(a.f.C["folder_id"],raw))
            bad=Ed25519PrivateKey.generate().public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
            with self.assertRaises(ValueError):c.consume(root,challenge,proof,bad)
            with self.assertRaises(ValueError):c.consume(root,challenge,proof,pub,now=req["expires_at"]+1)
            def attempt(_):
                try:return c.consume(root,challenge,proof,pub)
                except ValueError as e:return str(e)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results=list(pool.map(attempt,range(2)))
            success=[r for r in results if isinstance(r,dict)]
            self.assertEqual(len(success),1)
            self.assertIn("fixture_challenge_already_consumed",results)
            self.assertTrue(success[0]["single_consumption_recorded"])
            for k in ("production_backup_proof","execution_enabled","independent_observer_verified"):self.assertFalse(success[0][k])
            with self.assertRaisesRegex(ValueError,"fixture_challenge_already_consumed"):c.consume(root,challenge,proof,pub)
            self.assertEqual(len(list(root.iterdir())),2)
if __name__=="__main__":unittest.main()
