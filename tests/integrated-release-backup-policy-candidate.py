import copy
import pathlib
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts/release-manager"))
import integrated_backup_policy_candidate as p

def fixture():
    return {"schema":1,"scope":"production_backup_policy_candidate_v1","inventory":{k:p.digest(k) for k in p.CATEGORIES},"schemas":sorted(p.REQUIRED_SCHEMAS),"retention_days":30,"rpo_minutes":60,"rto_minutes":240,"custody":{k:p.digest(k) for k in ("exporter","observer","verifier","recovery_key","storage_control")},"evidence":{k:p.digest(k) for k in ("inventory_review","key_recovery_test","retention_lock","isolated_restore_plan","observer_identity_review","rollback_protected_ledger")}}
class Policy(unittest.TestCase):
    def test_review_never_authorizes(self):
        v=fixture();r=p.review(v,p.digest(v));self.assertTrue(r["policy_structure_verified"])
        for k in ("inventory_verified","independent_observer_verified","production_backup_proof","execution_enabled"):self.assertFalse(r[k])
    def test_pin(self):
        v=fixture()
        with self.assertRaisesRegex(ValueError,"pin_mismatch"):p.review(v,"a"*64)
    def test_invalid_contracts(self):
        for fn in (lambda v:v["inventory"].pop("storage"),lambda v:v["schemas"].remove("auth"),lambda v:v["custody"].update(observer=v["custody"]["exporter"]),lambda v:v.update(rpo_minutes=True),lambda v:v["evidence"].pop("rollback_protected_ledger")):
            v=fixture();fn(v)
            with self.assertRaises(ValueError):p.review(v,p.digest(v))
if __name__=="__main__":unittest.main()
