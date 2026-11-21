#!/usr/bin/env python3
"""Prove QA hosting is separate AND cannot publish in step 14."""
import importlib.util
import json
import pathlib
import re
import subprocess
import tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
POLICY=ROOT/"docs/releases/v2-step14-qa-hosting-policy.json"
SPEC=importlib.util.spec_from_file_location(
    "qa_hosting_preflight_step14",
    ROOT/"scripts/release-manager/qa-hosting-preflight.py"
)
preflight=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preflight)
BSPEC=importlib.util.spec_from_file_location(
    "qa_candidate_step14",
    ROOT/"scripts/release-manager/build-isolated-candidate.py"
)
builder=importlib.util.module_from_spec(BSPEC)
BSPEC.loader.exec_module(builder)

SHA=subprocess.check_output(
    ["git","rev-parse","HEAD"],cwd=ROOT,text=True
).strip()
policy=json.loads(POLICY.read_text(encoding="utf8"))
assert policy["proposed_qa_project"]=="beagu-v2-isolated-qa"
assert "beagu-index" in policy["prohibited_cloudflare_projects"]
assert policy["actual_external_deployment_enabled"] is False
assert policy["qa_pages_project_created"] is False
assert policy["access_policy_verified"] is False
assert policy["user_approval_to_publish"] is False
assert preflight.QA_EXTERNAL_PUBLICATION_LOCKED is True

with tempfile.TemporaryDirectory(prefix="beagu-step14-hosting-") as temp:
    base=pathlib.Path(temp)
    candidate=base/"candidate"
    builder.build(SHA,candidate)
    result=preflight.evaluate(candidate,SHA)
    assert result["ready_to_publish"] is False
    assert result["external_publication_allowed"] is False
    assert result["external_publication_performed"] is False
    assert result["website_ever_uploaded"] is False
    assert result["release_gate"]=="blocked"
    assert "external_qa_publication_code_lock" in result["blockers"]
    assert "qa_pages_project_created_missing" in result["blockers"]
    assert "access_policy_verified_missing" in result["blockers"]
    assert result["proposed_separate_project"]=="beagu-v2-isolated-qa"
    cmd=result["command_preview_not_executed"]
    assert "--project-name=beagu-v2-isolated-qa" in cmd
    assert "--branch=qa-v2-"+SHA[:12] in cmd
    assert "--commit-hash="+SHA in cmd
    assert not (candidate/"CNAME").exists()

    bad_sha=preflight.evaluate(candidate,"bad")
    assert "invalid_candidate_sha" in bad_sha["blockers"]
    assert "candidate_sha_mismatch" in bad_sha["blockers"]

    wrong_valid=preflight.evaluate(candidate,"0"*40)
    assert "candidate_sha_mismatch" in wrong_valid["blockers"]
    assert wrong_valid["external_publication_allowed"] is False

    (candidate/"CNAME").write_text("baeguindex.com")
    contaminated=preflight.evaluate(candidate,SHA)
    assert "production_deployment_config_present" in contaminated["blockers"]

    (candidate/"CNAME").unlink()
    # Even if a stale advisory policy JSON is maliciously flipped to "ready",
    # the reviewed source lock must continue to prohibit upload.
    forged=dict(policy)
    for key in ("qa_pages_project_created","access_policy_verified",
                "qa_credentials_configured",
                "qa_environment_protection_verified",
                "independent_qa_domain_verified","user_approval_to_publish",
                "actual_external_deployment_enabled"):
        forged[key]=True
    forged_path=base/"forged-policy.json"
    forged_path.write_text(json.dumps(forged),encoding="utf8")
    attempted=preflight.evaluate(candidate,SHA,policy_path=forged_path)
    assert attempted["ready_to_publish"] is False
    assert attempted["external_publication_allowed"] is False
    assert "external_qa_publication_code_lock" in attempted["blockers"]

workflow=(ROOT/".github/workflows/release-v2-independent-qa-hosting.yml").read_text(encoding="utf8")
assert "workflow_dispatch:" in workflow
assert "publish-to-separate-qa-project:" in workflow
assert re.search(r"publish-to-separate-qa-project:\s*\n\s*if: \$\{\{ false \}\}",workflow)
assert "environment: beagu-v2-qa-protected" in workflow
assert "QA_CLOUDFLARE_API_TOKEN" in workflow
assert "QA_CLOUDFLARE_ACCOUNT_ID" in workflow
assert "--project-name=beagu-v2-isolated-qa" in workflow
assert ("cd \""+chr(36)+"{RUNNER_TEMP}\"") in workflow
assert "--project-name=beagu-index" not in workflow
assert not re.search(r"^\s*push:",workflow,re.M)
assert not re.search(r"^\s*pull_request:",workflow,re.M)
root_wrangler=json.loads((ROOT/"wrangler.jsonc").read_text(encoding="utf8"))
assert root_wrangler["name"]=="beagu-index"
assert root_wrangler["name"]!=policy["proposed_qa_project"]
print("PASS: independent QA host planned; hard code lock survives forged flags, no deploy")
