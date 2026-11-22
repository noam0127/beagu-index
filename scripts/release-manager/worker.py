#!/usr/bin/env python3
"""Trusted GitHub Actions Pages publisher. No GitHub PAT or secrets needed.

A signed GitHub Actions OIDC identity authorizes claims/acks to the
MFA-protected Supabase release queue. Every artifact uses immutable SHAs.
"""
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
API = "https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-release-manager-v1"
PUBLIC_KEY = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2"
PLAN = ROOT / ".release-job.json"
OUTPUT = ROOT / "_release_site"
# Standalone staging artifact for a separately approved, independent host.
# Building this directory does NOT publish it anywhere.
INDEPENDENT_OUTPUT = ROOT / "_preview_standalone_site"
SHA = re.compile(r"^[0-9a-f]{40}$")
AUDIENCE = "beagu-release-worker"


def token():
    endpoint = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    credential = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not endpoint or not credential:
        raise RuntimeError("This command must run in GitHub Actions with id-token: write")
    separator = "&" if "?" in endpoint else "?"
    url = endpoint + separator + "audience=" + AUDIENCE
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + credential})
    with urllib.request.urlopen(req, timeout=15) as response:
        value = json.load(response)["value"]
    if not value:
        raise RuntimeError("OIDC token is missing")
    return value


def api(action, **fields):
    body = json.dumps({"action": action, **fields}).encode()
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Authorization": "Bearer " + token(),
        "Content-Type": "application/json",
        "apikey": PUBLIC_KEY,
        "User-Agent": "beaguindex-release-controller-v1",
    })
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)


def output(name, value):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf8") as file:
            file.write(name + "=" + str(value) + "\n")
    print(name + ": " + str(value))


def read_plan():
    if not PLAN.is_file():
        raise RuntimeError("Release job was not claimed")
    plan = json.loads(PLAN.read_text(encoding="utf8"))
    if not plan.get("has_job"):
        raise RuntimeError("No active release job")
    return plan


def archive(sha, destination):
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError("Not an immutable Git commit SHA")
    destination.mkdir(parents=True, exist_ok=True)
    # Git archive only includes tracked files from the vetted repository SHA.
    subprocess.run(["bash", "-eo", "pipefail", "-c",
                    "git archive --format=tar " + sha + " | tar -xf - -C " + str(destination)],
                   cwd=ROOT, check=True)
    if not (destination / "index.html").is_file():
        raise RuntimeError("Website build is missing index.html")


def overlay_approved_directory(target):
    # Only this previously approved public JSON artifact may bypass code-release approval.
    # Never overlay JS, HTML, workflows, or SQL from an unapproved main commit.
    subprocess.run(["bash", "-eo", "pipefail", "-c",
      "git archive --format=tar HEAD data/public-compare-school-directory-v1.json | "
      "tar -xf - -C " + str(target)], cwd=ROOT, check=True)


def make_preview_banner(target, independent=False):
    # Existing path-based preview stays unchanged. A standalone host must use
    # root-relative navigation, not /_preview/-prefixed navigation.
    banner = (
        '<div id="beagu-preview-watermark" role="note" '
        'style="position:fixed;bottom:10px;right:10px;z-index:2147483600;'
        'background:#152943;color:#fff;border-radius:12px;'
        'padding:9px 14px;font:700 13px system-ui;box-shadow:0 4px 22px #15294355">'
        + ('독립 시험 후보 · 실제 계정 사용은 별도 관리자 승인 후</div>'
           if independent else '시험 웹 · 운영 웹과 브라우저 저장공간 공유 · 실제 계정 사용 금지</div>')
    )
    for file in target.rglob("*.html"):
        source = file.read_text(encoding="utf-8", errors="replace")
        source = re.sub(r"(?i)<body(\s[^>]*)?>",
                        lambda match: match.group(0) + banner,
                        source, count=1)
        # Browser-side defense in depth.  URL/key rewrites are not sufficient:
        # preview pages share a browser origin with production.  Restrict
        # API connections to the independent staging Supabase backend and
        # prohibit external form submissions while testing.
        csp = (
            "connect-src 'self' https://ycwuugggqbunlbwuzvbx.supabase.co "
            "wss://ycwuugggqbunlbwuzvbx.supabase.co; form-action 'self'"
        )
        meta = (
            '<meta http-equiv="Content-Security-Policy" content="' + csp + '">'
            '<meta name="robots" content="noindex,nofollow">'
        )
        source, count = re.subn(
            r"(?i)<head(?:\s[^>]*)?>",
            lambda match: match.group(0) + meta,
            source, count=1
        )
        if count != 1:
            raise RuntimeError("Preview HTML is missing <head>; cannot enforce CSP")
        # Only path-based previews need a /_preview/ prefix. A standalone
        # site must keep / links rooted at its own independent hostname.
        if not independent:
            source = re.sub(r'(?i)(href|src)=(["\\\'])/(?!/|_preview/)',
                            lambda match: match.group(1) + "=" + match.group(2) + "/_preview/",
                            source)
        file.write_text(source, encoding="utf-8")


def isolate_preview_backend(preview_dir):
    """Fail closed: preview must never write to the live Supabase project.

    Modify only the packaging output; the immutable source and production
    snapshot remain untouched. Replace hard-coded production URLs in page
    scripts and HTML as well as the public publishable key in the shared
    Supabase configuration. Test schemas/functions must be provisioned
    separately before enabling member E2E.
    """
    live_ref = "snvzwrexuqavnfvzgxqj"
    stage_ref = "ycwuugggqbunlbwuzvbx"
    live_key = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2"
    stage_key = "sb_publishable_c8h7TaIYONfP56Zc05K0Sw_SxyT3lZU"
    config = preview_dir / "js" / "supabase-config.js"
    if not config.is_file():
        raise RuntimeError("Preview Supabase config is missing")
    if live_ref not in config.read_text(encoding="utf-8"):
        raise RuntimeError("Unexpected live Supabase configuration; review manually")
    changed = 0
    for file in preview_dir.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in (".js", ".html", ".mjs", ".json", ".css", ".webmanifest", ".xml", ".svg"):
            continue
        body = file.read_text(encoding="utf-8")
        modified = body.replace(live_ref, stage_ref).replace(live_key, stage_key)
        if modified != body:
            file.write_text(modified, encoding="utf-8")
            changed += 1
    if stage_ref not in config.read_text(encoding="utf-8") or changed < 1:
        raise RuntimeError("Staging Supabase URL rewrite did not complete")
    for file in preview_dir.rglob("*"):
        if file.is_file() and file.suffix.lower() in (
            ".js", ".html", ".mjs", ".json", ".css", ".webmanifest", ".xml", ".svg"
        ):
            text = file.read_text(encoding="utf-8")
            if live_ref in text or live_key in text:
                raise RuntimeError("Production Supabase configuration leaked into preview: " + str(file))
    print("Preview isolated to staging Supabase; rewritten files:", changed)


def build():
    plan = read_plan()
    production = plan.get("production_sha")
    staging = plan.get("staging_sha")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    archive(production, OUTPUT)
    overlay_approved_directory(OUTPUT)
    if staging:
        preview_dir = OUTPUT / "_preview"
        archive(staging, preview_dir)
        overlay_approved_directory(preview_dir)
        nested_cname = preview_dir / "CNAME"
        if nested_cname.exists():
            nested_cname.unlink()
        make_preview_banner(preview_dir)
        isolate_preview_backend(preview_dir)
        (preview_dir / ".nojekyll").touch()
    if (OUTPUT / "CNAME").read_text(encoding="utf8").strip() != "baeguindex.com":
        raise RuntimeError("Production domain mismatch")
    (OUTPUT / ".nojekyll").touch()
    print("Build ready:", str(OUTPUT), "prod", production[:8],
          "staging", staging[:8] if staging else "none")



def minimize_independent_preview(target):
    """Ship only public web assets and keep known navigation on the QA host.

    This applies ONLY to the standalone candidate build; it does not touch
    the immutable RC tree, GitHub Pages preview, or production release.
    """
    for relative in (".github", "tests", "docs", "supabase",
                     "scripts/release-manager"):
        unwanted = target / relative
        if unwanted.is_dir():
            shutil.rmtree(unwanted)

    # Deliberately narrow rewrites: preserve canonical SEO URLs and the
    # explicit "actual website" admin link, but never silently redirect
    # a QA visitor to production from ordinary home navigation.
    replacements = {
        "admin-updates.html": [
            ('href="https://baeguindex.com/_preview/"', 'href="/"')
        ],
        "challenge.html": [
            ('class="site-link" href="https://baeguindex.com/"',
             'class="site-link" href="/"')
        ],
        "js/class-diary-interface-rebalance-v1.js": [
            ("home.href='https://baeguindex.com/';", "home.href='/';")
        ],
        "teacher-class-diary-play.html": [
            ("window.location.assign('https://baeguindex.com/');",
             "window.location.assign('/');")
        ]
    }
    for name, rules in replacements.items():
        file = target / name
        if not file.is_file():
            raise RuntimeError("Expected staging navigation asset missing: " + name)
        old = file.read_text(encoding="utf-8")
        new = old
        for original, replacement in rules:
            if original not in new:
                raise RuntimeError("Staging navigation link changed; manual review required: " + name)
            new = new.replace(original, replacement)
        if new != old:
            file.write_text(new, encoding="utf-8")


def package_independent_preview():
    """Package ONLY the signed job's approved staging SHA for a separate host.

    This is an offline artifact builder. It does not call GitHub Pages,
    modify the public site, enqueue a release, or deploy to a host.
    Deployment requires a separately approved origin and hosting workflow.
    """
    plan = read_plan()
    staging = plan.get("staging_sha")
    if not isinstance(staging, str) or not SHA.fullmatch(staging):
        raise RuntimeError("Approved immutable staging SHA required")
    if INDEPENDENT_OUTPUT.exists():
        shutil.rmtree(INDEPENDENT_OUTPUT)
    archive(staging, INDEPENDENT_OUTPUT)
    overlay_approved_directory(INDEPENDENT_OUTPUT)
    # Never ship the live site's custom domain or Pages deployment markers.
    live_cname = INDEPENDENT_OUTPUT / "CNAME"
    if live_cname.exists():
        live_cname.unlink()
    make_preview_banner(INDEPENDENT_OUTPUT, independent=True)
    isolate_preview_backend(INDEPENDENT_OUTPUT)
    minimize_independent_preview(INDEPENDENT_OUTPUT)
    (INDEPENDENT_OUTPUT / ".nojekyll").touch()
    if (INDEPENDENT_OUTPUT / "CNAME").exists():
        raise RuntimeError("Production custom domain leaked into standalone preview")
    print("Standalone preview artifact ready (NOT deployed):", INDEPENDENT_OUTPUT,
          staging[:8])


def main():
    op = sys.argv[1] if len(sys.argv) > 1 else ""
    if op == "next":
        sha = os.environ["GITHUB_SHA"]
        if not SHA.fullmatch(sha):
            raise ValueError("Untrusted GitHub SHA")
        data_blob = subprocess.check_output([
            "git", "rev-parse", "HEAD:data/public-compare-school-directory-v1.json"],
            cwd=ROOT, text=True).strip()
        if not SHA.fullmatch(data_blob):
            raise RuntimeError("Approved public directory is missing")
        plan = api("worker_next", head_sha=sha, data_blob_sha=data_blob)
        PLAN.write_text(json.dumps(plan), encoding="utf8")
        output("has_job", "true" if plan.get("has_job") else "false")
        if plan.get("has_job"):
            print("Claimed", plan.get("action"), plan.get("job_id"))
    elif op == "build":
        build()
    elif op in ("complete", "fail"):
        plan = read_plan()
        if op == "complete":
            result = api("worker_complete", job_id=plan["job_id"])
        else:
            result = api("worker_fail", job_id=plan["job_id"])
        print("Release worker", op, json.dumps(result, ensure_ascii=False))
    else:
        raise SystemExit("usage: worker.py next|build|complete|fail")


if __name__ == "__main__":
    main()
