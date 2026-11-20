"""Build Output API fallback for the separately protected staging project."""
import json
import os
from pathlib import Path
import subprocess
if os.environ.get("VERCEL_ENV")!="preview":
    raise SystemExit("This adapter only builds preview deployments.")
out=Path(".vercel/output")
out.mkdir(parents=True,exist_ok=True)
subprocess.run(["python3","release/build.py",str(out/"static")],check=True)
policy="default-src 'self'; connect-src 'self' https://ycwuugggqbunlbwuzvbx.supabase.co wss://ycwuugggqbunlbwuzvbx.supabase.co; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob:; form-action 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
(out/"config.json").write_text(json.dumps({"version":3,"routes":[{"src":"/(.*)","headers":{"X-Robots-Tag":"noindex, nofollow, noarchive","Content-Security-Policy":policy,"Cache-Control":"private,no-store","Referrer-Policy":"no-referrer"},"continue":True},{"handle":"filesystem"}]}))
