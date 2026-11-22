#!/usr/bin/env python3
"""Create an isolated Vercel-free staging site from the *checked out commit*.

No network calls, secrets, database mutations, deployment commands, or live
Pages modifications. This builder refuses a malformed source or incomplete
Supabase staging rewrite. It publishes only public site files.
"""
from __future__ import annotations
import io
import json
import pathlib
import re
import shutil
import subprocess
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_standalone_staging"
LIVE_REF = "snvzwrexuqavnfvzgxqj"
STAGE_REF = "ycwuugggqbunlbwuzvbx"
LIVE_KEY = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2"
STAGE_KEY = "sb_publishable_c8h7TaIYONfP56Zc05K0Sw_SxyT3lZU"
TEXT_EXT = {".html", ".js", ".mjs", ".css", ".json", ".csv", ".txt", ".svg"}
ASSET_EXT = TEXT_EXT | {".webp", ".jpg", ".jpeg", ".png", ".gif", ".ico", ".woff2", ".woff"}
STATIC_PREFIXES = ("js/", "styles/", "assets/", "data/", "r/")
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
BANNER = (
    '<div id="beagu-staging-watermark" role="note" '
    'style="position:fixed;bottom:8px;right:8px;z-index:2147483640;'
    'background:#172e57;color:white;padding:10px 14px;border-radius:10px;'
    'font:700 13px system-ui">독립 시험 웹 · 운영 DB 연결 차단'
    '<small id="beagu-staging-navigation-warning" '
    'style="display:block;font:12px system-ui"></small></div>'
)


def selected(path: str) -> bool:
    p = pathlib.PurePosixPath(path)
    if p.is_absolute() or ".." in p.parts or p.name.startswith("."):
        return False
    if len(p.parts) == 1:
        return p.suffix == ".html"
    if path.startswith(STATIC_PREFIXES):
        return p.suffix.lower() in ASSET_EXT and not p.name.startswith(".")
    return False


def build() -> dict:
    sha = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()
    if not SHA_PATTERN.fullmatch(sha):
        raise RuntimeError("No immutable Git SHA")
    entries = subprocess.check_output(
        ["git", "ls-tree", "-r", "--name-only", sha], cwd=ROOT, text=True
    ).splitlines()
    public = [p for p in entries if selected(p)]
    if not {"index.html", "js/supabase-config.js"}.issubset(public):
        raise RuntimeError("Required public site assets are missing")
    # Path-based archive avoids all scripts, migrations, .github, and secrets.
    archive = subprocess.check_output(
        ["git", "archive", "--format=tar", sha, "--", *public], cwd=ROOT
    )
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as tar:
        for item in tar:
            if item.isdir():
                continue
            if not item.isfile() or not selected(item.name):
                raise RuntimeError("Unsafe site archive entry: " + item.name)
            target = OUTPUT / item.name
            target.parent.mkdir(parents=True, exist_ok=True)
            stream = tar.extractfile(item)
            if stream is None:
                raise RuntimeError("Archive read failed")
            target.write_bytes(stream.read())

    html_files = 0
    modified = 0
    for file in OUTPUT.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in TEXT_EXT:
            continue
        content = file.read_text(encoding="utf-8")
        replaced = content.replace(LIVE_REF, STAGE_REF).replace(LIVE_KEY, STAGE_KEY)
        if file.suffix.lower() == ".html":
            if not re.search(r"<body\b", replaced, re.IGNORECASE):
                raise RuntimeError("HTML missing body: " + str(file))
            replaced, heads = re.subn(
                r"<head\b[^>]*>",
                lambda match: match.group(0) +
                    '\n<meta name="robots" content="noindex,nofollow,noarchive">'
                    '\n<script src="/beagu-staging-navigation-guard.js"></script>',
                replaced, count=1, flags=re.IGNORECASE
            )
            if heads != 1:
                raise RuntimeError("HTML missing head: " + str(file))
            replaced = re.sub(
                r"<body\b[^>]*>", lambda match: match.group(0) + BANNER,
                replaced, count=1, flags=re.IGNORECASE
            )
            html_files += 1
        if LIVE_REF in replaced or LIVE_KEY in replaced:
            raise RuntimeError("Production Supabase escaped rewrite: " + str(file))
        if replaced != content:
            modified += 1
            file.write_text(replaced, encoding="utf-8")
    if not (OUTPUT / "js/supabase-config.js").read_text().count(STAGE_REF):
        raise RuntimeError("Staging client config not applied")
    if not html_files or not modified:
        raise RuntimeError("Staging isolation produced no modified pages")
    # The guard is loaded from the same immutable SHA as every page.
    # It is not copied from an untracked or concurrently edited working file.
    guard = subprocess.check_output(
        ["git", "show", sha + ":scripts/staging-runtime-guard.js"], cwd=ROOT
    ).decode("utf-8")
    if ("STAGE_SUPABASE" not in guard or "sendBeacon" not in guard):
        raise RuntimeError("Staging runtime isolation guard is incomplete")
    (OUTPUT / "beagu-staging-navigation-guard.js").write_text(guard, encoding="utf-8")
    (OUTPUT / "beagu-preview-health.json").write_text(
        json.dumps({
            "schema": 1, "kind": "standalone-staging", "staging_sha": sha,
            "supabase_ref": STAGE_REF, "hosting": "independent-static"
        }, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8"
    )
    (OUTPUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    if (OUTPUT / "CNAME").exists():
        raise RuntimeError("Production CNAME leaked into staging")
    summary = {"sha": sha, "html_pages": html_files,
               "rewritten_files": modified, "published_files": len(public) + 3}
    print("STANDALONE STAGING READY: " + json.dumps(summary, sort_keys=True))
    return summary


if __name__ == "__main__":
    build()
