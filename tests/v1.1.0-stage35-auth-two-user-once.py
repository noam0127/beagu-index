#!/usr/bin/env python3
"""Stage35 one-time real Supabase Auth signup/login probe, isolated staging only.

Uses ONLY a public staging publishable key. Each account has a freshly
generated high-entropy password and reserved example.com email; never log either.
No service-role key, no production records, no Post-it mutations.
Clean up all stage35-auth-qa-* synthetic users after the CI run.
"""
import json
import pathlib
import re
import secrets
import sys
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROJECT = "ycwuugggqbunlbwuzvbx"
BASE = "https://" + PROJECT + ".supabase.co"
assert "snvzwrexuqavnfvzgxqj" not in BASE
SOURCE = (ROOT / "scripts/release-manager/worker.py").read_text(encoding="utf-8")
MATCH = re.findall(r'stage_key\s*=\s*"(sb_publishable_[A-Za-z0-9_-]+)"', SOURCE)
if len(MATCH) != 1:
    sys.exit("STAGE35_BLOCKED: unique staging publishable key not found")
KEY = MATCH[0]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "REDIRECT_BLOCKED", headers, fp)

def request(path, body, bearer=None):
    url = BASE + path
    assert url.startswith(BASE + "/auth/v1/")
    headers = {"apikey":KEY, "Content-Type":"application/json",
               "Accept":"application/json"}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    req = urllib.request.Request(url, method="POST",
                                 data=json.dumps(body).encode("utf-8"),
                                 headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=15) as response:
            status, raw = response.status, response.read(4000)
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read(4000)
    except (TimeoutError, urllib.error.URLError) as error:
        print("STAGE35_BLOCKED: network failure", type(error).__name__)
        return None, {}
    try:
        obj = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        obj = {}
    return status, obj if isinstance(obj, dict) else {}

def main():
    run_id = uuid.uuid4().hex[:16]
    sessions = []
    for actor in ("a", "b"):
        email = f"stage35-auth-qa-{run_id}-{actor}@example.com"
        password = secrets.token_urlsafe(40) + "A1!"
        status, signup = request("/auth/v1/signup", {"email":email,"password":password,
                                                     "data":{"qa_stage35":True}})
        if status not in (200, 201) or not signup.get("id") and not isinstance(signup.get("user"),dict):
            # Never print email, password, user ID, JWT, or server error text.
            print(f"STAGE35_BLOCKED: {actor} signup rejected HTTP {status}; error_code={signup.get('error_code',signup.get('code','unknown'))}")
            return 2
        print(f"PASS: {actor} synthetic signup accepted, no real email address used")
        status, login = request("/auth/v1/token?grant_type=password",
                                {"email":email,"password":password})
        if status != 200 or not isinstance(login.get("access_token"), str):
            print(f"STAGE35_BLOCKED: {actor} password login HTTP {status}, code={login.get('error_code',login.get('code','unknown'))}; "
                  "email confirmation or provider setting likely required")
            return 2
        sessions.append(login["access_token"])
        print(f"PASS: {actor} password login returned authenticated access token (not logged)")
    assert len(sessions) == 2
    # Without a separate earned Lv2 participation identity, even authenticated
    # test accounts must be refused Post-it mutation. This does NOT prove that
    # A cannot mutate B's content when both are verified members.
    for actor, token in zip(("a","b"),sessions):
        url = BASE + "/functions/v1/beagu-postit-api-v1"
        req = urllib.request.Request(
            url, method="POST",
            data=b'{"action":"create_post","subject_type":"school","school_id":"TST0001","text":"test-only"}',
            headers={"Content-Type":"application/json","Accept":"application/json",
                     "Authorization":"Bearer "+token})
        try:
            with urllib.request.build_opener(NoRedirect).open(req, timeout=12) as response:
                code, raw = response.status, response.read(500)
        except urllib.error.HTTPError as error:
            code, raw = error.code, error.read(500)
        try: value = json.loads(raw)
        except (ValueError,UnicodeDecodeError): value = {}
        if code != 403 or value.get("error") != "LEVEL_REQUIRED":
            print(f"STAGE35_BLOCKED: {actor} unearned Auth user unexpectedly returned HTTP {code}")
            return 1
        print(f"PASS: {actor} real Auth JWT cannot post without independently earned Lv2 session (HTTP 403)")
    print("STAGE35_PARTIAL: real 2-user signup and authenticated access tested, not two-linked-account IDOR/MFA.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
