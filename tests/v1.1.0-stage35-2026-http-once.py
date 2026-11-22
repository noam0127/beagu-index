#!/usr/bin/env python3
"""One-time stage35 HTTP E2E: 2026 synthetic school-level percentile releases.

Never uses real student, teacher, respondent, or school records.
The TST-prefixed schools, mock privacy approval and 15-minute sessions
exist ONLY in the separate staging Supabase DB.
The fixture cleanup SQL MUST run immediately after the test.
"""
import json
import sys
import urllib.error
import urllib.request

PROJECT = "ycwuugggqbunlbwuzvbx"
URL = "https://" + PROJECT + ".supabase.co/functions/v1/beagu-level-api"
assert "snvzwrexuqavnfvzgxqj" not in URL
assert "baeguindex.com" not in URL
SCHOOLS = ["TST0001", "TST0002", "TST0003", "TST0004", "TST0005", "TST0006"]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "REDIRECT_BLOCKED", headers, fp)

def fetch(level):
    # The 64-char deterministic staging-only session tokens must never be logged.
    token = str(level + 5) * 64
    body = {"action":"percentiles", "schoolIds":SCHOOLS,
            "level":3, "unlock_all":True, "is_admin":True}
    req = urllib.request.Request(
        URL, method="POST", data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type":"application/json","Accept":"application/json",
                 "X-Beagu-Session":token})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=12) as response:
            status = response.status
            data = response.read(4096)
    except urllib.error.HTTPError as error:
        status = error.code
        data = error.read(4096)
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"BLOCKED Lv{level}: network unavailable ({type(error).__name__})")
        return None
    if status != 200:
        try: code=json.loads(data).get("error","unknown")
        except (ValueError,AttributeError): code="unrecognized"
        print(f"FAIL Lv{level}: HTTP {status}, code={code}")
        return None
    try: result=json.loads(data)
    except ValueError: result=None
    if not isinstance(result,dict) or not isinstance(result.get("values"),dict):
        print(f"FAIL Lv{level}: malformed JSON payload")
        return None
    if set(result)!={"values"}:
        print(f"FAIL Lv{level}: unexpected result keys")
        return None
    return result["values"]

def check(level, expected):
    received=fetch(level)
    if received is None:return False
    if set(received)!=set(expected):
        print(f"FAIL Lv{level}: visible synthetic ID mismatch; expected={sorted(expected)} received={sorted(received)}")
        return False
    if any(received.get(k)!=42.5 for k in expected):
        print(f"FAIL Lv{level}: synthetic approved values did not match")
        return False
    print(f"PASS: Lv{level} shows exactly {len(expected)} synthetic schools, excludes 5h early, failed privacy and unreviewed metrics")
    return True

if __name__=="__main__":
    results=[
      check(1, {"TST0003","TST0004"}),
      check(2, {"TST0002","TST0003","TST0004"}),
    ]
    if not all(results):sys.exit("STAGE35_BLOCKED: synthetic 2026 HTTP disclosure test failed")
    print("STAGE35_PARTIAL: Lv1 24h and Lv2 6h tested with isolated mock approved snapshots only.")
    print("NOT PROVEN: production review RPC, full school details, or Lv3 account rights.")
