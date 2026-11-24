"""Real networkless PG17 restore of simulated remote bytes, no live Drive access."""
import importlib.util
import pathlib
import sys
import tempfile
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_drive_pg_rehearsal as pg
spec=importlib.util.spec_from_file_location("drive_fixture_test",ROOT/"tests/integrated-release-drive-rehearsal.py")
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class PostgresDrive(unittest.TestCase):
    def test_pg17_remote_fixture_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            parent=pathlib.Path(directory).resolve()
            proof=pg.rehearsal(parent,f.C,f.Fake,f.Refresh())
            self.assertEqual(proof["scope"],"synthetic_postgresql17_only")
            self.assertEqual(proof["fixture_rows"],6)
            for k in ("encrypted_upload_verified","download_verified","fixture_restore_verified","schema_rows_sequences_verified","rls_verified"):self.assertTrue(proof[k])
            for k in ("production_backup_executed","production_backup_proof","independent_observer_verified","execution_enabled"):self.assertFalse(proof[k])
            self.assertEqual(list(parent.iterdir()),[])
            with self.assertRaisesRegex(ValueError,"drive_upload_readback_mismatch"):
                pg.rehearsal(parent,f.C,lambda folder,raw:f.Fake(folder,raw,True),f.Refresh())
if __name__=="__main__":unittest.main()
