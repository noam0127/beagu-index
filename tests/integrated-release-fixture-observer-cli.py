import importlib.util
import pathlib
import sys
import tempfile
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_fixture_observer_cli as cli
import integrated_vault as v
spec=importlib.util.spec_from_file_location("attestation_test",ROOT/"tests/integrated-release-fixture-attestation.py")
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class Handoff(unittest.TestCase):
    def test_separate_directories_and_replay(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp).resolve()
            obs=root/"observer";obs.mkdir(mode=0o700)
            verifier=root/"verifier";verifier.mkdir(mode=0o700)
            registry=verifier/"registry";registry.mkdir(mode=0o700)
            key=obs/"sign.key";pub=obs/"sign.pub"
            self.assertTrue(cli.keygen(key,pub)["observer_key_created"])
            with self.assertRaises(ValueError):cli.keygen(key,pub)
            pinned=verifier/"observer.pub";cli.write(pinned,cli.read(pub,32))
            oauth=obs/"oauth.json";cli.write(oauth,v.canonical(a.f.C))
            raw=v.MAGIC+b"synthetic"
            target=verifier/"target.json";cli.write(target,v.canonical({"candidate_sha":"b"*40,"plan_sha256":"c"*64,"fixture_object_sha256":v.digest(raw),"file_id":a.f.FILE,"folder_id":a.f.C["folder_id"]}))
            req=verifier/"request.json";issued=cli.issue(registry,target,pinned,req)
            incoming=obs/"request.json";cli.write(incoming,cli.read(req))
            proof=obs/"proof.json";result=cli.sign(oauth,incoming,key,proof,a.Fake(a.f.C["folder_id"],raw))
            self.assertTrue(result["fixture_observation_signed"])
            received=verifier/"proof.json";cli.write(received,cli.read(proof))
            result=cli.consume(registry,issued["challenge"],received,pinned)
            self.assertTrue(result["single_consumption_recorded"])
            self.assertFalse(result["execution_enabled"] or result["production_backup_proof"] or result["independent_observer_verified"])
            with self.assertRaisesRegex(ValueError,"fixture_challenge_already_consumed"):cli.consume(registry,issued["challenge"],received,pinned)
            self.assertEqual(key.stat().st_mode&0o777,0o600)
            with self.assertRaises(ValueError):cli.read(key,31)
if __name__=="__main__":unittest.main()
