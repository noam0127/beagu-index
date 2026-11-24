"""Private, synthetic-only challenge registry and observer handoff.

Registry and observer keys must be independently provisioned outside Git.
Atomic no-replace records provide single consumption within this intact registry.
A restored/deleted registry, same account, or same administrator is not an
independent security identity. No production proof or execution path.
"""
import os
import pathlib
import time
import secrets
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
import integrated_fixture_attestation as att
import integrated_drive_setup as setup
import integrated_vault as vault

SCOPE="synthetic_fixture_challenge_v1"
TTL=1800
MAX_RECORD=32768
def require(ok,code):vault.require(ok,code)
def trusted_directory(root):
    return setup.private_parent(pathlib.Path(root)/"placeholder").parent
def pub_digest(public):
    require(isinstance(public,bytes) and len(public)==32,"fixture_observer_key_invalid")
    return vault.digest(public)
def record_name(challenge,suffix):
    require(isinstance(challenge,str) and vault.HASH.fullmatch(challenge),"fixture_challenge_invalid")
    return challenge+suffix
def read_record(root,name):
    raw=vault.read_private(root,name)
    require(len(raw)<=MAX_RECORD,"fixture_record_too_large")
    return vault.parse(raw)
def validate_request(request,public,now):
    require(isinstance(request,dict) and set(request)=={"schema","scope","pins","observer_key_sha256","issued_at","expires_at"} and type(request["schema"]) is int and request["schema"]==1 and request["scope"]==SCOPE,"fixture_request_invalid")
    att.validate_pins(request["pins"])
    require(request["observer_key_sha256"]==pub_digest(public),"fixture_observer_key_mismatch")
    issued,expires=request["issued_at"],request["expires_at"]
    require(type(now) is int and type(issued) is int and type(expires) is int and expires==issued+TTL and issued<=now<=expires,"fixture_request_expired")
def issue(root,target,public_key,now=None):
    root=trusted_directory(root)
    require(isinstance(target,dict) and set(target)==att.PIN_KEYS-{"challenge"},"fixture_target_invalid")
    now=int(time.time()) if now is None else now
    require(type(now) is int and now>=0,"fixture_request_invalid")
    pins={**target,"challenge":secrets.token_hex(32)}
    att.validate_pins(pins)
    request={"schema":1,"scope":SCOPE,"pins":pins,"observer_key_sha256":pub_digest(public_key),"issued_at":now,"expires_at":now+TTL}
    vault.write_exclusive(root,record_name(pins["challenge"],".request.json"),vault.canonical(request))
    return request
def sign_request(config,request,signing_key,transport=None,now=None):
    require(isinstance(signing_key,Ed25519PrivateKey),"fixture_observer_key_invalid")
    public=signing_key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
    now=int(time.time()) if now is None else now
    validate_request(request,public,now)
    return att.sign_observed(config,request["pins"],signing_key,transport)
def consume(root,challenge,proof,trusted_public_key,now=None):
    root=trusted_directory(root)
    now=int(time.time()) if now is None else now
    request=read_record(root,record_name(challenge,".request.json"))
    validate_request(request,trusted_public_key,now)
    require(request["pins"]["challenge"]==challenge,"fixture_request_pin_mismatch")
    result=att.verify(proof,trusted_public_key,request["pins"],now)
    require(request["issued_at"]<=proof["statement"]["observed_at"]<=min(now+60,request["expires_at"]),"fixture_observation_outside_request")
    receipt={**result,"request_sha256":vault.digest(vault.canonical(request)),"challenge":challenge,"consumed_at":now,"single_consumption_recorded":True}
    # Commit is atomic and durable, even with two simultaneous valid consumers.
    # On error after publication, do not retry or treat the proof as unconsumed.
    try:vault.write_exclusive(root,record_name(challenge,".consumed.json"),vault.canonical(receipt))
    except FileExistsError:raise ValueError("fixture_challenge_already_consumed") from None
    return receipt
