#!/usr/bin/env python3
"""BAEGU v1.1.0 preflight for any future database or Auth mutation.

Does not connect to Supabase. This is a fail-closed prerequisite that MUST be
called by any future deployment/migration workflow; it is not evidence a backup exists.
"""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "docs/releases/v1.1.0-rollback-baseline.json"


def readiness(state: dict) -> tuple[bool, list[str]]:
    db = state.get("database") or {}
    checks = state.get("checks") or {}
    reasons = []
    if db.get("recovery_export_verified") is not True:
        reasons.append("encrypted_offsite_backup_not_verified")
    if not str(checks.get("database_data_restore_test", "")).startswith("PASS:"):
        reasons.append("isolated_database_restore_not_verified")
    if db.get("writes_blocked_until_backup_verified") is True:
        reasons.append("database_write_hold_active")
    return (not reasons, reasons)


def self_test() -> None:
    ok = {
        "database": {"recovery_export_verified": True,
                     "writes_blocked_until_backup_verified": False},
        "checks": {"database_data_restore_test": "PASS: restored to isolated instance"},
    }
    allowed, reasons = readiness(ok)
    assert allowed and not reasons
    for field, value in [
        ("recovery_export_verified", False),
        ("writes_blocked_until_backup_verified", True),
    ]:
        item = json.loads(json.dumps(ok))
        item["database"][field] = value
        assert not readiness(item)[0]
    item = json.loads(json.dumps(ok))
    item["checks"]["database_data_restore_test"] = "NOT_VERIFIED"
    assert not readiness(item)[0]
    assert not readiness({})[0]
    print("PASS: DB mutation guard rejects missing backups, untested restore, and active hold.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit-only", action="store_true", help="Report readiness but do not block this read-only audit.")
    parser.add_argument("--self-test", action="store_true", help="Test guard locally without database access.")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    state = json.loads(MANIFEST.read_text(encoding="utf-8"))
    allowed, reasons = readiness(state)
    if allowed:
        print("READY: verified database backup and isolated restore evidence recorded.")
        return 0
    print("BLOCKED: unsafe to change database/Auth settings: " + ", ".join(reasons))
    if args.audit_only:
        print("Audit-only mode: no changes attempted; backup/restore remains unresolved.")
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
