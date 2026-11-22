#!/usr/bin/env python3
"""Real anonymous HTTP negative tests against staging ONLY. No credentials.
This is NOT a successful Lv2 login or browser E2E test.
"""
from urllib import request, error

URL = "https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-edited-api-v1"
LOCAL = "http://localhost:8000"
BLOCKED = "https://baeguindex.com"

def probe(method, origin=None, data=None):
    headers = {}
    if origin is not None:
        headers["Origin"] = origin
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = request.Request(
        URL, data=data, headers=headers, method=method
    )
    try:
        with request.urlopen(req, timeout=20) as response:
            return response.status, response.headers
    except error.HTTPError as exc:
        return exc.code, exc.headers

code, headers = probe("OPTIONS", LOCAL)
assert code == 204, ("local preflight", code)
assert headers.get("Access-Control-Allow-Origin") == LOCAL
print("PASS allowed local origin CORS preflight")

code, headers = probe("OPTIONS", BLOCKED)
assert code == 403, ("production origin must be rejected on staging", code)
assert not headers.get("Access-Control-Allow-Origin")
print("PASS production-origin CORS rejected without allow-origin")

code, headers = probe("POST", LOCAL, b'{"action":"school","schoolId":"TST9041"}')
assert code == 401, ("no participation code", code)
assert headers.get("Access-Control-Allow-Origin") == LOCAL
print("PASS no level-session token rejects access")

code, _ = probe("GET", LOCAL)
assert code == 405, ("method guard", code)
print("PASS non-POST method rejected")

code, headers = probe("POST", None, b'{}')
assert code == 403 and not headers.get("Access-Control-Allow-Origin"), (code, headers)
print("PASS no-origin request rejected")
print("STAGING HTTP NEGATIVE GATES PASS; positive Lv2 and hosted E2E NOT TESTED")
