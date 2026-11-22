#!/usr/bin/env python3
"""Stage35 one-time account-ownership negative controls against isolated staging.

Only a synthetic Lv2 session without linked Auth/identity is used. Tests check
that an otherwise valid level code cannot become a writer, owner or admin.
No real member ids, email/phone, survey records, or write operations succeed.
The temporary session fixture must be revoked immediately after the run.
"""
import json
import sys
import urllib.error
import urllib.request

PROJECT = "ycwuugggqbunlbwuzvbx"
BASE = "https://" + PROJECT + ".supabase.co/functions/v1/"
POSTIT = BASE + "beagu-postit-api-v1"
ADMIN = BASE + "beagu-admin-members-v1"
# Dummy synthetic token; do not print or persist this credential.
LEVEL = "4" * 64
FAKE_ID = "22222222-2222-4222-8222-222222222222"
assert "snvzwrexuqavnfvzgxqj" not in BASE
assert "baeguindex.com" not in BASE

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "REDIRECT_BLOCKED", headers, fp)

def call(url, action, payload=None, headers=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method="POST" if payload is not None else "GET",
        headers={"Accept": "application/json", "Content-Type": "application/json",
                 **(headers or {})})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=12) as res:
            status = res.status
            content = res.read(1800)
    except urllib.error.HTTPError as error:
        status = error.code
        content = error.read(1800)
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"BLOCKED {action}: network unavailable ({type(error).__name__})")
        return None, None
    try:
        body = json.loads(content)
    except (ValueError, UnicodeError):
        body = None
    return status, body

def expect(action, url, payload, headers, status, key=None, expected=None):
    received, body = call(url, action, payload, headers)
    safe = isinstance(body, dict)
    matches = (received == status and safe and (key is None or body.get(key) == expected))
    if not matches:
        # Do not log response body, identity tokens, or member information.
        print(f"FAIL {action}: HTTP {received}, expected {status}, response shape OK={safe}")
        return False
    if any(s in body for s in ("email", "phone", "user_id", "access_token", "refresh_token")):
        print(f"FAIL {action}: member or credential information leaked")
        return False
    print(f"PASS {action}: HTTP {status}, no account privilege escalation")
    return True

if __name__ == "__main__":
    code_only = {"x-beagu-level-session": LEVEL}
    checks = [
        expect("lv2-code-alone-is-not-member",
               POSTIT+"?action=writer_status", None, code_only,
               200, "linked", False),
        expect("lv2-code-cannot-create-post",
               POSTIT, {"action":"create_post", "subject_type":"school",
                        "school_id":"0000000","text":"synthetic"},
               code_only, 403, "error", "WRITER_IDENTITY_REQUIRED"),
        expect("lv2-code-cannot-create-comment",
               POSTIT, {"action":"create_comment","post_id":FAKE_ID,"text":"synthetic"},
               code_only, 403, "error", "WRITER_IDENTITY_REQUIRED"),
        expect("lv2-code-cannot-remove-other-post",
               POSTIT, {"action":"remove","target_type":"post","target_id":FAKE_ID,
                        "author_uid":FAKE_ID},
               code_only, 403, "error", "WRITER_IDENTITY_REQUIRED"),
        expect("lv2-code-cannot-link-member-without-auth",
               POSTIT, {"action":"link_member","deviceSecret":"a"*64,
                        "auth_user_id":FAKE_ID},
               code_only, 403, "error", "ACCOUNT_AUTH_REQUIRED"),
        expect("forged-author-and-bearer-do-not-enable-writing",
               POSTIT, {"action":"create_post","subject_type":"school",
                        "school_id":"0000000","text":"synthetic","author_uid":FAKE_ID},
               {**code_only, "Authorization":"Bearer "+"a"*64},
               403, "error", "WRITER_IDENTITY_REQUIRED"),
        expect("request-body-owner-cannot-moderate",
               ADMIN, {"action":"moderate","role":"owner", "aal":"aal2",
                       "user_id":FAKE_ID,"operation":"suspend_7d",
                       "reason":"synthetic security test"},
               {}, 401, "error", "authentication_required"),
        expect("request-body-user-cannot-read-member-detail",
               ADMIN, {"action":"detail","user_id":FAKE_ID,"role":"owner"},
               {}, 401, "error", "authentication_required"),
    ]
    if not all(checks):
        sys.exit("STAGE35_BLOCKED: code-only membership or owner authorization test failed.")
    print("STAGE35_PARTIAL: 8 account-ownership negative controls passed.")
    print("Not verified: real member A vs B, real MFA, Lv3 or 2026 publication policy.")
