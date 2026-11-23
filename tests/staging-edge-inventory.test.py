#!/usr/bin/env python3
"""Offline contract tests for exact staging Edge Function inventory comparison."""
from __future__ import annotations
from datetime import date
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "scripts/staging/audit-frontend-edge-functions.py"
spec = importlib.util.spec_from_file_location("stage_api_audit", path)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

calls = module.references({
    "index.html": '<script>fetch("https://ycwuugggqbunlbwuzvbx.supabase.co'
                  '/functions/v1/beagu-level-api")</script>',
    "js/visit-stats.js": "const endpoint='/functions/v1/beagu-telemetry-v2';",
    "js/example.js": 'supabase.functions.invoke("beagu-level-api", {})',
    "js/not-edge.js": "const x='/rest/v1/beagu-level-api';",
})
assert calls == {
    "beagu-level-api": ["index.html", "js/example.js"],
    "beagu-telemetry-v2": ["js/visit-stats.js"],
}, calls
print("PASS: detect frontend edge routes with origin URLs, root paths and SDK invoke")

inventory = json.loads(module.INVENTORY.read_text(encoding="utf-8"))
assert inventory["project_ref"] == module.PROJECT
names = {f["slug"] for f in inventory["functions"]}
assert "beagu-level-api" in names
assert "beagu-admin-access" in names
assert "beagu-telemetry-v2" not in names, "Snapshot must reflect real stage absence"
assert "beagu-edited-api-v1" in names, "Staging restored API must be reflected"
assert "arcade-leaderboard" in names and "beagu-school-culture-v1" in names and "beagu-school-interest-v1" in names
report = module.check(calls, inventory, date(2026, 11, 23))
assert list(report["missing"]) == ["beagu-telemetry-v2"]
assert report["ready_for_real_e2e"] is False
assert report["real_e2e_executed"] is False
assert report["production_deployment_permitted"] is False
print("PASS: known missing stage telemetry detected, never counted as E2E success")

complete = json.loads(json.dumps(inventory))
complete["functions"].append({
    "slug": "beagu-telemetry-v2", "version": 1, "status": "ACTIVE", "verify_jwt": False
})
yes = module.check(calls, complete, date(2026, 11, 23))
assert yes["missing"] == {}
assert yes["ready_for_real_e2e"] is True
assert yes["real_e2e_executed"] is False
assert yes["production_deployment_permitted"] is False
print("PASS: even all endpoint prerequisites are not actual E2E or permission to deploy")

for mutation in [
    lambda j: j.update(project_ref="snvzwrexuqavnfvzgxqj"),
    lambda j: j.update(schema=2),
    lambda j: j.update(functions=[]),
    lambda j: j["functions"].append(dict(j["functions"][0])),
]:
    bad = json.loads(json.dumps(inventory))
    mutation(bad)
    try: module.check(calls, bad, date(2026, 11, 23))
    except ValueError: pass
    else: raise AssertionError("Invalid inventory accepted")
expired = module.check(calls, inventory, date(2026, 12, 10))
assert expired["snapshot_stale"] is True
assert expired["ready_for_real_e2e"] is False
print("PASS: wrong project, duplicate entries and stale evidence fail closed")

# This test runs AFTER the CI builds the exact Git SHA preview.
actual = module.audit(today=date(2026, 11, 23))
assert "beagu-telemetry-v2" in actual["missing_with_repo_source"]
assert actual["missing_without_repo_source"] == []
assert len(actual["missing"]) == 7
assert actual["ready_for_real_e2e"] is False
assert actual["production_deployment_permitted"] is False
print("PASS: edited/culture/arcade/interest APIs deployed; 7 missing endpoints remain")
