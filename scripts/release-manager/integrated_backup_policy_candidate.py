"""Offline candidate for production backup policy review; never grants execution.
Trusted approval digest must come from an external operator, not this module.
No credential handling, network, filesystem, exporter, signer or live adapter.
"""
import hashlib
import json
import re

CATEGORIES=frozenset(("schemas","extensions","roles","grants","sequences","large_objects","storage","scheduled_jobs","external_dependencies","settings"))
REQUIRED_SCHEMAS=frozenset(("public","beagu_private","beagu_master","auth","storage","cron","vault","realtime","net","supabase_migrations"))
HASH=re.compile(r"[0-9a-f]{64}")
def require(ok,code):
    if not ok:raise ValueError(code)
def is_hash(x):return isinstance(x,str) and HASH.fullmatch(x) is not None
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()

def review(policy,approved_digest):
    """Validate a pinned design, not actual inventory, independent identity or restore."""
    require(isinstance(policy,dict) and set(policy)=={"schema","scope","inventory","schemas","retention_days","rpo_minutes","rto_minutes","custody","evidence"} and type(policy["schema"]) is int and policy["schema"]==1 and policy["scope"]=="production_backup_policy_candidate_v1","backup_policy_invalid")
    require(is_hash(approved_digest) and digest(policy)==approved_digest,"backup_policy_pin_mismatch")
    inventory=policy["inventory"]
    require(isinstance(inventory,dict) and set(inventory)==CATEGORIES and all(is_hash(x) for x in inventory.values()),"backup_inventory_incomplete")
    schemas=policy["schemas"]
    require(isinstance(schemas,list) and all(isinstance(x,str) and 0<len(x)<=128 for x in schemas) and len(schemas)==len(set(schemas)) and REQUIRED_SCHEMAS.issubset(schemas),"backup_schema_coverage")
    for k,lo,hi in (("retention_days",1,3650),("rpo_minutes",1,43200),("rto_minutes",1,43200)):
        require(type(policy[k]) is int and lo<=policy[k]<=hi,"backup_recovery_targets_invalid")
    c=policy["custody"]
    require(isinstance(c,dict) and set(c)=={"exporter","observer","verifier","recovery_key","storage_control"} and all(is_hash(x) for x in c.values()) and len(set(c.values()))==len(c),"backup_custody_not_separated")
    e=policy["evidence"]
    require(isinstance(e,dict) and set(e)=={"inventory_review","key_recovery_test","retention_lock","isolated_restore_plan","observer_identity_review","rollback_protected_ledger"} and all(is_hash(x) for x in e.values()),"backup_policy_evidence_incomplete")
    return {"policy_structure_verified":True,"policy_sha256":approved_digest,"inventory_verified":False,"independent_observer_verified":False,"production_backup_proof":False,"execution_enabled":False}
