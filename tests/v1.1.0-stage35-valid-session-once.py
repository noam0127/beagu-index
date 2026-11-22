#!/usr/bin/env python3
"""One-time stage35 positive-session E2E, testing synthetic 15-minute fixtures.

SAFEGUARDS:
- URLs restricted to the isolated staging Supabase project.
- Uses only deterministic dummy credentials seeded by an explicit test-only SQL.
- Never submits real member information, survey data, or any write operation.
- Fixtures must be deleted after the validation run; no long-lived access.
- This proves ONLY legacy Lv1/Lv2 session verification, not Lv3.
"""
import json
import urllib.error
import urllib.request

STAGING = "ycwuugggqbunlbwuzvbx"
PRODUCTION = "snvzwrexuqavnfvzgxqj"
URL = "https://" + STAGING + ".supabase.co/functions/v1/beagu-level-api"
assert PRODUCTION not in URL and STAGING in URL

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "REDIRECT_BLOCKED", headers, fp)

def verify(level, forged_claim=False):
    # Never log the deterministic dummy session tokens.
    token = str(level + 1) * 64
    payload = {"action": "verify"}
    if forged_claim:
        payload.update({"level": 3, "access_level": 3, "is_admin": True})
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(),
        headers={"Content-Type":"application/json",
                 "Accept":"application/json",
                 "X-Beagu-Session": token}, method="POST")
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=12) as response:
            status = response.status
            data = json.loads(response.read(1600))
    except urllib.error.HTTPError as e:
        print(f"FAIL: Lv{level} verify HTTP {e.code} (no response content printed)")
        return False
    if status != 200 or not isinstance(data, dict):
        print(f"FAIL: Lv{level} expected JSON 200, got HTTP {status}")
        return False
    received_level = data.get("level")
    expected_provisional = level == 2
    # This API uses legacy provisional code sessions; no account or earned-2026
    # identity is assigned to these synthetic sessions.
    if received_level != level or data.get("provisional") is not expected_provisional:
        print(f"FAIL: Lv{level} mismatch (no session details printed)")
        return False
    if "token" in data or "user" in data or "email" in data:
        print("FAIL: verify response leaked credential/member fields")
        return False
    print(f"PASS: synthetic Lv{level} server verification, claimed Lv3 ignored={forged_claim}")
    return True

if __name__ == "__main__":
    assert all(verify(level, claim) for level in (1, 2) for claim in (False, True))
    print("STAGE35_PARTIAL: synthetic Lv1/Lv2 verification passed; Lv3 and cross-account E2E not implemented.")
