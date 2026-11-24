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


def rehearse_forward_repair(cluster,ledger,job,directory,key,key_id,historical_pin,approved):
    """Preserve the original and post-incident data in a new isolated clone.

    Fixed synthetic repair only. A historical checkpoint is reference evidence,
    never the restore input for the current database. The actual job remains blocked.
    No production SQL, user-supplied command, external endpoint or resume path.
    """
    import integrated_vault as vault
    require(type(cluster) is b.FixtureCluster and cluster.container is not None,"isolated_cluster_required")
    incident=inspect(ledger,job)
    state=ledger.snapshot(job)
    require(incident["expected_status"]=="blocked" and incident["operation"]=="apply_sql" and incident["idx"]>0,"recovery_rehearsal_not_ready")
    require(state["recovery"] and state["recovery"][-1]["decision"]=="hold" and state["recovery"][-1]["incident_id"]==incident["incident_id"],"recovery_hold_required")
    pins=[incident[k] for k in ("plan_sha256","base_sha","candidate_sha")]
    historical,old_dump=vault.unseal(directory,key,key_id,historical_pin,*pins)
    current=b.fingerprint(cluster,"fixture_source")
    expected={"scope":r.SCOPE,"incident_sha256":r.digest(incident),"historical_checkpoint_sha256":historical_pin["object_sha256"],
        "current_state_sha256":r.digest(current),"repair":"fixture_add_missing_index","confirmed":True}
    require(approved==expected,"rehearsal_approval_mismatch")
    # Fresh backup of CURRENT state, not just pre-release state.
    current_pin=b.encrypted_checkpoint(cluster,directory,key,key_id,*pins)
    manifest,dump=vault.unseal(directory,key,key_id,current_pin,*pins)
    require(manifest["fingerprint"]==current,"source_changed_after_approval")
    # Old checkpoint may contain fewer rows. It is restored only into a reference clone.
    cluster.restore(old_dump,"fixture_restore")
    require(b.fingerprint(cluster,"fixture_restore")==historical["fingerprint"],"historical_restore_mismatch")
    cluster.restore(dump,"fixture_recovery")
    require(b.fingerprint(cluster,"fixture_recovery")==current,"current_restore_mismatch")
    # Synthetic repair is deliberately additive, has no row-changing SQL, and is confined to clone.
    require(cluster.sql("fixture_recovery","SELECT to_regclass('public.fixture_added');").strip()==b"fixture_added","unexpected_repair_schema")
    cluster.sql("fixture_recovery","BEGIN; CREATE INDEX fixture_repair_idx ON public.fixture_added(id); COMMIT;")
    repaired=b.fingerprint(cluster,"fixture_recovery")
    require(repaired["tables"]==current["tables"] and repaired["sequences"]==current["sequences"],"repair_data_changed")
    require(repaired["schema_sha256"]!=current["schema_sha256"],"repair_schema_unchanged")
    require(cluster.sql("fixture_recovery","SELECT to_regclass('public.fixture_repair_idx');").strip()==b"fixture_repair_idx","repair_index_missing")
    require(b.fingerprint(cluster,"fixture_source")==current,"source_changed_during_rehearsal")
    require(inspect(ledger,job)==incident,"incident_changed_during_rehearsal")
    # No unlock, restore to source, retry or finalization. Repair approval is fixture-only.
    report={"scope":r.SCOPE,"incident_sha256":r.digest(incident),"approval_sha256":r.digest(approved),
        "historical_checkpoint_sha256":historical_pin["object_sha256"],"current_checkpoint_sha256":current_pin["object_sha256"],
        "source_state_sha256":r.digest(current),"repaired_state_sha256":r.digest(repaired),
        "preserved_tables":len(current["tables"]),"preserved_sequences":len(current["sequences"]),
        "historical_verified":True,"current_restore_verified":True,"data_preserved":True,
        "source_unchanged":True,"job_remains_blocked":True,"execution_enabled":False}
    b.private_write(pathlib.Path(directory)/(incident["incident_id"]+".rehearsal.json"),canonical(report))
    return report
