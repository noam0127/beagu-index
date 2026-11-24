import base64
import concurrent.futures
import copy
import importlib.util
import pathlib
import sys
import tempfile
import unittest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_backup_evidence_candidate as c
import integrated_vault as v
spec=importlib.util.spec_from_file_location("policy_test",ROOT/"tests/integrated-release-backup-policy-candidate.py")
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)

def public(key):return key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
def signed(key,domain,q):return {"statement":q,"signature":base64.b64encode(key.sign(domain+v.canonical(q))).decode()}
class Evidence(unittest.TestCase):
    def setUp(self):
        self.policy=p.fixture();self.now=100000
        self.a,self.o=Ed25519PrivateKey.generate(),Ed25519PrivateKey.generate()
        self.ak,self.ok=public(self.a),public(self.o)
        self.pins={"job_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","base_sha":"b"*40,"candidate_sha":"c"*40,"plan_sha256":"d"*64,"checkpoint_sha256":"e"*64,"challenge":"f"*64,"policy_sha256":p.p.digest(self.policy),"observer_key_sha256":c.key_digest(self.ok),"issued_at":self.now-60,"expires_at":self.now-60+c.TTL}
    def proofs(self,pins=None,change=None):
        pins=self.pins if pins is None else pins
        a=signed(self.a,c.APPROVAL_DOMAIN,{"schema":2,"scope":c.SCOPE,"pins":pins,"approved_at":self.now-50})
        q={"schema":2,"scope":c.SCOPE,"pins":pins,"approval_sha256":v.digest(v.canonical(a)),"captured_at":self.now-40,"restore_started_at":self.now-30,"restore_finished_at":self.now-20,"observed_at":self.now-10,"source_fingerprint_sha256":"1"*64,"restored_fingerprint_sha256":"1"*64,"checks":{k:True for k in c.CHECKS}}
        if change:change(q)
        return a,signed(self.o,c.OBSERVATION_DOMAIN,q)
    def args(self,pins=None,change=None):
        pins=self.pins if pins is None else pins
        a,o=self.proofs(pins,change)
        return (self.policy,a,o,pins,self.ak,self.ok,c.key_digest(self.ak),self.now)
    def test_valid_and_scope(self):
        r=c.verify(*self.args());self.assertTrue(r["signature_verified"])
        for k in ("independent_observer_verified","production_backup_proof","execution_enabled"):self.assertFalse(r[k])
    def test_reject_signed_invalid_observations(self):
        for change in (lambda q:q.update(restored_fingerprint_sha256="2"*64),lambda q:q.update(observed_at=self.now+1),lambda q:q.update(captured_at=self.now-4000),lambda q:q["checks"].update(durable=False),lambda q:q.update(scope="production_integrated_v1"),lambda q:q.update(approval_sha256="0"*64)):
            with self.assertRaises(ValueError):c.verify(*self.args(change=change))
    def test_tamper_wrong_pin_expiry_and_keys(self):
        args=list(self.args());args[2]=copy.deepcopy(args[2]);args[2]["statement"]["captured_at"]-=1
        with self.assertRaises(ValueError):c.verify(*args)
        args=list(self.args());args[3]={**self.pins,"challenge":"0"*64}
        with self.assertRaises(ValueError):c.verify(*args)
        args=list(self.args());args[-1]=self.pins["expires_at"]+1
        with self.assertRaises(ValueError):c.verify(*args)
        args=list(self.args());args[-2]="0"*64
        with self.assertRaises(ValueError):c.verify(*args)
    def test_checkpoint_replay_concurrent_and_other_job(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp).resolve()
            def attempt(_):
                try:return c.consume(root,*self.args())
                except ValueError as e:return str(e)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(attempt,range(2)))
            self.assertEqual(sum(isinstance(x,dict) for x in results),1)
            self.assertIn("backup_candidate_checkpoint_already_consumed",results)
            other={**self.pins,"job_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","challenge":"0"*64}
            with self.assertRaisesRegex(ValueError,"already_consumed"):c.consume(root,*self.args(other))
            receipt=v.parse(v.read_private(root,self.pins["checkpoint_sha256"]+".backup-candidate-consumed.json"))
            self.assertFalse(receipt["rollback_protection_verified"] or receipt["execution_enabled"])
if __name__=="__main__":unittest.main()
