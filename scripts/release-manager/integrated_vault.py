"""Private AES-256-GCM checkpoint store, not wired to production or Pages.
Caller supplies a trusted private directory and 32-byte key independently of the checkpoint.
Never reads keys from a candidate, URL, manifest, command line or repository.
"""
import hashlib
import json
import os
import pathlib
import re
import stat
import struct
import uuid
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

HEX32=re.compile(r"[a-f0-9]{32}")
HASH=re.compile(r"[a-f0-9]{64}")
SHA=re.compile(r"[a-f0-9]{40}")
KEY_ID=re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}")
MAX_DUMP=128*1024*1024
MAX_MANIFEST=4*1024*1024
MAX_HEADER=4096
MAX_FILE=MAX_DUMP+MAX_MANIFEST+MAX_HEADER+64
MAGIC=b"BEAGUVAULT1\0"
SCHEME="AES-256-GCM"
SCOPE="isolated_fixture_only"

def require(ok,code):
    if not ok:raise ValueError(code)

def canonical(obj):
    return json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=False,allow_nan=False).encode("utf-8")

def digest(data):
    return hashlib.sha256(data).hexdigest()

def unique(pairs):
    result={}
    for k,v in pairs:
        require(k not in result,"duplicate_vault_key")
        result[k]=v
    return result

def parse(data):
    return json.loads(data,object_pairs_hook=unique)

def match(rx,value):
    return isinstance(value,str) and rx.fullmatch(value) is not None

def key_from_fd(fd):
    """Read exactly 32 bytes from an already-open private key file or inherited pipe."""
    require(isinstance(fd,int) and fd>=3,"invalid_key_descriptor")
    st=os.fstat(fd)
    require(stat.S_ISFIFO(st.st_mode) or (stat.S_ISREG(st.st_mode) and
        st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o600 and st.st_nlink==1),"unsafe_key_descriptor")
    value=bytearray()
    while len(value)<33:
        chunk=os.read(fd,33-len(value))
        if not chunk:break
        value.extend(chunk)
    require(len(value)==32,"invalid_vault_key_length")
    return bytes(value)

def validate_key(key,key_id):
    require(isinstance(key,bytes) and len(key)==32 and match(KEY_ID,key_id),"invalid_vault_key")

def check_pins(plan,base,candidate):
    require(match(HASH,plan) and match(SHA,base) and match(SHA,candidate) and base!=candidate,"invalid_release_pins")

def check_manifest(manifest,data,plan,base,candidate):
    check_pins(plan,base,candidate)
    require(isinstance(manifest,dict) and set(manifest)=={"schema","scope","checkpoint_id","plan_sha256","base_sha","candidate_sha","dump_sha256","dump_size","fingerprint"},"invalid_vault_manifest")
    require(manifest["schema"]==1 and manifest["scope"]==SCOPE and match(HEX32,manifest["checkpoint_id"]),"invalid_vault_scope")
    require((manifest["plan_sha256"],manifest["base_sha"],manifest["candidate_sha"])==(plan,base,candidate),"vault_release_mismatch")
    require(isinstance(data,bytes) and 0<len(data)<=MAX_DUMP and manifest["dump_size"]==len(data) and manifest["dump_sha256"]==digest(data),"vault_dump_integrity_failure")
    require(isinstance(manifest["fingerprint"],dict),"invalid_vault_fingerprint")

def open_directory(root):
    fd=os.open(os.fspath(root),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        st=os.fstat(fd)
        require(st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700,"unsafe_vault_directory")
        return fd
    except BaseException:
        os.close(fd)
        raise

def write_exclusive(root,name,content):
    directory=open_directory(root)
    temp=".pending-"+uuid.uuid4().hex
    try:
        fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=directory)
        with os.fdopen(fd,"wb") as f:
            f.write(content);f.flush();os.fsync(f.fileno())
        # Atomic no-replace publication; a crash may leave only encrypted temporary bytes.
        os.link(temp,name,src_dir_fd=directory,dst_dir_fd=directory,follow_symlinks=False)
        os.unlink(temp,dir_fd=directory)
        os.fsync(directory)
    finally:
        try:os.unlink(temp,dir_fd=directory)
        except FileNotFoundError:pass
        os.close(directory)

def read_private(root,name):
    directory=open_directory(root)
    try:
        fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
        with os.fdopen(fd,"rb") as f:
            st=os.fstat(f.fileno())
            require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o600 and st.st_nlink==1 and 0<st.st_size<=MAX_FILE,"unsafe_vault_object")
            content=f.read(MAX_FILE+1)
            require(len(content)==st.st_size<=MAX_FILE,"vault_size_mismatch")
            return content
    finally:os.close(directory)

def seal(root,key,key_id,manifest,data,plan,base,candidate):
    validate_key(key,key_id)
    check_manifest(manifest,data,plan,base,candidate)
    raw=canonical(manifest)
    require(len(raw)<=MAX_MANIFEST,"vault_manifest_too_large")
    header={"schema":1,"scheme":SCHEME,"scope":SCOPE,"key_id":key_id,
        "checkpoint_id":manifest["checkpoint_id"],"plan_sha256":plan,
        "base_sha":base,"candidate_sha":candidate}
    hdr=canonical(header)
    require(len(hdr)<=MAX_HEADER,"vault_header_too_large")
    aad=MAGIC+struct.pack(">I",len(hdr))+hdr
    nonce=os.urandom(12)
    payload=struct.pack(">I",len(raw))+raw+data
    content=aad+nonce+AESGCM(key).encrypt(nonce,payload,aad)
    require(len(content)<=MAX_FILE,"vault_object_too_large")
    write_exclusive(root,header["checkpoint_id"]+".vault",content)
    # Store this pin independently in a durable approval record later; never infer latest from disk.
    return {**header,"object_sha256":digest(content),"manifest_sha256":digest(raw)}

def unseal(root,key,key_id,pin,plan,base,candidate):
    validate_key(key,key_id)
    check_pins(plan,base,candidate)
    require(isinstance(pin,dict) and set(pin)=={"schema","scheme","scope","key_id","checkpoint_id","plan_sha256","base_sha","candidate_sha","object_sha256","manifest_sha256"},"missing_independent_vault_pin")
    require(pin["schema"]==1 and pin["scheme"]==SCHEME and pin["scope"]==SCOPE and
        pin["key_id"]==key_id and match(HEX32,pin["checkpoint_id"]) and
        match(HASH,pin["object_sha256"]) and match(HASH,pin["manifest_sha256"]),"invalid_vault_pin")
    require((pin["plan_sha256"],pin["base_sha"],pin["candidate_sha"])==(plan,base,candidate),"vault_release_mismatch")
    content=read_private(root,pin["checkpoint_id"]+".vault")
    require(digest(content)==pin["object_sha256"],"stale_or_tampered_vault")
    require(content.startswith(MAGIC) and len(content)>=len(MAGIC)+4+12+16,"invalid_vault_format")
    offset=len(MAGIC)
    size=struct.unpack(">I",content[offset:offset+4])[0]
    end=offset+4+size
    require(0<size<=MAX_HEADER and end+28<=len(content),"invalid_vault_header")
    header=content[offset+4:end]
    expected={k:v for k,v in pin.items() if k not in ("object_sha256","manifest_sha256")}
    require(header==canonical(expected),"vault_header_mismatch")
    try:
        payload=AESGCM(key).decrypt(content[end:end+12],content[end+12:],content[:end])
    except InvalidTag:
        raise ValueError("vault_authentication_failed") from None
    require(len(payload)>=4,"invalid_vault_payload")
    size=struct.unpack(">I",payload[:4])[0]
    require(0<size<=MAX_MANIFEST and 4+size<len(payload),"invalid_vault_manifest_size")
    raw=payload[4:4+size]
    data=payload[4+size:]
    require(digest(raw)==pin["manifest_sha256"],"vault_manifest_pin_mismatch")
    manifest=parse(raw)
    check_manifest(manifest,data,plan,base,candidate)
    require(manifest["checkpoint_id"]==pin["checkpoint_id"],"vault_checkpoint_mismatch")
    return manifest,data
