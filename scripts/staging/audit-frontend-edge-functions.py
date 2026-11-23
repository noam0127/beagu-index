#!/usr/bin/env python3
"""Compare immutable static-preview API routes with a test Supabase function
inventory. All local processing: no network requests and no mutations.

By default, missing or rollout-locked endpoints appear as BLOCKED without falsely claiming E2E
success. The --require-ready flag makes them a hard failure.
"""
from __future__ import annotations
import argparse
from datetime import date
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "_standalone_staging"
INVENTORY = ROOT / "scripts/staging/stage-edge-functions-inventory.json"
API = re.compile(r"/functions/v1/([a-z][a-z0-9_-]{1,127})(?![a-z0-9_-])", re.I)
INVOKE = re.compile(r"\.functions\.invoke\s*\(\s*['\"]([a-z][a-z0-9_-]{1,127})['\"]", re.I)
PROJECT = "ycwuugggqbunlbwuzvbx"
SCANNED = {".html", ".js", ".mjs", ".json", ".css"}


def references(paths: dict[str, str]) -> dict[str, list[str]]:
    usages: dict[str, set[str]] = {}
    for filename, body in paths.items():
        for pattern in (API, INVOKE):
            for match in pattern.finditer(body):
                slug = match.group(1).lower()
                usages.setdefault(slug, set()).add(filename)
    return {slug: sorted(files) for slug, files in sorted(usages.items())}


def check(calls: dict[str, list[str]], inventory: dict,
          today: date | None = None) -> dict:
    if inventory.get("schema") != 1 or inventory.get("project_ref") != PROJECT:
        raise ValueError("Wrong schema or project: refusing production inventory")
    entries = inventory.get("functions")
    if not isinstance(entries, list) or not entries:
        raise ValueError("Empty staging Edge Function inventory")
    names: set[str] = set()
    for obj in entries:
        if not isinstance(obj, dict):
            raise ValueError("Bad function metadata")
        slug, version = obj.get("slug"), obj.get("version")
        if (not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9_-]+", slug)
                or slug in names or not isinstance(version, int) or version < 1):
            raise ValueError("Invalid or repeated function slug/version")
        names.add(slug)
    gates = inventory.get("feature_gates", {})
    if not isinstance(gates, dict):
        raise ValueError("Bad gated feature metadata")
    for slug, reason in gates.items():
        if (not isinstance(slug, str) or slug not in names or
                not isinstance(reason, str) or
                not re.fullmatch(r"[a-z][a-z0-9_]{3,80}", reason)):
            raise ValueError("Invalid or unreviewed locked endpoint")
    observed = inventory.get("verified_on")
    if not isinstance(observed, str):
        raise ValueError("Inventory lacks its verified date")
    snapshot = date.fromisoformat(observed)
    now = today or date.today()
    age = (now - snapshot).days
    if age < 0:
        raise ValueError("Future-dated inventory is not verifiable")
    # Static CI uses a snapshot; a live-site check needs fresh evidence.
    stale = age > 7
    missing = {slug: files for slug, files in calls.items() if slug not in names}
    locked = {slug: gates[slug] for slug in sorted(calls) if slug in gates}
    return {
        "project": PROJECT,
        "snapshot_date": observed,
        "snapshot_age_days": age,
        "snapshot_stale": stale,
        "staging_deployed_functions": len(names),
        "frontend_edge_functions": len(calls),
        "referenced": calls,
        "missing": missing,
        "locked": locked,
        "ready_for_real_e2e": not missing and not locked and not stale,
        "real_e2e_executed": False,
        "production_deployment_permitted": False,
    }


def audit(preview: Path = PREVIEW, manifest: Path = INVENTORY,
          today: date | None = None) -> dict:
    if not preview.is_dir() or not (preview / "index.html").exists():
        raise ValueError("Build standalone staging bundle before scanning")
    files = {
        f.relative_to(preview).as_posix(): f.read_text(encoding="utf-8")
        for f in sorted(preview.rglob("*"))
        if f.is_file() and f.suffix.lower() in SCANNED
    }
    calls = references(files)
    if not calls:
        raise AssertionError("No API calls found: unsupported bundle or scanner regression")
    result = check(calls, json.loads(manifest.read_text(encoding="utf-8")), today)
    # Separate missing functions that have a reviewable repository source from
    # legacy endpoint names with no function source to safely deploy.
    result["missing_with_repo_source"] = sorted(
        slug for slug in result["missing"]
        if (ROOT / "supabase/functions" / slug / "index.ts").is_file()
    )
    result["missing_without_repo_source"] = sorted(
        slug for slug in result["missing"]
        if not (ROOT / "supabase/functions" / slug / "index.ts").is_file()
    )
    for slug, used in calls.items():
        label = "MISSING" if slug in result["missing"] else "PRESENT"
        print(f"{label} {slug} <- {', '.join(used[:7])}" +
              (f" (+{len(used)-7} more)" if len(used)>7 else ""))
    for slug in result["missing_without_repo_source"]:
        print("NO_SOURCE "+slug+" <- missing Supabase function source in GitHub")
    for slug, reason in result["locked"].items():
        print("LOCKED "+slug+" <- "+reason)
    if result["snapshot_stale"]:
        print("WARNING: inventory older than 7 days; refresh from test Supabase")
    print("EDGE_FUNCTION_READINESS "+json.dumps(result, ensure_ascii=False,
                                           sort_keys=True))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-ready", action="store_true",
                        help="Fail for missing, rollout-locked functions or stale inventory")
    args = parser.parse_args()
    try:
        result = audit()
        if not result["ready_for_real_e2e"]:
            print("BLOCKED: Edge Function inventory incomplete/locked. Do NOT claim "
                  "actual login or production deployment readiness.")
            if args.require_ready:
                sys.exit(2)
    except (ValueError, AssertionError, OSError, json.JSONDecodeError) as error:
        print("EDGE_FUNCTION_AUDIT_FAILED: " + str(error), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
