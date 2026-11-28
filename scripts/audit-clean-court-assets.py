"""Conservative tracked-asset reference inventory. Report only; never delete."""
from pathlib import Path
import subprocess
import re
import json
import hashlib
from urllib.parse import quote

root = Path(__file__).resolve().parents[1]
tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode("utf-8").split("\0")
tracked = [p for p in tracked if p]
assets = [p for p in tracked if p.startswith(("js/", "styles/", "\u200bcss/")) and Path(p).suffix in (".js", ".css", ".mjs", ".cjs")]
texts = {}
skipped = []
for p in tracked:
    try:
        data = (root / p).read_bytes()
        if b"\0" in data:
            skipped.append(p)
            continue
        texts[p] = data.decode("utf-8")
    except (UnicodeDecodeError, OSError):
        skipped.append(p)

def category(p):
    if p.startswith(("tests/", "scripts/", ".github/", "docs/", "supabase/", "tools/")) or p.endswith((".md", ".sql", ".yml", ".yaml")):
        return "support"
    return "runtime_or_other"

rows = []
for asset in assets:
    name = Path(asset).name
    stem = Path(asset).stem
    exact = {asset, name, quote(asset), asset.encode("unicode_escape").decode()}
    direct = sorted(p for p, content in texts.items() if p != asset and p != "scripts/audit-clean-court-assets.py" and any(t in content for t in exact))
    hints = sorted(p for p, content in texts.items() if p != asset and p not in direct and p != "scripts/audit-clean-court-assets.py" and stem in content)
    rows.append({"asset": asset, "bytes": (root/asset).stat().st_size, "runtime_refs": [p for p in direct if category(p) == "runtime_or_other"], "support_refs": [p for p in direct if category(p) == "support"], "stem_hints": hints})

groups = {}
for asset in assets:
    groups.setdefault(hashlib.sha256((root/asset).read_bytes()).hexdigest(), []).append(asset)
duplicate_groups = [v for v in groups.values() if len(v) > 1]
unreferenced = [r for r in rows if not r["runtime_refs"] and not r["support_refs"] and not r["stem_hints"]]
support_only = [r for r in rows if not r["runtime_refs"] and r["support_refs"]]
dynamic = sorted(p for p,t in texts.items() if p != "scripts/audit-clean-court-assets.py" and category(p) == "runtime_or_other" and re.search(r"createElement\s*\(\s*['\"](?:script|link)['\"]|import\s*\(|importScripts\s*\(|\.src\s*=\s*[^;\n]+|@import\s",t))
print(json.dumps({"tracked":len(tracked),"assets":len(assets),"text_files":len(texts),"skipped":len(skipped),"zero_reference_candidates":unreferenced,"support_only":[{"asset":r["asset"],"refs":r["support_refs"]} for r in support_only],"duplicate_groups":duplicate_groups,"dynamic_loader_files":dynamic},ensure_ascii=False,indent=2))
print("PASS: reference inventory complete; zero-reference results are candidates, not proof of safe deletion.")
