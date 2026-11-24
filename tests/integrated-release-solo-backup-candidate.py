import os
import pathlib
import sys
import tempfile
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_solo_backup_candidate as c
import integrated_vault as v

PINS=("a"*64,"b"*40,"c"*40)
JOB="d"*32
class SoloBackup(unittest.TestCase):
    def test_end_to_end_restart_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp).resolve()
            store,ledger,keys=(root/n for n in ("store","ledger","keys"))
            for d in (store,ledger,keys):d.mkdir(mode=0o700)
            key=keys/"recovery.key"
            v.write_exclusive(keys,key.name,os.urandom(32))
            r=c.run_fixture(store,ledger,key,JOB,*PINS)
            for k in ("automatic_restore_verified","remote_simulation_readback_verified","separate_pg17_target_verified","source_unchanged"):self.assertTrue(r[k])
            for k in ("independent_observer_verified","actual_drive_transfer_verified","production_backup_proof","execution_enabled"):self.assertFalse(r[k])
            self.assertEqual(len(list(store.iterdir())),1)
            self.assertEqual(len(list(ledger.iterdir())),3)
            with self.assertRaisesRegex(ValueError,"already_attempted"):c.run_fixture(store,ledger,key,JOB,*PINS)
            with self.assertRaisesRegex(ValueError,"manifest_mismatch"):c.recover_fixture(store,ledger,key,JOB,"0"*64,*PINS)
            # Reopen from the retained encrypted object, manifest and key, without source or upload.
            again=c.recover_fixture(store,ledger,key,JOB,r["manifest_sha256"],*PINS)
            self.assertTrue(again["automatic_restore_verified"])
            wrong=keys/"wrong.key";v.write_exclusive(keys,wrong.name,os.urandom(32))
            with self.assertRaisesRegex(ValueError,"stream_authentication_failed"):c.recover_fixture(store,ledger,wrong,JOB,r["manifest_sha256"],*PINS)
            obj=next(store.iterdir())
            with obj.open("r+b") as f:
                f.seek(-1,2);last=f.read(1);f.seek(-1,2);f.write(bytes([last[0]^1]))
            with self.assertRaisesRegex(ValueError,"ciphertext_mismatch"):c.recover_fixture(store,ledger,key,JOB,r["manifest_sha256"],*PINS)
    def test_overlap_and_no_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp).resolve();a=root/"a";b=root/"b";k=root/"k"
            for p in (a,b,k):p.mkdir(mode=0o700)
            with self.assertRaisesRegex(ValueError,"paths_overlap"):c.run_fixture(a,a,k/"key",JOB,*PINS)
            with self.assertRaises(FileNotFoundError):c.run_fixture(a,b,k/"missing",JOB,*PINS)
            self.assertEqual(list(b.iterdir()),[])
if __name__=="__main__":unittest.main()
