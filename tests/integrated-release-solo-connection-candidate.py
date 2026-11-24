import pathlib
import sys
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_solo_connection_candidate as c
import integrated_backup as pg
import json

def config():
    return {"schema":1,"scope":c.SCOPE,"postgres_major":17,"inventory_sha256":"a"*64,"coverage":{k:{"method":"logical_dump","evidence_sha256":"b"*64} for k in c.KINDS},"retention_days":30,"rpo_minutes":60,"rto_minutes":240,"max_dump_bytes":1024**3,"key_id":"fixture-key","execution_environment":"private_trusted_worker","storage":"private_google_drive","recovery_copy":"provider_recovery"}
class Connection(unittest.TestCase):
    def test_plan_never_connects(self):
        d=config();r=c.review(d,c.p.digest(d));self.assertTrue(r["connection_plan_verified"])
        for k in ("actual_connection_verified","production_backup_proof","execution_enabled"):self.assertFalse(r[k])
        for change in (lambda d:d["coverage"].pop("storage"),lambda d:d["coverage"]["schemas"].update(method="not_applicable"),lambda d:d.update(storage="public_github"),lambda d:d.update(execution_environment="public_ci"),lambda d:d.update(rpo_minutes=True)):
            d=config();change(d)
            with self.assertRaises(ValueError):c.review(d,c.p.digest(d))
    def test_inventory_on_isolated_pg17(self):
        sql=(ROOT/"scripts/release-manager/solo-backup-inventory-readonly.sql").read_text()
        with pg.FixtureCluster(17) as cluster:
            cluster.sql("fixture_source","CREATE TABLE public.solo_inventory_fixture(id bigint GENERATED ALWAYS AS IDENTITY, secret text); INSERT INTO public.solo_inventory_fixture(secret) VALUES ('never-return-this-value');")
            raw=cluster.sql("fixture_source",sql)
            self.assertNotIn(b"never-return-this-value",raw)
            result=json.loads(raw)
            self.assertEqual(result["postgres_major"],17)
            self.assertFalse(result["execution_enabled"] or result["restore_verified"])
            self.assertEqual(cluster.sql("fixture_source","SELECT count(*) FROM public.solo_inventory_fixture;").strip(),b"1")
if __name__=="__main__":unittest.main()
