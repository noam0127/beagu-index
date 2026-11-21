#!/usr/bin/env python3
"""Read-only staging auth-denial probe for v1.1.0 stage 35.

Intentionally does NOT send credentials, create users, mutate rows, submit
surveys, or touch baeguindex.com / the production Supabase project.
An HTTP 401/403 proves only anonymous denial at that endpoint, not RLS/Lv3
cross-account correctness. 404/5xx/network failures BLOCK completion.
"""
import json
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


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "REDIRECT_BLOCKED", headers, fp)


def probe(name, path, method, body):
    url = BASE + path
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
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
        print(f"PASS anonymous-denial {name}: HTTP {status} (business authorization still unverified)")
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


if __name__ == "__main__":
    passed = [probe(*item) for item in PROBES]
    if not all(passed):
        print("STAGE35_BLOCKED: complete staging schema/function provisioning and re-run.")
        sys.exit(1)
    print("STAGE35_PARTIAL: anonymous endpoint denial passed; Lv1-Lv3 and cross-account E2E remain mandatory.")
