"""No network. Verify encrypted storage and independent-key/pin rejection."""
import copy
import os
import pathlib
import sys
import tempfile
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_vault as v

PINS=("a"*64,"b"*40,"c"*40)
DATA=b"private-fixture-row\n"*100

class Vault(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=pathlib.Path(self.tmp.name)
        self.key=os.urandom(32)
        self.manifest={"schema":1,"scope":v.SCOPE,"checkpoint_id":"d"*32,"plan_sha256":PINS[0],
                       "base_sha":PINS[1],"candidate_sha":PINS[2],"dump_sha256":v.digest(DATA),
                       "dump_size":len(DATA),"fingerprint":{"private":"sensitive-fixture-fingerprint"}}
        self.pin=v.seal(self.root,self.key,"fixture-key",self.manifest,DATA,*PINS)
        self.file=self.root/("d"*32+".vault")
    def read(self,pin=None,key=None,key_id="fixture-key",pins=PINS):
        return v.unseal(self.root,key if key is not None else self.key,key_id,pin if pin is not None else self.pin,*pins)
    def test_encryption_and_exclusive_storage(self):
        content=self.file.read_bytes()
        self.assertNotIn(DATA,content)
        self.assertNotIn(b"sensitive-fixture-fingerprint",content)
        self.assertEqual(self.read(),(self.manifest,DATA))
        self.assertEqual(self.file.stat().st_mode&0o777,0o600)
        with self.assertRaises(FileExistsError):
            v.seal(self.root,self.key,"fixture-key",self.manifest,DATA,*PINS)
        self.assertEqual(self.file.read_bytes(),content)
        self.assertEqual(len(list(self.root.iterdir())),1)
    def test_wrong_key_and_tampering(self):
        with self.assertRaisesRegex(ValueError,"vault_authentication_failed"):
            self.read(key=os.urandom(32))
        with self.assertRaisesRegex(ValueError,"invalid_vault_pin"):
            self.read(key_id="wrong-key-id")
        content=self.file.read_bytes()
        corrupted=content[:-1]+bytes([content[-1]^1])
        self.file.write_bytes(corrupted)
        with self.assertRaisesRegex(ValueError,"stale_or_tampered_vault"):self.read()
        changed={**self.pin,"object_sha256":v.digest(corrupted)}
        with self.assertRaisesRegex(ValueError,"vault_authentication_failed"):self.read(changed)
        self.file.write_bytes(content)
        with self.assertRaisesRegex(ValueError,"vault_release_mismatch"):self.read(pins=(PINS[0],PINS[1],"e"*40))
        with self.assertRaisesRegex(ValueError,"vault_manifest_pin_mismatch"):self.read({**self.pin,"manifest_sha256":"0"*64})
        with self.assertRaisesRegex(ValueError,"missing_independent_vault_pin"):self.read({})
    def test_new_checkpoint_separate_pin_and_key_rotation(self):
        newer={**self.manifest,"checkpoint_id":"e"*32}
        key2=os.urandom(32)
        latest=v.seal(self.root,key2,"fixture-key-2",newer,DATA,*PINS)
        self.assertNotEqual(self.pin["object_sha256"],latest["object_sha256"])
        self.assertEqual(v.unseal(self.root,key2,"fixture-key-2",latest,*PINS),(newer,DATA))
        with self.assertRaises(ValueError):v.unseal(self.root,key2,"fixture-key-2",self.pin,*PINS)
        # Old object cannot satisfy the independently retained newest pin.
        self.file.rename(self.root/"historical.vault")
        (self.root/("e"*32+".vault")).write_bytes((self.root/"historical.vault").read_bytes())
        with self.assertRaisesRegex(ValueError,"stale_or_tampered_vault"):
            v.unseal(self.root,key2,"fixture-key-2",latest,*PINS)
    def test_permissions_symlink_and_key_fd(self):
        self.file.chmod(0o644)
        with self.assertRaisesRegex(ValueError,"unsafe_vault_object"):self.read()
        self.file.chmod(0o600)
        self.root.chmod(0o755)
        with self.assertRaisesRegex(ValueError,"unsafe_vault_directory"):self.read()
        self.root.chmod(0o700)
        content=self.file.read_bytes()
        self.file.unlink()
        self.file.symlink_to("/dev/null")
        with self.assertRaises(OSError):self.read()
        self.file.unlink()
        fd=os.open(self.file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"wb") as f:f.write(content)
        keyfile=self.root/"fixture-key.raw"
        fd=os.open(keyfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"wb") as f:f.write(self.key)
        fd=os.open(keyfile,os.O_RDONLY|os.O_NOFOLLOW)
        try:self.assertEqual(v.key_from_fd(fd),self.key)
        finally:os.close(fd)
        keyfile.chmod(0o644)
        fd=os.open(keyfile,os.O_RDONLY)
        try:
            with self.assertRaisesRegex(ValueError,"unsafe_key_descriptor"):v.key_from_fd(fd)
        finally:os.close(fd)
if __name__=="__main__":unittest.main()
