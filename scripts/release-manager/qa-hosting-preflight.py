#!/usr/bin/env python3
"""Plan an independent Cloudflare QA Pages deployment WITHOUT publishing.

The policy is deliberately a hard stop in v2 step 14. A future separately
reviewed change plus explicit owner approval is required to unlock publishing.
No Cloudflare credentials are imported or accessed.
"""
import argparse
import json
import pathlib
import re
import subprocess

ROOT=pathlib.Path(__file__).resolve().parents[2]
POLICY=ROOT/"docs/releases/v2-step14-qa-hosting-policy.json"
SHA=re.compile(r"^[0-9a-f]{40}$")
QA_PROJECT="beagu-v2-isolated-qa"
PRODUCTION_PROJECT="beagu-index"
# Fail closed, independent from JSON fields and environment variables.
QA_EXTERNAL_PUBLICATION_LOCKED=True

def evaluate(candidate_dir, candidate_sha,policy_path=POLICY):
    root=pathlib.Path(candidate_dir).expanduser().resolve()
    policy=json.loads(pathlib.Path(policy_path).read_text(encoding="utf8"))
    blockers=[]
    def block(reason):
        if reason not in blockers:
            blockers.append(reason)
    if QA_EXTERNAL_PUBLICATION_LOCKED:
        block("external_qa_publication_code_lock")
    if not isinstance(candidate_sha,str) or not SHA.fullmatch(candidate_sha):
        block("invalid_candidate_sha")
    if not root.is_dir() or ROOT in root.parents or root==ROOT:
        block("invalid_candidate_output")
    if policy.get("proposed_qa_project")!=QA_PROJECT or QA_PROJECT==PRODUCTION_PROJECT:
        block("separate_qa_project_not_pinned")
    if PRODUCTION_PROJECT not in policy.get("prohibited_cloudflare_projects",[]):
        block("production_cloudflare_project_not_explicitly_denied")
    for name in ("qa_pages_project_created","access_policy_verified","qa_credentials_configured",
                 "qa_environment_protection_verified","independent_qa_domain_verified",
                 "user_approval_to_publish"):
        if policy.get(name) is not True:
            block(name+"_missing")
    if policy.get("actual_external_deployment_enabled") is not True:
        block("policy_external_deployment_disabled")
    candidate_manifest=None
    if root.is_dir():
        manifest_path=root/".qa-candidate-manifest.json"
        try:
            candidate_manifest=json.loads(manifest_path.read_text(encoding="utf8"))
        except (OSError,ValueError):
            block("candidate_manifest_unavailable")
        if (root/"CNAME").exists() or (root/"wrangler.jsonc").exists():
            block("production_deployment_config_present")
        for restricted in ("supabase","scripts",".github","docs","release-candidate.json"):
            if (root/restricted).exists():
                block("unexpected_nonwebsite_source")
        if not (root/"index.html").is_file():
            block("candidate_entrypoint_missing")
    if candidate_manifest is not None:
        if candidate_manifest.get("candidate_sha")!=candidate_sha:
            block("candidate_sha_mismatch")
        if candidate_manifest.get("final_release_gate")!="blocked":
            block("candidate_claimed_release_ready")
        if candidate_manifest.get("production_supabase_allowed") is not False:
            block("candidate_production_backend_not_denied")
        if candidate_manifest.get("site_deployed") is not False:
            block("candidate_already_deployed_claim")
    if not root.is_dir():
        block("candidate_directory_missing")
    # This is a preview command plan, never a subprocess invocation.
    # Exact binary/CLI remains pinned by a future reviewed publishing workflow.
    command_preview=[
        "wrangler","pages","deploy",str(root),
        "--project-name="+QA_PROJECT,
        "--branch=qa-v2-"+(candidate_sha[:12] if SHA.fullmatch(str(candidate_sha)) else "INVALID"),
        "--commit-hash="+(candidate_sha if SHA.fullmatch(str(candidate_sha)) else "INVALID")
    ]
    return {
        "schema_version":1,
        "candidate_sha":candidate_sha,
        "provider":"cloudflare_pages_direct_upload",
        "proposed_separate_project":QA_PROJECT,
        "actual_qa_hosting_exists":False,
        "external_publication_allowed":False,
        "external_publication_performed":False,
        "required_cloudflare_access":"not_verified",
        "website_ever_uploaded":False,
        "command_preview_not_executed":command_preview,
        "blockers":blockers,
        "ready_to_publish":False,
        "release_gate":"blocked"
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--sha",required=True)
    parser.add_argument("--candidate-dir",required=True)
    args=parser.parse_args()
    print(json.dumps(evaluate(args.candidate_dir,args.sha),ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
