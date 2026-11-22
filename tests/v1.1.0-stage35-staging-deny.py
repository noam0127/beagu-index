#!/usr/bin/env python3
"""Read-only staging auth-denial probe for v1.1.0 stage 35.

Intentionally does NOT send credentials, create users, mutate rows, submit
surveys, or touch baeguindex.com / the production Supabase project.
An HTTP 401/403 proves only anonymous denial at that endpoint, not RLS/Lv3
cross-account correctness. 404/5xx/network failures BLOCK completion.
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

STAGING = "ycwuugggqbunlbwuzvbx"
PRODUCTION = "snvzwrexuqavnfvzgxqj"
BASE = "https://" + STAGING + ".supabase.co/functions/v1/"
assert PRODUCTION not in BASE and BASE.startswith("https://" + STAGING + ".supabase.co/")

PROBES = [
    ("level-verify", "beagu-level-api", "POST", b'{"action":"verify"}'),
    ("postit-posts", "beagu-postit-api-v1?action=posts", "GET", None),
    ("admin-members", "beagu-admin-members-v1", "POST", b'{"action":"list","page":1}'),
]

# Deterministic dummy token 0*64 was inserted in the isolated test database
# with expires_at in the past; it contains no member or school information.
# The 1*64 token is not present in the test DB. These two negative controls
# cannot establish correct handling of *valid* sessions or Lv3 authorization.
SESSION_NEGATIVE_PROBES = [
    ("expired-level-session", "beagu-level-api", "POST", b'{"action":"verify"}',
     {"X-Beagu-Session": "0" * 64}),
    ("forged-level-session", "beagu-level-api", "POST", b'{"action":"verify"}',
     {"X-Beagu-Session": "1" * 64}),
    ("invalid-token-format", "beagu-level-api", "POST", b'{"action":"verify"}',
     {"X-Beagu-Session": "0" * 63}),
]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "REDIRECT_BLOCKED", headers, fp)


def probe(name, path, method, body, additional_headers=None):
    url = BASE + path
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 **(additional_headers or {})},
    )
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(request, timeout=12) as response:
            status = response.status
            reply = response.read(1500)
    except urllib.error.HTTPError as error:
        status = error.code
        reply = error.read(1500)
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"BLOCKED {name}: network unavailable ({type(error).__name__})")
        return False
    try:
        payload = json.loads(reply)
    except (ValueError, UnicodeDecodeError):
        payload = {}
    if status in (401, 403):
        print(f"PASS access-denial {name}: HTTP {status} (valid-session authorization unverified)")
        return True
    if status == 404:
        print(f"BLOCKED {name}: function not provisioned (HTTP 404)")
        return False
    if 300 <= status < 400:
        print(f"BLOCKED {name}: unexpected redirect (HTTP {status})")
        return False
    if status >= 500:
        print(f"BLOCKED {name}: backend unavailable (HTTP {status})")
        return False
    print(f"FAIL {name}: anonymous request was NOT denied (HTTP {status}); response omitted")
    return False


def probe_direct_rest_privilege():
    """Use the site's staging publishable key; never any service role key."""
    worker = pathlib.Path(__file__).resolve().parents[1] / "scripts/release-manager/worker.py"
    source = worker.read_text(encoding="utf8")
    matches = re.findall(r'stage_key\s*=\s*"(sb_publishable_[A-Za-z0-9_-]+)"', source)
    if len(matches) != 1:
        print("BLOCKED rest-rls: staging public key not identifiable")
        return False
    api_key = matches[0]
    url = "https://" + STAGING + ".supabase.co/rest/v1/beagu_level_sessions?select=access_level&limit=1"
    req = urllib.request.Request(url, method="GET", headers={
        "apikey": api_key, "Accept": "application/json",
    })
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=12) as response:
            status = response.status
            reply = response.read(1000)
    except urllib.error.HTTPError as error:
        status = error.code
        reply = error.read(1000)
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"BLOCKED rest-rls: network unavailable ({type(error).__name__})")
        return False
    try:
        data = json.loads(reply)
    except (ValueError, UnicodeDecodeError):
        data = {}
    # PostgreSQL 42501 is a definitive denial from database permissions;
    # generic HTTP 401 (e.g. a bad apikey) is NOT proof of RLS.
    if status in (401, 403) and isinstance(data, dict) and data.get("code") == "42501":
        print("PASS: staging Data API denies anon SELECT of session table (Postgres 42501)")
        return True
    print(f"BLOCKED rest-rls: HTTP {status}, error_code={data.get('code') if isinstance(data,dict) else 'unknown'}")
    return False


if __name__ == "__main__":
    passed = [probe(*item) for item in PROBES + SESSION_NEGATIVE_PROBES]
    passed.append(probe_direct_rest_privilege())
    if not all(passed):
        print("STAGE35_BLOCKED: complete staging schema/function provisioning and re-run.")
        sys.exit(1)
    print("STAGE35_PARTIAL: anonymous, expired, forged and malformed credentials denied; Lv1-Lv3 and cross-account E2E remain mandatory.")
