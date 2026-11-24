"""Offline signed backup evidence candidate, not a production gate.

All request and public-key pins must originate outside candidate code.
An intact private verifier registry rejects reuse of a checkpoint. Its rollback,
deletion or replacement is NOT prevented here. No issuer, network, key custody,
database backup, operational trust enrollment or execution authorization.
"""
import base64
import re
import time
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
import integrated_backup_policy_candidate as policy
import integrated_fixture_challenge as registry
import integrated_vault as vault

SCOPE="backup_evidence_candidate_v2"
APPROVAL_DOMAIN=b"BEAGU-BACKUP-POLICY-CANDIDATE-V2\0"
OBSERVATION_DOMAIN=b"BEAGU-BACKUP-EVIDENCE-CANDIDATE-V2\0"
TTL=1800
JOB=re.compile(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")
PIN_KEYS={"job_id","base_sha","candidate_sha","plan_sha256","checkpoint_sha256","challenge","policy_sha256","observer_key_sha256","issued_at","expires_at"}
CHECKS={"encrypted","durable","restore_isolated","source_unchanged","key_recovery_verified"}
require=vault.require

def key_digest(key):
    require(isinstance(key,bytes) and len(key)==32,"backup_candidate_key_invalid")
    return vault.digest(key)

def signed_statement(proof,key,domain):
    key_digest(key)
    require(isinstance(proof,dict) and set(proof)=={"statement","signature"} and isinstance(proof["statement"],dict) and isinstance(proof["signature"],str) and len(proof["signature"])==88,"backup_candidate_signature_invalid")
    q=proof["statement"]
    try:
        Ed25519PublicKey.from_public_bytes(key).verify(base64.b64decode(proof["signature"],validate=True),domain+vault.canonical(q))
    except (ValueError,TypeError,InvalidSignature):
        raise ValueError("backup_candidate_signature_invalid") from None
    return q

def validate_request(p,now):
    require(isinstance(p,dict) and set(p)==PIN_KEYS and vault.match(JOB,p["job_id"]),"backup_candidate_request_invalid")
    vault.check_pins(p["plan_sha256"],p["base_sha"],p["candidate_sha"])
    require(all(policy.is_hash(p[k]) for k in ("checkpoint_sha256","challenge","policy_sha256","observer_key_sha256")),"backup_candidate_request_invalid")
    issued,expires=p["issued_at"],p["expires_at"]
    require(type(now) is int and type(issued) is int and type(expires) is int and 0<=issued<=now<=expires and expires-issued==TTL,"backup_candidate_request_expired")

def verify(policy_doc,approval,proof,pins,approver_key,observer_key,expected_approver_key_sha256,now=None):
    now=int(time.time()) if now is None else now
    validate_request(pins,now)
    ak,ok=key_digest(approver_key),key_digest(observer_key)
    require(ak==expected_approver_key_sha256 and ok==pins["observer_key_sha256"] and ak!=ok,"backup_candidate_trust_pin_mismatch")
    reviewed=policy.review(policy_doc,pins["policy_sha256"])
    a=signed_statement(approval,approver_key,APPROVAL_DOMAIN)
    require(set(a)=={"schema","scope","pins","approved_at"} and type(a["schema"]) is int and a["schema"]==2 and a["scope"]==SCOPE and a["pins"]==pins and type(a["approved_at"]) is int and pins["issued_at"]<=a["approved_at"]<=now,"backup_candidate_approval_invalid")
    q=signed_statement(proof,observer_key,OBSERVATION_DOMAIN)
    require(set(q)=={"schema","scope","pins","approval_sha256","observed_at","captured_at","restore_started_at","restore_finished_at","source_fingerprint_sha256","restored_fingerprint_sha256","checks"} and type(q["schema"]) is int and q["schema"]==2 and q["scope"]==SCOPE and q["pins"]==pins and q["approval_sha256"]==vault.digest(vault.canonical(approval)),"backup_candidate_observation_invalid")
    times=[q[k] for k in ("captured_at","restore_started_at","restore_finished_at","observed_at")]
    require(all(type(x) is int for x in times),"backup_candidate_time_invalid")
    captured,started,finished,observed=times
    require(0<=captured<=started<=finished<=observed<=now<=pins["expires_at"] and a["approved_at"]<=observed and observed>=pins["issued_at"],"backup_candidate_time_invalid")
    require(now-captured<=policy_doc["rpo_minutes"]*60 and finished-started<=policy_doc["rto_minutes"]*60,"backup_candidate_recovery_target_missed")
    require(policy.is_hash(q["source_fingerprint_sha256"]) and q["source_fingerprint_sha256"]==q["restored_fingerprint_sha256"],"backup_candidate_fingerprint_mismatch")
    require(isinstance(q["checks"],dict) and set(q["checks"])==CHECKS and all(x is True for x in q["checks"].values()),"backup_candidate_checks_incomplete")
    return {"scope":SCOPE,"policy_sha256":reviewed["policy_sha256"],"request_sha256":vault.digest(vault.canonical(pins)),"proof_sha256":vault.digest(vault.canonical(proof)),"approval_sha256":q["approval_sha256"],"checkpoint_sha256":pins["checkpoint_sha256"],"signature_verified":True,"freshness_verified":True,"independent_observer_verified":False,"production_backup_proof":False,"execution_enabled":False}

def consume(root,policy_doc,approval,proof,pins,approver_key,observer_key,expected_approver_key_sha256,now=None):
    now=int(time.time()) if now is None else now
    root=registry.trusted_directory(root)
    result=verify(policy_doc,approval,proof,pins,approver_key,observer_key,expected_approver_key_sha256,now)
    # One checkpoint across jobs, not merely one exact signature. External
    # authority must also pin one request per job and protect the registry from rollback.
    receipt={**result,"consumed_at":now,"single_checkpoint_consumption_recorded":True,"rollback_protection_verified":False}
    try:vault.write_exclusive(root,pins["checkpoint_sha256"]+".backup-candidate-consumed.json",vault.canonical(receipt))
    except FileExistsError:raise ValueError("backup_candidate_checkpoint_already_consumed") from None
    return receipt
