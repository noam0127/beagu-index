"""Synthetic-only attestation protocol; NEVER a production backup proof.

A separately provisioned observer signs an actual read-only ciphertext observation.
Verification uses an independently pinned public key and expected challenge.
No key generation in CI except ephemeral test keys, no production adapter.
Cryptographic separation does not establish distinct Google account ownership.
"""
import base64
import re
import time
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey,Ed25519PublicKey
import integrated_drive_fixture_observer as observer
import integrated_vault as vault
import integrated_drive_checkpoint as drive

SCOPE="synthetic_ciphertext_attestation_v1"
DOMAIN=b"BEAGU-FIXTURE-ATTESTATION-V1\0"
PIN_KEYS={"challenge","candidate_sha","plan_sha256","fixture_object_sha256","file_id","folder_id"}
OBS_KEYS={"scope","fixture_object_sha256","bytes","private_metadata_verified","remote_ciphertext_verified","independent_observer_verified","restore_verified","production_backup_proof","execution_enabled"}
def require(ok,code):vault.require(ok,code)
def validate_pins(pins):
    require(isinstance(pins,dict) and set(pins)==PIN_KEYS,"fixture_attestation_pins_invalid")
    require(all(isinstance(pins[k],str) and vault.HASH.fullmatch(pins[k]) for k in ("challenge","plan_sha256","fixture_object_sha256")) and isinstance(pins["candidate_sha"],str) and vault.SHA.fullmatch(pins["candidate_sha"]),"fixture_attestation_pins_invalid")
    require(drive.valid_id(pins["folder_id"]) and drive.valid_id(pins["file_id"]) and pins["folder_id"]!=pins["file_id"],"fixture_attestation_pins_invalid")
def validate_observation(o,pins):
    require(isinstance(o,dict) and set(o)==OBS_KEYS and o["scope"]=="synthetic_ciphertext_observation_only" and o["fixture_object_sha256"]==pins["fixture_object_sha256"],"fixture_attestation_observation_invalid")
    require(type(o["bytes"]) is int and 0<o["bytes"]<=observer.STREAM_MAX and o["private_metadata_verified"] is True and o["remote_ciphertext_verified"] is True,"fixture_attestation_observation_invalid")
    require(all(o[k] is False for k in ("independent_observer_verified","restore_verified","production_backup_proof","execution_enabled")),"fixture_attestation_scope_violation")
def sign_observed(config,pins,signing_key,transport=None):
    validate_pins(pins)
    require(isinstance(signing_key,Ed25519PrivateKey) and config["folder_id"]==pins["folder_id"],"fixture_attestation_signer_invalid")
    result=observer.observe(config,pins["file_id"],pins["fixture_object_sha256"],transport)
    validate_observation(result,pins)
    statement={"schema":1,"scope":SCOPE,"pins":dict(pins),"observed_at":int(time.time()),"observation":result}
    signature=signing_key.sign(DOMAIN+vault.canonical(statement))
    return {"statement":statement,"signature":base64.b64encode(signature).decode("ascii")}
def verify(proof,public_key,pins,now=None):
    validate_pins(pins)
    require(isinstance(public_key,bytes) and len(public_key)==32 and isinstance(proof,dict) and set(proof)=={"statement","signature"},"fixture_attestation_invalid")
    q=proof["statement"]
    require(isinstance(q,dict) and set(q)=={"schema","scope","pins","observed_at","observation"} and type(q["schema"]) is int and q["schema"]==1 and q["scope"]==SCOPE and q["pins"]==pins,"fixture_attestation_pin_mismatch")
    now=int(time.time()) if now is None else now
    require(type(now) is int and type(q["observed_at"]) is int and now-1800<=q["observed_at"]<=now+60,"fixture_attestation_stale")
    validate_observation(q["observation"],pins)
    try:
        require(isinstance(proof["signature"],str) and len(proof["signature"])==88,"fixture_attestation_signature_invalid")
        Ed25519PublicKey.from_public_bytes(public_key).verify(base64.b64decode(proof["signature"],validate=True),DOMAIN+vault.canonical(q))
    except (InvalidSignature,ValueError,TypeError):
        raise ValueError("fixture_attestation_signature_invalid") from None
    return {"scope":SCOPE,"fixture_object_sha256":pins["fixture_object_sha256"],"signature_verified":True,"attestation_sha256":vault.digest(vault.canonical(proof)),"independent_observer_verified":False,"production_backup_proof":False,"execution_enabled":False}
