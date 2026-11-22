#!/usr/bin/env python3
"""Build a credential-disabled, untrusted-third-party STATIC mirror of pinned RC.

It is intentionally NOT the authenticated staging site. The mirror exists to
smoke-test remote HTML/CSS/JS delivery when GitHub Pages is bound to production
and a separate trusted staging hostname has not been configured.
Never use this mirror for password/MFA flows or private teacher data.
"""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = ROOT / "_preview_standalone_site"
RC_SHA = "5c95aadad971901a8222f83c52e93bf901a3aeb7"
PROD = "snvzwrexuqavnfvzgxqj"
STAGE = "ycwuugggqbunlbwuzvbx"
BRANCH = "stage38-static-review-rc-5c95aad"
STATIC_ORIGIN = "https://raw.githack.com/noam0127/beagu-index/" + BRANCH
ROUTES = ["index.html", "admin.html", "admin-updates.html", "result.html", "js/challenge.html"]
FAIL_WORDS = [
    "https://baeguindex.com", "https://www.baeguindex.com",
    PROD, "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2"
]
NOTICE = (
    '<div id="stage38-public-static-warning" role="alert" '
    'style="z-index:2147483646;position:fixed;top:0;left:0;right:0;'
    'text-align:center;padding:10px;background:#7f1d1d;color:white;'
    'font:700 13px system-ui">'
    '외부 정적 화면 미리보기 · 로그인/개인정보 입력 금지 · 인증과 API 통신 차단'
    '</div>'
)
# On this external mirror, deliberately intersect the package's staging CSP
# with a much stricter policy that forbids network APIs and form submissions.
CSP = (
    '<meta http-equiv="Content-Security-Policy" '
    'content="connect-src \'none\'; form-action \'none\'">'
    '<meta name="robots" content="noindex,nofollow,noarchive">'
)
GUARD = (
    '<script id="stage38-cdn-static-guard">'
    'document.addEventListener("submit",e=>{'
    'e.preventDefault();e.stopImmediatePropagation();},true);'
    'document.addEventListener("DOMContentLoaded",()=>{'
    'document.querySelectorAll("input[type=password],'
    'input[type=email]").forEach(x=>{x.disabled=true;x.value="";});'
    '}, {once:true});'
    '</script>'
)

def write_mirror():
    original = json.loads((SITE / "stage38-release-manifest.json").read_text(encoding="utf8"))
    if original.get("source_sha") != RC_SHA or original.get("supabase_project_ref") != STAGE:
        raise RuntimeError("Immutable RC manifest mismatch")
    if original.get("deployment_status") != "unverified":
        raise RuntimeError("Source manifest claimed an unapproved hosted deployment")
    if (SITE / "CNAME").exists():
        raise RuntimeError("Production Pages CNAME is forbidden")
    for p in SITE.rglob("*"):
        if p.is_symlink():
            raise RuntimeError("No symlinks in public preview")
        if not p.is_file():
            continue
        if p.suffix.lower() in {".js", ".html", ".css", ".json", ".xml"}:
            data = p.read_text(encoding="utf8")
            if any(term in data for term in FAIL_WORDS):
                raise RuntimeError("Production configuration leaked: " + str(p.relative_to(SITE)))
    changes = {}
    for p in SITE.rglob("*.html"):
        before = p.read_text(encoding="utf8")
        if "<head" not in before.lower() or "<body" not in before.lower():
            raise RuntimeError("Cannot enforce mirror credential block: " + str(p))
        # URL base of the third-party mirror includes owner/repo/branch segments.
        # Rewrite HTML root links to be relative to the repo tree instead.
        # This only affects mirror HTML, not the immutable RC or production.
        base = "../" if p.parent != SITE else "./"
        after = re.sub(r'(?i)(href|src|action)=(["\\\'])/(?!/)',
                       lambda m: m.group(1) + "=" + m.group(2) + base,
                       before)
        after = re.sub(r"(?i)<head(?:\s[^>]*)?>",
                       lambda m: m.group(0) + CSP + GUARD,
                       after, count=1)
        after = re.sub(r"(?i)<body(?:\s[^>]*)?>",
                       lambda m: m.group(0) + NOTICE,
                       after, count=1)
        if after == before or "stage38-public-static-warning" not in after:
            raise RuntimeError("Credential overlay injection failed: " + str(p))
        p.write_text(after, encoding="utf8")
        changes[p.relative_to(SITE).as_posix()] = hashlib.sha256(after.encode()).hexdigest()

    (SITE / "stage38-static-mirror.json").write_text(
        json.dumps({
            "kind": "third-party-cdn-static-smoke-only",
            "source_sha": RC_SHA, "staging_ref": STAGE,
            "login_enabled": False, "api_calls_enabled": False,
            "supabase_auth_mfa_browser_e2e_passed": False,
            "production_release_approved": False,
            "mirror_origin": STATIC_ORIGIN,
            "html_changes_sha256": changes,
        }, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf8"
    )
    for route in ROUTES:
        body = (SITE / route).read_text(encoding="utf8")
        if ("stage38-cdn-static-guard" not in body or
            "stage38-public-static-warning" not in body or
            "connect-src 'none'" not in body):
            raise RuntimeError("Visible preview page not fully credential-disabled: " + route)
    print("PASS: " + str(len(changes)) +
          " HTML pages sanitized for third-party static-only hosting")
    print("PUBLIC STATIC MIRROR BRANCH: " + BRANCH)
    print("LOGIN/FORMS/REMOTE APIS: DISABLED")

if __name__ == "__main__":
    write_mirror()
