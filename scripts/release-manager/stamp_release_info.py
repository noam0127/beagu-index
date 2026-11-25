#!/usr/bin/env python3
"""Stamp only an already selected release artifact; never modifies repository source."""
import argparse, datetime, json, pathlib, re
def stamp(root, sha, environment):
    if not re.fullmatch(r"[0-9a-f]{40}",sha) or environment not in ("production","preview"):
        raise ValueError("invalid build identity")
    file=pathlib.Path(root)/"release-info.json"
    if not file.is_file(): return False
    meta=json.loads(file.read_text(encoding="utf8"))
    if meta.get("schema")!=1 or not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?",meta.get("version","")):
        raise ValueError("invalid release metadata")
    meta.update(environment=environment,commit=sha,builtAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),deployedAt=None)
    file.write_text(json.dumps(meta,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    return True
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("root");p.add_argument("sha");p.add_argument("environment");a=p.parse_args();stamp(a.root,a.sha,a.environment)
