#!/usr/bin/env python3
"""Create a LOCAL-ONLY, SHA-pinned, minimized, staging-isolated QA snapshot.

Never calls Supabase APIs, GitHub releases or Pages deployers. No site data is
uploaded. The output is an unhosted directory for runner-side inspection.
"""
import argparse
import importlib.util
import json
import pathlib
import re
import shutil
import subprocess
import tarfile
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER_PATH = ROOT / "scripts/release-manager/worker.py"
SPEC = importlib.util.spec_from_file_location("beagu_isolated_candidate_worker", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)

SHA = re.compile(r"^[0-9a-f]{40}$")
SITE_DIRS = frozenset(("assets", "data", "js", "styles", "r", "\u200bcss"))
SITE_EXTENSIONS = frozenset((
    ".html", ".css", ".js", ".mjs", ".json", ".csv",
    ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
    ".woff", ".woff2", ".ttf", ".webmanifest",
))
ALLOWED_ROOT_FILES = frozenset(("lv2-edited-column-schema.json",))
STAGE_ORIGIN = "https://ycwuugggqbunlbwuzvbx.supabase.co"
LIVE_ID = "snvzwrexuqavnfvzgxqj"
LIVE_KEY = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2"
CSP = (
    "connect-src 'self' " + STAGE_ORIGIN +
    "; form-action 'none'; base-uri 'self'; object-src 'none'"
)
HEAD_TAG = re.compile(r"<head(?:\s[^>]*)?>", re.IGNORECASE)
BODY_TAG = re.compile(r"<body(?:\s[^>]*)?>", re.IGNORECASE)


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def approved_path(raw):
    """Allow only public web sources; no repo internals or release controls."""
    if not isinstance(raw, str) or raw.startswith("/") or "\x00" in raw:
        return False
    p = pathlib.PurePosixPath(raw)
    if ".." in p.parts or "." in p.parts:
        return False
    if len(p.parts) == 1:
        return raw in ALLOWED_ROOT_FILES or p.suffix.lower() in (
            ".html", ".ico", ".svg", ".webmanifest"
        )
    if p.parts[0] not in SITE_DIRS:
        return False
    return p.suffix.lower() in SITE_EXTENSIONS


def selected_git_files(sha):
    """Read the exact tree; never use an uncommitted working-tree file."""
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError("Full immutable candidate SHA required")
    current = git("rev-parse", "HEAD").decode().strip()
    if current != sha:
        raise RuntimeError("Candidate SHA differs from the pinned checkout HEAD")
    rows = git("ls-tree", "-r", "-z", sha).split(b"\x00")
    approved = []
    for row in rows:
        if not row:
            continue
        info, raw_path = row.split(b"\t", 1)
        mode, kind, _ = info.split(b" ", 2)
        path = raw_path.decode("utf-8")
        if not approved_path(path):
            continue
        if kind != b"blob" or mode not in (b"100644", b"100755"):
            raise RuntimeError("Web snapshot contains a symlink or unusual file: " + path)
        approved.append(path)
    if not approved or len(approved) > 1000 or "index.html" not in approved:
        raise RuntimeError("Web file inventory is unexpectedly incomplete")
    if "js/supabase-config.js" not in approved:
        raise RuntimeError("Supabase config is missing from web file inventory")
    return sorted(set(approved))


def extract_selected_tree(sha, files, destination, tar_path):
    subprocess.run(
        ["git", "archive", "--format=tar", "-o", str(tar_path), sha, *files],
        cwd=ROOT, check=True, timeout=60
    )
    wanted = set(files)
    observed = set()
    with tarfile.open(tar_path, mode="r") as archive:
        for member in archive:
            if member.isdir():
                continue
            name = member.name
            if not member.isfile() or name not in wanted or name in observed:
                raise RuntimeError("Unexpected archive entry: " + name)
            stream = archive.extractfile(member)
            if stream is None:
                raise RuntimeError("Unreadable archive entry: " + name)
            dest = destination.joinpath(*pathlib.PurePosixPath(name).parts)
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open("wb") as file:
                shutil.copyfileobj(stream, file)
            observed.add(name)
    if observed != wanted:
        raise RuntimeError("Git archive omitted files: " +
                           ", ".join(sorted(wanted - observed)[:6]))


def annotate_qa_html(target):
    pages = sorted(target.rglob("*.html"))
    if not pages:
        raise RuntimeError("No candidate HTML pages")
    badge = (
        '<div id="beagu-isolated-qa" role="note" '
        'style="position:fixed;bottom:9px;right:9px;z-index:2147483640;'
        'background:#152943;color:#fff;padding:8px;border-radius:8px">'
        '통합 후보 · 로컬 검증 전용 · 운영 웹 아님</div>'
    )
    head_meta = (
        '<meta name="robots" content="noindex,nofollow,noarchive">'
        '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">'
    )
    for path in pages:
        raw = path.read_text(encoding="utf8")
        if not HEAD_TAG.search(raw) or not BODY_TAG.search(raw):
            raise RuntimeError("HTML document cannot receive fail-closed QA controls: " +
                               path.relative_to(target).as_posix())
        raw = HEAD_TAG.sub(lambda m: m.group(0) + head_meta, raw, count=1)
        raw = BODY_TAG.sub(lambda m: m.group(0) + badge, raw, count=1)
        path.write_text(raw, encoding="utf8")
    return len(pages)


def build(sha, output):
    output = pathlib.Path(output).expanduser().absolute()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Output must be outside the checkout")
    if output.exists():
        raise FileExistsError("Candidate output already exists; refusing to overwrite")
    selected = selected_git_files(sha)
    with tempfile.TemporaryDirectory(prefix="beagu-preview-archive-") as temp:
        temp_path = pathlib.Path(temp)
        extract_selected_tree(sha, selected, temp_path / "snapshot",
                              temp_path / "candidate.tar")
        src = temp_path / "snapshot"
        worker.isolate_preview_backend(src)
        pages = annotate_qa_html(src)
        for path in src.rglob("*"):
            if path.is_file() and path.suffix.lower() in (".html", ".js", ".mjs"):
                body = path.read_text(encoding="utf8")
                if LIVE_ID in body or LIVE_KEY in body:
                    raise RuntimeError("Production Supabase reference leaked: " +
                                       path.relative_to(src).as_posix())
        (src / "robots.txt").write_text(
            "User-agent: *\nDisallow: /\n", encoding="utf8"
        )
        manifest = {
            "schema_version": 1,
            "candidate_sha": sha,
            "status": "local_qa_artifact_only",
            "publicly_hosted": False,
            "site_deployed": False,
            "release_version_created": False,
            "production_root_included": False,
            "production_supabase_allowed": False,
            "staging_supabase_origin": STAGE_ORIGIN,
            "content_security_policy": CSP,
            "file_count": len(selected),
            "html_pages": pages,
            "sandbox_db_auth_rls": "unverified",
            "candidate_browser_e2e": "not_performed",
            "final_release_gate": "blocked",
        }
        (src / ".qa-candidate-manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf8"
        )
        shutil.move(str(src), str(output))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sha", required=True, help="Exact checked-out HEAD SHA")
    parser.add_argument("--output", required=True, help="Nonexistent directory outside checkout")
    args = parser.parse_args()
    result = build(args.sha, args.output)
    print("LOCAL QA ONLY: " + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
