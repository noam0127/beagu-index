#!/usr/bin/env python3
"""Real file release A->B->rollback A on a STRICTLY isolated Git branch.

Publishes only credential-disabled static files. It never calls Supabase,
GitHub Pages, a production deployment workflow, or a release controller.

The sandbox URL is hosted by a third-party CDN and MUST NOT receive passwords.
"""
import base64
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / "_preview_standalone_site"
BRANCH = "stage38-lifecycle-sandbox-rc-5c95aad"
REPO = "noam0127/beagu-index"
RC = "5c95aadad971901a8222f83c52e93bf901a3aeb7"
STAGING = "ycwuugggqbunlbwuzvbx"
PROD = "snvzwrexuqavnfvzgxqj"
REMOTE = "https://github.com/" + REPO + ".git"
OUTPUT = pathlib.Path(os.environ.get("STAGE38_LIFECYCLE_PROOF", "/tmp/stage38-lifecycle-proof.json"))


def shell(args, cwd=None, token=None):
    command = list(args)
    if token is not None:
        header = base64.b64encode(("x-access-token:" + token).encode()).decode()
        command = [
            "git", "-c",
            "http.https://github.com/.extraheader=AUTHORIZATION: basic " + header,
            *command[1:],
        ]
    result = subprocess.run(command, cwd=cwd, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        # Never echo the full command, hidden GitHub token, or HTTP auth headers.
        raise RuntimeError("Git operation failed: " + args[1] + " (status " +
                           str(result.returncode) + ")")
    return result.stdout.strip()


def guard_source():
    manifest_path = SOURCE / "stage38-static-mirror.json"
    if not manifest_path.is_file():
        raise RuntimeError("Static-only pinned RC distribution missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    if (manifest.get("source_sha") != RC or
        manifest.get("staging_ref") != STAGING or
        manifest.get("login_enabled") is not False or
        manifest.get("api_calls_enabled") is not False or
        manifest.get("production_release_approved") is not False):
        raise RuntimeError("Unsafe static-only mirror manifest")
    if (SOURCE / "CNAME").exists():
        raise RuntimeError("Sandbox could impersonate production domain")
    for item in SOURCE.rglob("*"):
        if item.is_symlink():
            raise RuntimeError("Static sandbox may not contain symlinks")
        if item.is_file() and item.suffix.lower() in {
            ".js", ".html", ".json", ".css", ".xml", ".svg"
        }:
            text = item.read_text(encoding="utf-8")
            if (PROD in text or "https://baeguindex.com" in text or
                "https://www.baeguindex.com" in text):
                raise RuntimeError("Production reference in static sandbox: " +
                                   str(item.relative_to(SOURCE)))
    for route in ["index.html", "admin.html", "admin-updates.html", "result.html",
                  "js/challenge.html"]:
        content = (SOURCE / route).read_text(encoding="utf8")
        if ("stage38-cdn-static-guard" not in content or
            "connect-src 'none'" not in content):
            raise RuntimeError("Required static mirror privacy guard missing")


def evidence_html(version):
    assert version in ("A", "B")
    return (
        '<!doctype html><html lang="ko"><head>'
        '<meta charset="utf-8"><meta name="robots" content="noindex,nofollow">'
        '<meta http-equiv="Content-Security-Policy" '
        'content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; '
        'connect-src &#39;none&#39;; form-action &#39;none&#39;">'
        '<title>Stage38 isolated lifecycle ' + version + '</title>'
        '</head><body style="font:16px system-ui;padding:24px">'
        '<h1 id="stage38-lifecycle-version">SANDBOX-' + version + '</h1>'
        '<p>버전 ' + version + ' — 실제 Git 브랜치 파일 배포 및 복원 검증 전용</p>'
        '<p>로그인, 개인정보 입력, Supabase API 통신 불가</p>'
        '<a href="./index.html">고정 RC 정적 화면</a>'
        '</body></html>\n'
    )


def git_branch_ref():
    result = shell(["git", "ls-remote", "--heads", REMOTE,
                    "refs/heads/" + BRANCH])
    return result.split()[0] if result else None


def verify_history(folder, sha_a, sha_b, sha_c):
    assert re.fullmatch(r"[0-9a-f]{40}", sha_a)
    assert re.fullmatch(r"[0-9a-f]{40}", sha_b)
    assert re.fullmatch(r"[0-9a-f]{40}", sha_c)
    if len({sha_a, sha_b, sha_c}) != 3:
        raise RuntimeError("Expected three distinct release history commits")
    for sha, expected in ((sha_a, "A"), (sha_b, "B"), (sha_c, "A")):
        html = shell(["git", "show", sha + ":stage38-lifecycle-check.html"], cwd=folder)
        if ('id="stage38-lifecycle-version">SANDBOX-' + expected) not in html:
            raise RuntimeError("Incorrect test version at " + sha)
        if ("Content-Security-Policy" not in html or
            "connect-src &#39;none&#39;" not in html):
            raise RuntimeError("Missing sandbox privacy policy")
    difference = subprocess.run(["git", "diff", "--quiet", sha_a, sha_c],
                                cwd=folder)
    if difference.returncode != 0:
        raise RuntimeError("Rollback tree does not exactly match original deployment")
    if shell(["git", "rev-parse", "HEAD"], cwd=folder) != sha_c:
        raise RuntimeError("Final sandbox branch is not rolled back")
    if shell(["git", "cat-file", "-t", sha_a], cwd=folder) != "commit":
        raise RuntimeError("Initial sandbox deployment commit missing")


def publish():
    guard_source()
    with tempfile.TemporaryDirectory(prefix="stage38-real-file-rollback-") as temp:
        folder = pathlib.Path(temp) / "sandbox"
        existing = git_branch_ref()
        if existing:
            # Never overwrite a previous sandbox proof. Inspect its committed
            # A -> B -> A history instead, validating exact tree restoration.
            shell(["git", "clone", "--branch", BRANCH, "--single-branch", REMOTE, str(folder)])
            revisions = shell(["git", "rev-list", "--reverse", "HEAD"], cwd=folder).splitlines()
            if len(revisions) != 3 or revisions[-1] != existing:
                raise RuntimeError("Existing sandbox history was not the expected three-step run")
            sha_a, sha_b, sha_c = revisions
            verify_history(folder, sha_a, sha_b, sha_c)
            print("PASS: existing sandbox A->B->A verified without modifying branch")
        else:
            shutil.copytree(SOURCE, folder)
            shell(["git", "init", "--initial-branch=" + BRANCH], cwd=folder)
            shell(["git", "config", "user.name", "beagu-stage38-sandbox[bot]"], cwd=folder)
            shell(["git", "config", "user.email",
                   "no-reply-stage38@users.noreply.github.com"], cwd=folder)
            shell(["git", "remote", "add", "origin", REMOTE], cwd=folder)
            marker = folder / "stage38-lifecycle-check.html"
            # GitHub Actions-only access token is scoped to this repository.
            token = os.environ.get("GH_TOKEN", "")
            if len(token) < 15:
                raise RuntimeError("GitHub Actions token unavailable; no branch push")
            before_main = shell(["git", "ls-remote", "--heads", REMOTE, "refs/heads/main"])
            if not before_main:
                raise RuntimeError("Production main branch missing")
            commits = []
            for version, label in [
                ("A", "Initial isolated immutable RC file deployment"),
                ("B", "Isolated sandbox file update version B"),
                ("A", "Rollback isolated sandbox content to version A"),
            ]:
                marker.write_text(evidence_html(version), encoding="utf8")
                shell(["git", "add", "-A"], cwd=folder)
                shell(["git", "commit", "-m", "Stage38 sandbox: " + label], cwd=folder)
                sha = shell(["git", "rev-parse", "HEAD"], cwd=folder)
                commits.append(sha)
                shell(["git", "push", "--no-verify", "origin",
                       "HEAD:refs/heads/" + BRANCH], cwd=folder, token=token)
                remote = git_branch_ref()
                if remote != sha:
                    raise RuntimeError("Remote sandbox branch commit not verified")
                print("PASS: real isolated branch published " + version +
                      " with expected commit " + sha[:12])
            sha_a, sha_b, sha_c = commits
            verify_history(folder, sha_a, sha_b, sha_c)
            after_main = shell(["git", "ls-remote", "--heads", REMOTE, "refs/heads/main"])
            if before_main != after_main:
                raise RuntimeError("Production main changed while performing sandbox rollout")
            print("PASS: GitHub branch content A -> B -> A, file tree A=C exactly")
        proof = {
            "kind": "isolated-static-file-deploy-rollback",
            "branch": BRANCH, "repo": REPO, "source_rc": RC,
            "first_deploy_sha": sha_a, "update_sha": sha_b,
            "rollback_sha": sha_c,
            "rollback_tree_matches_initial": True,
            "production_site_touched": False,
            "production_pages_touched": False,
            "supabase_touched": False,
            "login_enabled": False,
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(proof, sort_keys=True) + "\n", encoding="utf8")
        print("PASS: rollback proof written, actual branch head verified")
        print("FIRST VERSION SHA " + sha_a)
        print("UPDATED VERSION SHA " + sha_b)
        print("RESTORED VERSION SHA " + sha_c)
        print("NO VERCEL, GITHUB PAGES OR PRODUCTION SITE DEPLOYED")


if __name__ == "__main__":
    publish()
