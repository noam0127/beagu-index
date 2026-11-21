#!/usr/bin/env python3
"""Build a disposable staging candidate for Stage36 desktop/mobile QA.

Creates no remote site, copies no real database, reads no private response.
The original release worker is reused only for its offline archive builder.
"""
import argparse
import importlib.util
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--sha", required=True)
    args = parser.parse_args()
    output = pathlib.Path(args.output).resolve()
    expected = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if args.sha != expected or len(expected) != 40:
        raise SystemExit("Refuse unpinned browser preview")
    if output.exists() and any(output.iterdir()):
        raise SystemExit("Refuse nonempty preview output")
    output.mkdir(parents=True, exist_ok=True)

    spec = importlib.util.spec_from_file_location(
        "beagu_stage36_worker", ROOT / "scripts/release-manager/worker.py")
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    worker.ROOT = ROOT
    worker.PLAN = output / "stage36-offline-plan.json"
    worker.OUTPUT = output / "artifact"
    worker.PLAN.write_text(
        json.dumps({"has_job": True, "production_sha": expected,
                    "staging_sha": expected}), encoding="utf-8")
    worker.build()
    preview = worker.OUTPUT / "_preview"
    worker.verify_isolated_preview(preview)
    if (preview / "CNAME").exists() or (preview / "supabase").exists():
        raise RuntimeError("Unsafe preview contains deployment or DB files")
    for path in ["index.html", "challenge.html", "admin.html",
                 "search-lv1.html", "statistics.html"]:
        if not (preview / path).is_file():
            raise RuntimeError("Missing preview page: " + path)
        content = (preview / path).read_text(encoding="utf-8")
        if worker.PRODUCTION_PROJECT in content:
            raise RuntimeError("Live project ID leaked into " + path)
    print("PASS: isolated local preview created; zero remote writes")

if __name__ == "__main__":
    main()
