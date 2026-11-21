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


def make_preview_banner(target):
    banner = (
        '<div id="beagu-preview-watermark" role="note" '
        'style="position:fixed;bottom:10px;right:10px;z-index:2147483600;'
        'background:#152943;color:#fff;border-radius:12px;'
        'padding:9px 14px;font:700 13px system-ui;box-shadow:0 4px 22px #15294355">'
        '시험 웹 · 독립 시험 데이터베이스 (실제 설문 참여 불가)</div>'
    )
    for file in target.rglob("*.html"):
        source = file.read_text(encoding="utf-8", errors="replace")
        source = re.sub(r"(?i)<body(\s[^>]*)?>",
                        lambda match: match.group(0) + banner,
                        source, count=1)
        source = source.replace("<head>", '<head><meta name="robots" content="noindex,nofollow">', 1)
        # Root-absolute navigation should stay in the selected candidate snapshot.
        source = re.sub(r'(?i)(href|src)=(["\\\'])/(?!/|_preview/)',
                        lambda match: match.group(1) + "=" + match.group(2) + "/_preview/",
                        source)
        file.write_text(source, encoding="utf-8")


# Preview is rendered under the production hostname, so CORS/origin alone
# cannot separate it from production. Enforce staging URLs and browser CSP
# inside the immutable preview artifact, not in the normal production snapshot.
PRODUCTION_PROJECT = "snvzwrexuqavnfvzgxqj"
STAGING_PROJECT = "ycwuugggqbunlbwuzvbx"
PRODUCTION_PUBLIC_KEY = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2"
STAGING_PUBLIC_KEY = "sb_publishable_c8h7TaIYONfP56Zc05K0Sw_SxyT3lZU"
STAGING_ORIGIN = f"https://{STAGING_PROJECT}.supabase.co"
PREVIEW_CSP = (
    "connect-src 'self' https://" + STAGING_PROJECT + ".supabase.co "
    "wss://" + STAGING_PROJECT + ".supabase.co; "
    "form-action 'none';"
)
PREVIEW_SUFFIXES = {".html", ".htm", ".js", ".mjs", ".css", ".json", ".svg", ".webmanifest"}
PREVIEW_EXCLUDED_DIRECTORIES = (".github", "docs", "supabase", "tests", "scripts")
PREVIEW_SURVEY_DISABLED = "/_preview/staging-survey-disabled.html"
PREVIEW_DISABLED_PAGE = """<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>시험 웹 · 실제 설문 연결 차단</title></head><body>
<main style="max-width:42rem;margin:12vh auto;padding:2rem;font-family:system-ui">
<h1>시험 웹에서는 실제 설문에 참여할 수 없습니다.</h1>
<p>시험 데이터와 실제 참여 자료를 분리하기 위해 외부 설문 링크를 차단했습니다.</p>
<a href="/_preview/">시험 웹으로 돌아가기</a></main></body></html>"""
PREVIEW_NAVIGATION_GUARD = r"""(()=>{'use strict';
document.addEventListener('click',event=>{
 const node=event.target&&event.target.closest?event.target.closest('a[href]'):null;
 if(!node)return;
 try {
  const url=new URL(node.href,location.href);
  // Prevent links from the preview silently escaping into the live site.
  if(url.origin===location.origin && !url.pathname.startsWith('/_preview/')){
   event.preventDefault();
   window.alert('시험 웹에서는 실제 사이트로 이동하지 않습니다.');
  }
 }catch(_){}
},true);
})();"""


def isolate_preview(target):
    """Fail closed: preview browser cannot write to live Supabase or real Forms.

    NOTE: This creates a safe UI shell, not a complete staging backend clone.
    In particular, missing staging functions must fail rather than fall back to live.
    """
    if target.name != "_preview" or not target.is_dir():
        raise RuntimeError("Refusing to isolate a non-preview directory")
    for dirname in PREVIEW_EXCLUDED_DIRECTORIES:
        d = target / dirname
        if d.is_dir():
            shutil.rmtree(d)
    for file in target.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in PREVIEW_SUFFIXES:
            continue
        source = file.read_text(encoding="utf-8")
        modified = source.replace(PRODUCTION_PROJECT, STAGING_PROJECT)
        modified = modified.replace(PRODUCTION_PUBLIC_KEY, STAGING_PUBLIC_KEY)
        # Shared-host storage would otherwise cross-contaminate live auth/cache.
        for k in ("beagu-level-session-v1", "beagu-referral-device-secret-v1",
                  "beagu-visitor-v1"):
            modified = modified.replace(k, "beagu-preview-" + k[len("beagu-"):])
        # Real Google Forms are never reachable from the staging snapshot.
        modified = re.sub(
            r"""https://(?:forms\.gle/|docs\.google\.com/forms/)[^\s"\'<>]*""",
            PREVIEW_SURVEY_DISABLED, modified, flags=re.IGNORECASE
        )
        if modified != source:
            file.write_text(modified, encoding="utf-8")
    # Create deliberately non-functional real-survey landing in preview only.
    (target / "staging-survey-disabled.html").write_text(
        PREVIEW_DISABLED_PAGE, encoding="utf-8"
    )
    javascript = target / "js" / "beagu-preview-navigation-guard.js"
    javascript.parent.mkdir(parents=True, exist_ok=True)
    javascript.write_text(PREVIEW_NAVIGATION_GUARD, encoding="utf-8")
    for file in target.rglob("*.html"):
        source = file.read_text(encoding="utf-8")
        content = (
            '<meta http-equiv="Content-Security-Policy" content="' + PREVIEW_CSP + '">'
            '<script defer src="/_preview/js/beagu-preview-navigation-guard.js"></script>'
        )
        patched, replacements = re.subn(
            r"<head(\s[^>]*)?>", lambda m: m.group(0) + content,
            source, count=1, flags=re.IGNORECASE
        )
        if replacements != 1:
            raise RuntimeError("Preview HTML missing <head>: " + str(file))
        file.write_text(patched, encoding="utf-8")
    verify_isolated_preview(target)


def verify_isolated_preview(target):
    if target.name != "_preview":
        raise RuntimeError("Must audit a preview, never the production root")
    html_count = 0
    for file in target.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in PREVIEW_SUFFIXES:
            continue
        source = file.read_text(encoding="utf-8")
        if PRODUCTION_PROJECT in source or PRODUCTION_PUBLIC_KEY in source:
            raise RuntimeError("Live Supabase reference in preview: " + str(file))
        if re.search(r"""https://(?:forms\.gle/|docs\.google\.com/forms/)""", source, re.I):
            raise RuntimeError("Real Google Form reference in preview: " + str(file))
        if file.suffix.lower() in {".html", ".htm"}:
            html_count += 1
            if 'http-equiv="Content-Security-Policy"' not in source or PREVIEW_CSP not in source:
                raise RuntimeError("Preview CSP missing: " + str(file))
    if html_count == 0:
        raise RuntimeError("Preview missing HTML")
    config = (target / "js" / "supabase-config.js").read_text(encoding="utf-8")
    if STAGING_ORIGIN not in config or STAGING_PUBLIC_KEY not in config:
        raise RuntimeError("Preview not connected to separate staging Supabase")
    print("PASS: preview isolated on staging project; no live Supabase/Form endpoints")


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
        isolate_preview(preview_dir)
        (preview_dir / ".nojekyll").touch()
    if (OUTPUT / "CNAME").read_text(encoding="utf8").strip() != "baeguindex.com":
        raise RuntimeError("Production domain mismatch")
    (OUTPUT / ".nojekyll").touch()
    print("Build ready:", str(OUTPUT), "prod", production[:8],
          "staging", staging[:8] if staging else "none")


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
