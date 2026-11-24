"""Actual 192 MiB synthetic streaming roundtrip plus negative checks."""
import hashlib
import io
import os
import pathlib
import sys
import tempfile
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_stream_fixture as s
PINS=("a"*64,"b"*40,"c"*40)
class Synthetic:
    def __init__(self,size):
        self.left=size;self.counter=0;self.hash=hashlib.sha256()
    def read(self,n):
        assert 0<n<=s.CHUNK
        n=min(n,self.left)
        raw=hashlib.shake_256(self.counter.to_bytes(8,"big")).digest(n)
        self.left-=n;self.counter+=1;self.hash.update(raw)
        return raw
class Stream(unittest.TestCase):
    def test_large_actual_roundtrip(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp).resolve()
            a=root/"send";a.mkdir(mode=0o700)
            b=root/"receive";b.mkdir(mode=0o700)
            size=192*1024**2+17
            source=Synthetic(size);key=os.urandom(32)
            pin=s.seal(a,source,size,key,"fixture-stream",*PINS)
            self.assertEqual(pin["plain_sha256"],source.hash.hexdigest())
            proof=s.restore(a,b,key,"fixture-stream",pin,*PINS)
            self.assertEqual(proof["bytes"],size)
            self.assertTrue(proof["restore_verified"])
            self.assertFalse(proof["production_backup_proof"] or proof["execution_enabled"])
            dest=b/(pin["checkpoint_id"]+".restored")
            self.assertEqual(dest.stat().st_size,size)
            h=hashlib.sha256()
            with dest.open("rb") as f:
                while True:
                    chunk=f.read(s.CHUNK)
                    if not chunk:break
                    h.update(chunk)
            self.assertEqual(h.hexdigest(),source.hash.hexdigest())
            self.assertEqual(dest.stat().st_mode&0o777,0o600)
            with self.assertRaises(FileExistsError):s.restore(a,b,key,"fixture-stream",pin,*PINS)
    def test_tamper_truncation_order_wrong_key_and_pins(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp).resolve()
            a=root/"send";a.mkdir(mode=0o700)
            b=root/"receive";b.mkdir(mode=0o700)
            size=2*s.CHUNK+17;key=os.urandom(32)
            pin=s.seal(a,Synthetic(size),size,key,"fixture-stream",*PINS)
            path=a/(pin["checkpoint_id"]+".stream")
            raw=path.read_bytes()
            start=len(s.framing({k:pin[k] for k in s.HEADER_KEYS}))
            width=s.CHUNK+16
            cases=[raw[:-1],raw+b"x",raw[:start]+raw[start+width:start+2*width]+raw[start:start+width]+raw[start+2*width:],raw[:start]+bytes([raw[start]^1])+raw[start+1:]]
            for broken in cases:
                path.write_bytes(broken)
                with self.assertRaises(ValueError):s.restore(a,b,key,"fixture-stream",pin,*PINS)
                self.assertEqual(list(b.iterdir()),[])
            path.write_bytes(raw)
            for k,p in ((os.urandom(32),pin),(key,{**pin,"object_sha256":"d"*64}),(key,{**pin,"plain_sha256":"d"*64}),(key,{**pin,"scope":"production_integrated_v1"})):
                with self.assertRaises(ValueError):s.restore(a,b,k,"fixture-stream",p,*PINS)
                self.assertEqual(list(b.iterdir()),[])
            with self.assertRaises(ValueError):s.restore(a,b,key,"fixture-stream",pin,PINS[0],PINS[1],"e"*40)
            with self.assertRaises(ValueError):s.seal(a,io.BytesIO(b"short"),100,key,"fixture-stream",*PINS)
            with self.assertRaises(ValueError):s.seal(a,io.BytesIO(b"long"),1,key,"fixture-stream",*PINS)
            self.assertEqual(list(a.iterdir()),[path])
if __name__=="__main__":unittest.main()
