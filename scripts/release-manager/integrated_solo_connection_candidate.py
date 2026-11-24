"""Offline connection preparation only. No DB connection, credentials or export."""
import integrated_vault as v
import integrated_backup_policy_candidate as p
SCOPE="solo_backup_connection_candidate_v1"
KINDS=p.CATEGORIES
METHODS={"logical_dump","provider_backup","separate_export","not_applicable"}
require=v.require
def review(config,expected_digest):
    require(isinstance(config,dict) and set(config)=={"schema","scope","postgres_major","inventory_sha256","coverage","retention_days","rpo_minutes","rto_minutes","max_dump_bytes","key_id","execution_environment","storage","recovery_copy"} and type(config["schema"]) is int and config["schema"]==1 and config["scope"]==SCOPE,"solo_connection_config_invalid")
    require(p.is_hash(expected_digest) and p.digest(config)==expected_digest,"solo_connection_pin_mismatch")
    require(type(config["postgres_major"]) is int and config["postgres_major"]==17 and p.is_hash(config["inventory_sha256"]),"solo_connection_inventory_invalid")
    require(config["execution_environment"]=="private_trusted_worker" and config["storage"]=="private_google_drive" and config["recovery_copy"] in ("provider_recovery","separate_private_copy"),"solo_connection_private_storage_required")
    require(v.match(v.KEY_ID,config["key_id"]) and type(config["max_dump_bytes"]) is int and 0<config["max_dump_bytes"]<=8*1024**3,"solo_connection_key_or_capacity_invalid")
    for k,limit in (("retention_days",3650),("rpo_minutes",43200),("rto_minutes",43200)):
        require(type(config[k]) is int and 0<config[k]<=limit,"solo_connection_recovery_policy_invalid")
    coverage=config["coverage"]
    require(isinstance(coverage,dict) and set(coverage)==KINDS,"solo_connection_coverage_missing")
    for kind,entry in coverage.items():
        require(isinstance(entry,dict) and set(entry)=={"method","evidence_sha256"} and isinstance(entry["method"],str) and entry["method"] in METHODS and p.is_hash(entry["evidence_sha256"]),"solo_connection_coverage_invalid")
        require(kind not in ("schemas","roles","grants","sequences") or entry["method"]!="not_applicable","solo_connection_required_scope_omitted")
    return {"scope":SCOPE,"connection_plan_verified":True,"config_sha256":expected_digest,"actual_connection_verified":False,"production_backup_proof":False,"execution_enabled":False}
