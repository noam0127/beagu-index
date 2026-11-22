#!/usr/bin/env python3
"""One-time staging-only regression: a valid Lv1 session cannot rank by public land price.

No production requests or Supabase service-role key. The deterministic dummy
session is deliberately time-limited and MUST be revoked after this run.
"""
import json
import sys
import urllib.error
import urllib.request

PROJECT="ycwuugggqbunlbwuzvbx"
URL="https://"+PROJECT+".supabase.co/functions/v1/beagu-level-api"
assert "snvzwrexuqavnfvzgxqj" not in URL and "baeguindex.com" not in URL

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "REDIRECT_BLOCKED", headers, fp)

def test_lv1_sort_gate():
    body={"action":"ranked_schools","searchText":"",
          "region":"부산","office":"","sort":"housing_price_won",
          "direction":"desc","page":0,"level":3,"is_admin":True}
    req=urllib.request.Request(URL,method="POST",data=json.dumps(body,ensure_ascii=False).encode(),
       headers={"Accept":"application/json","Content-Type":"application/json",
                "X-Beagu-Session":"5"*64})
    try:
        with urllib.request.build_opener(NoRedirect).open(req,timeout=12) as response:
            status=response.status
            data=response.read(1500)
    except urllib.error.HTTPError as e:
        status=e.code
        data=e.read(1500)
    except Exception as e:
        print("BLOCKED: staging network unavailable",type(e).__name__)
        return False
    try:
        payload=json.loads(data)
    except ValueError:
        payload={}
    if status==403 and isinstance(payload,dict) and payload.get("error")=="ACCESS_DENIED" and "schools" not in payload:
        print("PASS: real staging Lv1 session denied housing_price_won sort (403 ACCESS_DENIED); forged Lv3 claim ignored")
        return True
    print("FAIL: level restriction did not return expected 403, HTTP",status)
    return False

if __name__=="__main__":
    if not test_lv1_sort_gate():
        sys.exit(1)
    print("STAGE35_PARTIAL: tier-specific school sort gate verified; Lv3 and member cross-account tests remain.")
