#!/usr/bin/env python3
"""Independent fail-closed direct prod release gate unit tests."""
import importlib.util
from pathlib import Path
p=Path(__file__).resolve().parents[1]/"scripts/release-manager/direct-prod-readiness.py"
spec=importlib.util.spec_from_file_location("direct_gate",p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
base="a"*40;main="b"*40;candidate="c"*40
assert m.classification("styles/beagu-participation-auth-v2.css")=="POSSIBLE_STATIC_ONLY"
for path in [
    "scripts/staging/recovered-beagu-level-api-v5/index.ts",
    "supabase/functions/beagu-level-api/index.ts",
    "supabase/migrations/20261123_super_admin.sql",
    ".github/workflows/beagu-release-controller.yml",
]:
    assert m.classification(path)=="BLOCK_STAGE_OR_PRIVILEGED",path
for path in [
    "challenge.html","admin-updates.html","js/challenge-member-auth-v1.js",
    "js/beagu-level-state-v1.js","js/supabase-config.js",
    "data/public-compare-school-directory-v1.json"
]:
    assert m.classification(path)=="BLOCK_BEHAVIOR_OR_DATA",path
blocked=m.evaluate(base,main,candidate,[
    "styles/beagu-participation-auth-v2.css",
    "scripts/staging/recovered-beagu-level-api-v5/index.ts",
    "js/challenge-member-auth-v1.js",
])
assert blocked["decision"]=="NO_GO"
assert blocked["deployment_executed"] is False
assert blocked["counts"]["POSSIBLE_STATIC_ONLY"]==1
assert blocked["counts"]["BLOCK_STAGE_OR_PRIVILEGED"]==1
assert blocked["counts"]["BLOCK_BEHAVIOR_OR_DATA"]==1
assert "PRODUCTION_SHA_DIFFERS_FROM_GITHUB_MAIN" in blocked["notes"]
assert m.evaluate(base,base,candidate,["styles/safe-only.css"])["decision"]=="STATIC_ONLY_REVIEW_REQUIRED"
assert m.evaluate(base,base,candidate,[])["decision"]=="NO_GO"
print("PASS: production commit comparison cannot confuse main with actually deployed SHA")
print("PASS: stage-only scripts, privileged functions, auth JS, admin and data paths deny direct release")
print("PASS: CSS is only a candidate for separate manual review; no deploy is executed")
