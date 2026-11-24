"""Local private synthetic observer handoff CLI; no operational approval.
Use different trust domains for observer private key and verifier registry.
Owner-only Drive cannot prove distinct account independence. This interface
does not provision OAuth, alter permissions, upload, or sign production proofs.
"""
import argparse
import json
import pathlib
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat,PrivateFormat,NoEncryption
import integrated_fixture_challenge as challenge
import integrated_drive_setup as setup
import integrated_vault as vault

def read(path,limit=32768):
    p=setup.private_parent(path)
    raw=vault.read_private(p.parent,p.name)
    vault.require(len(raw)<=limit,"fixture_handoff_size")
    return raw
def write(path,raw):
    p=setup.private_parent(path)
    vault.require(len(raw)<=32768,"fixture_handoff_size")
    vault.write_exclusive(p.parent,p.name,raw)
def public(key):
    return key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
def keygen(private_path,public_path):
    a,b=setup.private_parent(private_path),setup.private_parent(public_path)
    vault.require(a!=b and not a.exists() and not b.exists(),"fixture_key_exists")
    key=Ed25519PrivateKey.generate()
    write(a,key.private_bytes(Encoding.Raw,PrivateFormat.Raw,NoEncryption()))
    # A failure here leaves the private key intact; never overwrite or auto-retry.
    write(b,public(key))
    return {"observer_key_created":True,"observer_key_sha256":vault.digest(public(key)),"execution_enabled":False}
def issue(registry,target_file,public_file,request_file):
    pub=read(public_file,32)
    target=vault.parse(read(target_file))
    request=challenge.issue(registry,target,pub)
    write(request_file,vault.canonical(request))
    return {"challenge":request["pins"]["challenge"],"expires_at":request["expires_at"],"execution_enabled":False}
def sign(oauth_file,request_file,key_file,proof_file,transport=None):
    key=Ed25519PrivateKey.from_private_bytes(read(key_file,32))
    config=setup.read_config(oauth_file)
    request=vault.parse(read(request_file))
    proof=challenge.sign_request(config,request,key,transport)
    write(proof_file,vault.canonical(proof))
    return {"fixture_observation_signed":True,"independent_observer_verified":False,"execution_enabled":False}
def consume(registry,request_id,proof_file,public_file):
    proof=vault.parse(read(proof_file))
    return challenge.consume(registry,request_id,proof,read(public_file,32))
def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest="operation",required=True)
    def cmd(name,fields):
        a=sub.add_parser(name)
        for f in fields:a.add_argument("--"+f,required=True)
        return a
    cmd("keygen",("private-key","public-key"))
    cmd("issue",("registry","target-file","public-key","request-file"))
    cmd("sign",("oauth-file","request-file","private-key","proof-file"))
    cmd("consume",("registry","challenge","proof-file","public-key"))
    a=p.parse_args()
    try:
        if a.operation=="keygen":result=keygen(a.private_key,a.public_key)
        elif a.operation=="issue":result=issue(a.registry,a.target_file,a.public_key,a.request_file)
        elif a.operation=="sign":result=sign(a.oauth_file,a.request_file,a.private_key,a.proof_file)
        else:result=consume(a.registry,a.challenge,a.proof_file,a.public_key)
        print(json.dumps(result,sort_keys=True))
    except (ValueError,OSError,KeyError,TypeError):
        print(json.dumps({"handoff_verified":False,"execution_enabled":False}))
        raise SystemExit(1) from None
if __name__=="__main__":main()
