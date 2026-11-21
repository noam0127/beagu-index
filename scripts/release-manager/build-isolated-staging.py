#!/usr/bin/env python3
"""Standalone staging site builder. NO production files, Pages deploy, or DB writes.

Takes one immutable Git commit SHA and a DIFFERENT HTTPS origin.
The output folder is meant for a future independent static host, never
the production baeguindex.com/_preview path.
"""
import argparse
import io
import json
import pathlib
import re
import shutil
import subprocess
import tarfile
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[2]
SHA = re.compile(r"^[0-9a-f]{40}$")
LIVE_REF = "snvzwrexuqavnfvzgxqj"
STAGE_REF = "ycwuugggqbunlbwuzvbx"
LIVE_KEY = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2"
STAGE_KEY = "sb_publishable_c8h7TaIYONfP56Zc05K0Sw_SxyT3lZU"
TEXT_EXT = {".html", ".htm", ".js", ".mjs", ".css", ".json", ".svg"}
WEB_EXT = TEXT_EXT | {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico",
    ".avif", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".mp4",
    ".webm", ".webmanifest", ".txt", ".pdf", ".wasm",
}
BLOCKED_SEGMENTS = {
    ".git", ".github", "supabase", "scripts", "tests", "docs",
    "node_modules", "_release_site", "_preview", ".vercel",
}
BLOCKED_ROOT = {"CNAME", "release-candidate.json", "package.json", "package-lock.json"}
CSP = (
    "connect-src 'self' https://" + STAGE_REF + ".supabase.co; "
    "form-action 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'"
)

def validate_origin(value):
    """Reject the shared production origin and non-HTTPS/file/test subpaths."""
    parsed = urllib.parse.urlsplit(str(value or ""))
    host = (parsed.hostname or "").lower()
    if (parsed.scheme != "https" or not host or not parsed.netloc or
        parsed.username or parsed.password or parsed.port not in (None, 443) or
        parsed.query or parsed.fragment or parsed.path not in ("", "/") or
        host in ("baeguindex.com", "www.baeguindex.com") or
        host.endswith(".supabase.co") or
        host in ("localhost", "127.0.0.1") or
        host.replace(".", "").isdigit()):
        raise ValueError("Staging requires an independent HTTPS web origin")
    return "https://" + host + (":" + str(parsed.port) if parsed.port and parsed.port != 443 else "")

def allow_asset(name):
    path = pathlib.PurePosixPath(name)
    parts = path.parts
    if (not parts or name.startswith("/") or "\\" in name or ".." in parts or
        any(x in BLOCKED_SEGMENTS or x.startswith(".") for x in parts[:-1])):
        return False
    if parts[0] in BLOCKED_SEGMENTS or len(parts) == 1 and name in BLOCKED_ROOT:
        return False
    if any(x.startswith(".") for x in parts):
        return False
    return path.suffix.lower() in WEB_EXT

def archive_website(sha, dest):
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError("A pinned full Git SHA is mandatory")
    p = subprocess.run(["git", "archive", "--format=tar", sha],
                       cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       check=True, timeout=80)
    count = 0
    with tarfile.open(fileobj=io.BytesIO(p.stdout), mode="r:") as bundle:
        for member in bundle:
            # Explicitly reject symlinks and hard links, including links whose
            # paths appear allowed but point outside the destination folder.
            if not member.isfile() or not allow_asset(member.name):
                continue
            target = dest.joinpath(*pathlib.PurePosixPath(member.name).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            stream = bundle.extractfile(member)
            if stream is None:
                raise ValueError("Cannot read selected site asset")
            with target.open("wb") as out:
                shutil.copyfileobj(stream, out)
            count += 1
    if not (dest / "index.html").is_file() or not (dest / "js/supabase-config.js").is_file():
        raise RuntimeError("Standalone staging archive lacks required site files")
    return count

def rewrite_site(dest, staging_origin):
    """Rewrite all client code to the staging project, remove production links.

    External integrations are intentionally NOT whitelisted for network writes.
    CSP blocks cross-origin fetch/beacon/form submissions until sandbox APIs
    have been reviewed. This means some staging features deliberately won't work.
    """
    host = urllib.parse.urlsplit(staging_origin).hostname
    count = 0
    for file in dest.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in TEXT_EXT:
            continue
        body = file.read_text(encoding="utf8")
        changed = (body
            .replace(LIVE_REF, STAGE_REF)
            .replace(LIVE_KEY, STAGE_KEY)
            .replace("https://www.baeguindex.com", staging_origin)
            .replace("https://baeguindex.com", staging_origin)
            .replace("www.baeguindex.com", host)
            .replace("baeguindex.com", host)
            .replace("/_preview/", "/"))
        if file.suffix.lower() in (".html", ".htm"):
            if not re.search(r"<head(?:\s|>)", changed, re.I):
                raise RuntimeError("Missing HTML head: " + file.name)
            if not re.search(r"<body(?:\s|>)", changed, re.I):
                raise RuntimeError("Missing HTML body: " + file.name)
            marker = ('<meta name="robots" content="noindex,nofollow,noarchive">'
                      '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">')
            changed = re.sub(r"(?i)<head(\s[^>]*)?>",
                             lambda m: m.group(0) + marker, changed, count=1)
            changed = re.sub(r"(?i)<body(\s[^>]*)?>",
                             lambda m: m.group(0) +
                             '<div id="beagu-isolated-staging" role="note" '
                             'style="position:fixed;bottom:8px;right:8px;'
                             'background:#173f5f;color:white;z-index:2147483600;'
                             'padding:8px;border-radius:7px">독립 시험용 · '
                             '실제 데이터 입력 금지</div>',
                             changed, count=1)
        if changed != body:
            file.write_text(changed, encoding="utf8")
            count += 1
    config = (dest / "js/supabase-config.js").read_text(encoding="utf8")
    if STAGE_REF not in config or STAGE_KEY not in config:
        raise RuntimeError("Staging Supabase configuration was not rewritten")
    for file in dest.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in TEXT_EXT:
            continue
        data = file.read_text(encoding="utf8")
        if LIVE_REF in data or LIVE_KEY in data or "baeguindex.com" in data or "/_preview/" in data:
            raise RuntimeError("Production reference leaked into staging artifact: " +
                               file.relative_to(dest).as_posix())
    return count

def build(sha, destination, origin):
    origin = validate_origin(origin)
    dest = pathlib.Path(destination).resolve()
    repo = ROOT.resolve()
    if dest == repo or repo in dest.parents or dest in repo.parents:
        raise ValueError("Staging output must be outside the source repository")
    # Must not remove an existing directory, including a prior test artifact.
    if dest.exists():
        raise FileExistsError("Staging target already exists")
    dest.mkdir(parents=True)
    try:
        count = archive_website(sha, dest)
        rewritten = rewrite_site(dest, origin)
        (dest / ".nojekyll").touch()
        (dest / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf8")
        if (dest / "CNAME").exists() or (dest / "_preview").exists():
            raise RuntimeError("Shared Pages production paths are prohibited")
        summary = {
            "status": "artifact_only_not_deployed",
            "candidate_commit_sha": sha,
            "intended_origin": origin,
            "staging_supabase_ref": STAGE_REF,
            "source_files": count,
            "rewritten_files": rewritten,
            "staging_db_ready": False,
            "runtime_auth_e2e_verified": False,
            "deployment_authorized": False
        }
        # Manifest is explicitly advisory; must not become a release credential.
        (dest / "staging-build-status.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
        )
        return summary
    except BaseException:
        shutil.rmtree(dest, ignore_errors=True)
        raise

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sha", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--origin", required=True)
    args = p.parse_args()
    print(json.dumps(build(args.sha, args.output, args.origin),
                     ensure_ascii=False, indent=2))
