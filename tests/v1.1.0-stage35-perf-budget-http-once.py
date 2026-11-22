#!/usr/bin/env python3
"""Stage35 one-time REST check of global telemetry write budget.

Requires isolated staging seed:
  tests/staging/stage35-perf-global-budget-prototype.sql
  beagu_private.beagu_perf_global_budget_v1.used == 9996 for current UTC hour.
DO NOT test production. Uses only a PUBLIC staging publishable API key,
never a service_role secret. Sends eight randomly generated fake UUIDv4 values.
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request
import uuid

ROOT=pathlib.Path(__file__).resolve().parents[1]
STAGING="ycwuugggqbunlbwuzvbx"
URL=f"https://{STAGING}.supabase.co/rest/v1/rpc/beagu_perf_record_v1"
assert "snvzwrexuqavnfvzgxqj" not in URL and "baeguindex.com" not in URL

source=(ROOT/"scripts/release-manager/worker.py").read_text(encoding="utf8")
match=re.findall(r'stage_key\s*=\s*"(sb_publishable_[A-Za-z0-9_-]+)"',source)
if len(match)!=1:sys.exit("BLOCKED: staging publishable key missing/ambiguous")
KEY=match[0]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        raise urllib.error.HTTPError(req.full_url,code,"REDIRECT_BLOCKED",headers,fp)

def sample(i):
    values={"p_visitor":str(uuid.uuid4()),"p_page":"index",
            "p_operation":"navigation","p_duration_ms":100+i,"p_ok":True}
    req=urllib.request.Request(URL,method="POST",
        data=json.dumps(values).encode("utf8"),
        headers={"apikey":KEY,"Content-Type":"application/json",
                 "Accept":"application/json"})
    try:
        with urllib.request.build_opener(NoRedirect).open(req,timeout=10) as response:
            status=response.status
            payload=response.read(500)
    except urllib.error.HTTPError as error:
        status=error.code
        payload=error.read(500)
    except (TimeoutError,urllib.error.URLError) as error:
        print(f"BLOCKED request {i}: {type(error).__name__}")
        return None
    try:result=json.loads(payload)
    except (ValueError,UnicodeError):result=None
    if status!=200 or not isinstance(result,bool):
        print(f"FAIL request {i}: status={status}, bool_body={isinstance(result,bool)}")
        return None
    return result

if __name__=="__main__":
    expected=[True]*4+[False]*4
    actual=[]
    for i in range(8):
        actual.append(sample(i))
    if actual!=expected:
        sys.exit("STAGE35_BLOCKED: global budget accepted/denied pattern differs. "+
                 f"expected={expected}; actual={actual}")
    print("PASS: four independent fake UUIDv4 telemetry calls admitted up to global hourly cap.")
    print("PASS: four further independent UUIDv4 telemetry calls rejected after cap.")
    print("STAGE35_PARTIAL: real staging anon HTTP global budget E2E only; do not imply DoS-proofing.")
