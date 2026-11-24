"""Bounded streaming AEAD for synthetic rehearsals only; no live export/transport.

Per-object HKDF-derived key, 1 MiB records, authenticated header and indices,
mandatory authenticated final digest, exact external ciphertext/plaintext pins.
Restore only to a fresh private file after full verification; no overwrite.
No CLI, database connection or production proof. Callers must not pass live data.
"""
import contextlib
import hashlib
import os
import stat
import struct
import uuid
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag
import integrated_vault as v
import integrated_drive_setup as setup

SCOPE="synthetic_stream_fixture_v1"
MAGIC=b"BEAGUSTREAM1\0"
CHUNK=1024*1024
MAX=8*1024**3
DOMAIN=b"beagu-synthetic-stream-v1\0"
HEADER_KEYS={"schema","scope","checkpoint_id","key_id","plan_sha256","base_sha","candidate_sha","size","chunk_size","salt"}
PIN_KEYS=HEADER_KEYS|{"object_sha256","plain_sha256"}
require=v.require

def root_check(root):
    return setup.private_parent(os.path.join(root,"placeholder")).parent

@contextlib.contextmanager
def fresh_output(root,name):
    directory=v.open_directory(root_check(root))
    temp=".stream-pending-"+uuid.uuid4().hex
    try:
        fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=directory)
        with os.fdopen(fd,"wb") as f:
            yield f
            f.flush();os.fsync(f.fileno())
        os.link(temp,name,src_dir_fd=directory,dst_dir_fd=directory,follow_symlinks=False)
        os.unlink(temp,dir_fd=directory);os.fsync(directory)
    finally:
        try:os.unlink(temp,dir_fd=directory)
        except FileNotFoundError:pass
        os.close(directory)

@contextlib.contextmanager
def input_object(root,name):
    d=v.open_directory(root_check(root))
    try:
        fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=d)
        with os.fdopen(fd,"rb") as f:
            s=os.fstat(f.fileno())
            require(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and stat.S_IMODE(s.st_mode)==0o600 and s.st_nlink==1 and 0<s.st_size<=MAX+1024*1024,"stream_unsafe_object")
            yield f
            z=os.fstat(f.fileno())
            require((s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns),"stream_object_changed")
            current=os.stat(name,dir_fd=d,follow_symlinks=False)
            require((z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns)==(current.st_dev,current.st_ino,current.st_size,current.st_mtime_ns,current.st_ctime_ns),"stream_object_replaced")
    finally:os.close(d)

def exact(stream,n):
    data=bytearray()
    while len(data)<n:
        part=stream.read(n-len(data))
        require(isinstance(part,bytes) and 0<len(part)<=n-len(data),"stream_truncated")
        data.extend(part)
    return bytes(data)

def header_check(h,key,key_id,plan,base,candidate):
    v.validate_key(key,key_id);v.check_pins(plan,base,candidate)
    require(isinstance(h,dict) and set(h)==HEADER_KEYS and type(h["schema"]) is int and h["schema"]==1 and h["scope"]==SCOPE,"stream_scope_invalid")
    require(v.match(v.HEX32,h["checkpoint_id"]) and v.match(v.HASH,h["salt"]) and h["key_id"]==key_id and (h["plan_sha256"],h["base_sha"],h["candidate_sha"])==(plan,base,candidate),"stream_pin_mismatch")
    require(type(h["size"]) is int and 0<h["size"]<=MAX and type(h["chunk_size"]) is int and h["chunk_size"]==CHUNK,"stream_size_invalid")

def cipher(key,h):
    return AESGCM(HKDF(algorithm=hashes.SHA256(),length=32,salt=bytes.fromhex(h["salt"]),info=DOMAIN+v.canonical(h)).derive(key))

def framing(h):
    raw=v.canonical(h)
    require(len(raw)<=4096,"stream_header_size")
    return MAGIC+struct.pack(">I",len(raw))+raw

def context(header,index,kind):
    return header+kind+struct.pack(">Q",index)

def nonce(index):
    return index.to_bytes(12,"big")

def seal(root,source,size,key,key_id,plan,base,candidate):
    h={"schema":1,"scope":SCOPE,"checkpoint_id":uuid.uuid4().hex,"key_id":key_id,"plan_sha256":plan,"base_sha":base,"candidate_sha":candidate,"size":size,"chunk_size":CHUNK,"salt":os.urandom(32).hex()}
    header_check(h,key,key_id,plan,base,candidate)
    header=framing(h);aead=cipher(key,h);plain=hashlib.sha256();obj=hashlib.sha256()
    name=h["checkpoint_id"]+".stream"
    with fresh_output(root,name) as out:
        def emit(raw):
            out.write(raw);obj.update(raw)
        emit(header)
        remaining=size;i=0
        while remaining:
            raw=exact(source,min(CHUNK,remaining));plain.update(raw)
            emit(aead.encrypt(nonce(i),raw,context(header,i,b"D")))
            remaining-=len(raw);i+=1
        require(source.read(1)==b"","stream_source_excess")
        emit(aead.encrypt(nonce(i),plain.digest(),context(header,i,b"F")))
    return {**h,"object_sha256":obj.hexdigest(),"plain_sha256":plain.hexdigest()}

def restore(source_root,destination_root,key,key_id,pin,plan,base,candidate):
    require(isinstance(pin,dict) and set(pin)==PIN_KEYS and v.match(v.HASH,pin["object_sha256"]) and v.match(v.HASH,pin["plain_sha256"]),"stream_independent_pin_required")
    h={k:pin[k] for k in HEADER_KEYS}
    header_check(h,key,key_id,plan,base,candidate)
    header=framing(h);aead=cipher(key,h);plain=hashlib.sha256();obj=hashlib.sha256()
    name=h["checkpoint_id"]
    # Outer context publishes only after inner source stability and all integrity checks.
    with fresh_output(destination_root,name+".restored") as out:
        with input_object(source_root,name+".stream") as inp:
            def take(n):
                raw=exact(inp,n);obj.update(raw);return raw
            require(take(len(header))==header,"stream_header_mismatch")
            remaining=h["size"];i=0
            try:
                while remaining:
                    n=min(CHUNK,remaining)
                    raw=aead.decrypt(nonce(i),take(n+16),context(header,i,b"D"))
                    out.write(raw);plain.update(raw)
                    remaining-=n;i+=1
                final=aead.decrypt(nonce(i),take(32+16),context(header,i,b"F"))
            except InvalidTag:
                raise ValueError("stream_authentication_failed") from None
            require(inp.read(1)==b"","stream_trailing_data")
            require(final==plain.digest() and plain.hexdigest()==pin["plain_sha256"] and obj.hexdigest()==pin["object_sha256"],"stream_digest_mismatch")
    return {"scope":SCOPE,"bytes":h["size"],"object_sha256":pin["object_sha256"],"plain_sha256":pin["plain_sha256"],"restore_verified":True,"production_backup_proof":False,"execution_enabled":False}
