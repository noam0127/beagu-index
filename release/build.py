"""Build the same static tree for preview and Pages. Only public runtime files ship."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

out = Path(sys.argv[1])
out.mkdir(exist_ok=False)
sha = os.environ.get("VERCEL_GIT_COMMIT_SHA") or subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
if not re.fullmatch(r"[a-f0-9]{40}",sha):
    raise ValueError("Missing verified source SHA")
prod = "https://snvzwrexuqavnfvzgxqj.supabase.co"
stage = "https://ycwuugggqbunlbwuzvbx.supabase.co"
key = os.environ["STAGE_PUBLISHABLE_KEY"]
if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", key):
    raise SystemExit("Expected staging publishable key")
runtime = "globalThis.beaguProduction = ['baeguindex.com','www.baeguindex.com'].includes(location.hostname);\n"
runtime += "globalThis.beaguBackend = beaguProduction ? %s : %s;\n" % (json.dumps(prod), json.dumps(stage))
runtime += "if (!beaguProduction) document.addEventListener('DOMContentLoaded',()=>{const b=document.createElement('strong');b.textContent='TEST · 테스트 웹';b.style.cssText='display:block;background:#ffd75e;color:#111;padding:6px;text-align:center';document.body.prepend(b)});"
for path in sorted(Path(".").rglob("*")):
    if not path.is_file() or path.is_symlink():
        continue
    if not (path.parts[0] in {"js","data","styles","assets","r","\u200bcss"} or
            len(path.parts)==1 and (path.suffix==".html" or path.name in {"CNAME","lv2-edited-column-schema.json"})):
        continue
    dest = out / path
    dest.parent.mkdir(parents=True,exist_ok=True)
    if path.suffix not in (".js",".html"):
        shutil.copyfile(path,dest)
        continue
    s=path.read_text()
    s=re.sub(r"""(['"])""" + re.escape(prod) + r"""([^'"]*)\1""",
             lambda m:"(globalThis.beaguBackend+"+json.dumps(m[2])+")",s)
    if prod in s:
        raise ValueError(f"Unmapped production backend: {path}")
    if path.name=="supabase-config.js":
        s=re.sub(r'"(sb_publishable_[\w-]+)"',lambda m:'(beaguProduction ? '+m[0]+' : '+json.dumps(key)+')',s)
    if path.suffix==".html":
        s=re.sub(r"<head(?:\s[^>]*)?>",lambda m:m[0]+'<script src="/js/release-runtime.js"></script>',s,count=1,flags=re.I)
    dest.write_text(s)
(out/"js/release-runtime.js").write_text(runtime)
(out/"release.json").write_text(json.dumps({"sha":sha}))
(out/".nojekyll").touch()
# Route every static survey entry through this local page. On the public domain
# the original Google Form is preserved; previews never leave for a real survey.
form="https://docs.google.com/forms/d/e/1FAIpQLSf3fY3b4amMyIpBLpU4tK69Bf3ZNVQ2r7eH2vBUUn0gxz7lYQ/viewform"
short="https://forms.gle/TPyCakK6Sj2zchRy7"
for path in [*out.glob("*.html"),*(out/"js").glob("*.js")]:
    s=path.read_text()
    if path.name=="beagu-referral-form-config-v1.js":
        s=s.replace("'"+form+"'", "(beaguProduction ? '"+form+"' : '')")
    else:
        for url in (form, short):
            s=s.replace(url, "/release-survey.html")
    path.write_text(s)
(out/"release-survey.html").write_text('<!doctype html><html lang="ko"><head><meta charset="utf-8"><script src="/js/release-runtime.js"></script></head><body>테스트 웹에서는 실제 설문을 제출할 수 없습니다.<script>if(beaguProduction)location.replace('+json.dumps(form)+')</script></body></html>')
