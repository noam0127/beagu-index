"""Stage 5: independent recovery decisions; isolated PostgreSQL only.
Do not restore over live data, replay a possibly applied mutation or unlock partial effects.
"""
import base64
import pathlib
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
import integrated_runner as r
import integrated_verify as v
import integrated_backup as b

def require(ok,code):r.require(ok,code)
def canonical(obj):return r.canonical(obj).encode()
def signed_payload(envelope,key,kind):
    require(isinstance(envelope,dict) and set(envelope)=={"payload","signature"},"invalid_recovery_envelope")
    payload=envelope["payload"]
    require(isinstance(payload,dict) and payload.get("kind")==kind,"wrong_recovery_role")
    try:Ed25519PublicKey.from_public_bytes(key).verify(base64.b64decode(envelope["signature"],validate=True),canonical(payload))
    except (InvalidSignature,ValueError,TypeError):raise ValueError("invalid_recovery_signature") from None
    return payload

def inspect(ledger,job):
    state=ledger.snapshot(job)
    require(state["status"] in ("running","blocked"),"recovery_not_required")
    idx=state["next_step"];step=state["steps"][idx]
    require(step["status"] in ("running","blocked") and step["incident_id"] and step["incident_worker_run"],"no_uncertain_step")
    return {"scope":r.SCOPE,"job_id":job,"idx":idx,"incident_id":step["incident_id"],
        "incident_worker_run":step["incident_worker_run"],"base_sha":state["base_sha"],"candidate_sha":state["candidate_sha"],
        "plan_sha256":state["plan_sha"],"recipe_sha256":state["recipe_sha"],
        "expected_status":state["status"],"expected_step_status":step["status"],"operation":step["task"]["op"],
        "completed_step_sha256":r.digest([s for s in state["steps"][:idx]])}

def recovery_options(incident):
    if incident["idx"]==0 and incident["operation"]=="backup":
        return ["hold","abandon_before_mutation"]
    return ["hold"]

def decide(ledger,job,observation,approval,observer_key,owner_key,directory):
    require(isinstance(observer_key,bytes) and isinstance(owner_key,bytes) and len(observer_key)==len(owner_key)==32 and observer_key!=owner_key,"independent_recovery_keys_required")
    o=signed_payload(observation,observer_key,"recovery_observation")
    a=signed_payload(approval,owner_key,"recovery_approval")
    require(set(o)=={"kind","incident","worker_retired","no_effect_verified","current_state_sha256"} and
        type(o["worker_retired"]) is bool and type(o["no_effect_verified"]) is bool and
        isinstance(o["current_state_sha256"],str) and v.DIGEST.fullmatch(o["current_state_sha256"]),"invalid_recovery_observation")
    require(set(a)=={"kind","incident_sha256","observation_sha256","decision","confirmed"} and a["confirmed"] is True and
        a["observation_sha256"]==r.digest(observation) and a["incident_sha256"]==r.digest(o["incident"]),"recovery_approval_mismatch")
    incident=inspect(ledger,job)
    require(o["incident"]==incident,"recovery_state_changed")
    decision=a["decision"]
    require(decision in recovery_options(incident),"partial_effect_requires_manual_recovery")
    if decision=="abandon_before_mutation":
        require(o["worker_retired"] and o["no_effect_verified"],"absence_of_effect_not_verified")
    # Retain both signatures before any control state change. Existing proof is never overwritten.
    directory=pathlib.Path(directory);b.safe_dir(directory)
    proof={"observation":observation,"approval":approval}
    name=incident["incident_id"]+"-"+r.digest(approval)+".recovery.json"
    b.private_write(directory/name,canonical(proof))
    return ledger.rpc("recovery_decision",{**{k:incident[k] for k in ("job_id","idx","incident_id","incident_worker_run","base_sha","candidate_sha","plan_sha256","recipe_sha256","expected_status","expected_step_status")},
        "decision":decision,"observation_sha256":r.digest(observation),"approval_sha256":r.digest(approval),
        "worker_retired":o["worker_retired"],"no_effect_verified":o["no_effect_verified"]})
