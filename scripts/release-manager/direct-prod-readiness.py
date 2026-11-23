#!/usr/bin/env python3
"""Read-only direct-production v1.1.0 release gate.
No staged web is required, but candidate MUST be production-safe before live deployment.

Compares the *actually deployed* release SHA against the candidate HEAD, NOT
merely origin/main. Emitting "NO-GO" is intentional and exit 2 blocks deploy.
Never mutate a GitHub branch, Supabase, GitHub Pages or users.
"""
import argparse,json,subprocess,sys
from pathlib import Path

REPO="noam0127/beagu-index"
STAGING_REF="ycwuugggqbunlbwuzvbx"
PROD_REF="snvzwrexuqavnfvzgxqj"
STATIC_SUFFIXES=(".css",".svg",".png",".jpg",".jpeg",".webp",".ico")
# Only assets whose byte changes can be deployed without changing auth,
# data flows, migrations, page layout, or runtime behavior. Every HTML/JS
# file requires separate production contract/integration testing.
PROD_SAFE_PREFIXES=("styles/","assets/","images/")
NEVER_COPY_PREFIXES=("scripts/staging/","tests/sql/staging-",
    "supabase/migrations/","supabase/functions/",".github/workflows/",
    "scripts/release-manager/")
HIGH_RISK_ROOTS=("challenge.html","admin-updates.html","admin.html",
    "release-candidate.json","render.yaml","data/public-compare-school-directory-v1.json",
    "teacher-class-diary-entry.html")

def git(*args):
    return subprocess.check_output(["git",*args],text=True,stderr=subprocess.STDOUT).strip()

def classification(path):
    if path.startswith(NEVER_COPY_PREFIXES):
        return "BLOCK_STAGE_OR_PRIVILEGED"
    if path in HIGH_RISK_ROOTS or path.endswith((".sql",".ts",".tsx",".mjs",".js",".html",".json",".yml",".yaml")):
        return "BLOCK_BEHAVIOR_OR_DATA"
    if path.endswith(STATIC_SUFFIXES) and path.startswith(PROD_SAFE_PREFIXES):
        return "POSSIBLE_STATIC_ONLY"
    return "REVIEW_NOT_EXECUTABLE"

def evaluate(base,main_sha,head_sha,filenames):
    groups={"BLOCK_STAGE_OR_PRIVILEGED":[],"BLOCK_BEHAVIOR_OR_DATA":[],
            "POSSIBLE_STATIC_ONLY":[],"REVIEW_NOT_EXECUTABLE":[]}
    for path in filenames:
        groups[classification(path)].append(path)
    blockers=groups["BLOCK_STAGE_OR_PRIVILEGED"]+groups["BLOCK_BEHAVIOR_OR_DATA"]+groups["REVIEW_NOT_EXECUTABLE"]
    # GitHub main != deployed release SHA is NOT itself a vulnerability, but
    # the *entire* deployed-baseline diff must be reviewed before direct release.
    notes=[]
    if main_sha!=base:
        notes.append("PRODUCTION_SHA_DIFFERS_FROM_GITHUB_MAIN: compare deployed SHA, not just main")
    if STAGING_REF in head_sha or PROD_REF in head_sha:
        raise ValueError("Invalid SHA")
    if blockers:
        notes.append("CANDIDATE_HAS_NONSTATIC_OR_STAGE_ONLY_CHANGES")
    if not filenames:
        notes.append("NO_CHANGES_TO_RELEASE")
    return {
        "decision":"NO_GO" if notes else "STATIC_ONLY_REVIEW_REQUIRED",
        "deployed_sha":base,"main_sha":main_sha,"candidate_sha":head_sha,
        "changed_files":len(filenames),"counts":{k:len(v) for k,v in groups.items()},
        "blockers":{k:v[:45] for k,v in groups.items() if k.startswith("BLOCK")},
        "notes":notes,
        "deployment_executed":False,
        "email_lv3_mfa_positive_e2e_verified":False,
        "required_next":"Isolate reviewed production-safe changes and verify real production API contracts; preserve MFA release approval, locked features and immutable rollback SHA."
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--deployed-sha",required=True)
    ap.add_argument("--out",default="/tmp/beagu-direct-prod-readiness.json")
    args=ap.parse_args()
    deployed=args.deployed_sha
    import re
    if not re.fullmatch("[0-9a-f]{40}",deployed):raise ValueError("Invalid SHA")
    head=git("rev-parse","HEAD")
    mainsha=git("rev-parse","origin/main")
    git("cat-file","-e",deployed+"^{commit}")
    changes=git("diff","--name-only",deployed,head).splitlines()
    result=evaluate(deployed,mainsha,head,changes)
    Path(args.out).write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n")
    print("DIRECT PROD RELEASE GATE: "+result["decision"])
    print("Deployed",deployed,"main",mainsha,"candidate",head)
    print("Files",len(changes),"categorized",result["counts"])
    for n in result["notes"]:print("BLOCK",n)
    print("Full report:",args.out)
    return 2 if result["decision"]=="NO_GO" else 0

if __name__=="__main__":
    sys.exit(main())
