#!/usr/bin/env python3
"""One-time concurrent staging REST test of the genuine SQL global cap.

Only on ycwuugggqbunlbwuzvbx. Before the test, seed the CURRENT hour's
beagu_perf_global_budget_v1.used to 9996 and start with empty rate/sample
tables. Afterward, run stage35-perf-global-budget-cleanup.sql.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request
import uuid

ROOT=pathlib.Path(__file__).resolve().parents[1]
STAGING="ycwuugggqbunlbwuzvbx"
URL="https://"+STAGING+".supabase.co/rest/v1/rpc/beagu_perf_record_v1"
assert "snvzwrexuqavnfvzgxqj" not in URL and "baeguindex.com" not in URL
source=(ROOT/"scripts/release-manager/worker.py").read_text(encoding="utf8")
keys=re.findall(r'stage_key\s*=\s*"(sb_publishable_[A-Za-z0-9_-]+)"',source)
if len(keys)!=1:sys.exit("BLOCKED: unique staging public key unavailable")
KEY=keys[0]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        raise urllib.error.HTTPError(req.full_url,code,"REDIRECT_BLOCKED",headers,fp)

def call(i):
    fields={"p_visitor":str(uuid.uuid4()),"p_page":"index",
            "p_operation":"navigation","p_duration_ms":200+i,"p_ok":True}
    req=urllib.request.Request(URL,data=json.dumps(fields).encode(),method="POST",
        headers={"apikey":KEY,"Content-Type":"application/json","Accept":"application/json"})
    try:
        with urllib.request.build_opener(NoRedirect).open(req,timeout=15) as response:
            status=response.status
            payload=response.read(500)
    except urllib.error.HTTPError as error:
        status=error.code
        payload=error.read(500)
    except (TimeoutError,urllib.error.URLError) as error:
        raise AssertionError("staging network unavailable: "+type(error).__name__)
    try:value=json.loads(payload)
    except (ValueError,UnicodeError):value=None
    if status!=200 or not isinstance(value,bool):
        raise AssertionError(f"unexpected HTTP {status} or nonboolean reply")
    return value

if __name__=="__main__":
    with ThreadPoolExecutor(max_workers=8) as pool:
        values=list(pool.map(call,range(16)))
    accepted=sum(x is True for x in values)
    denied=sum(x is False for x in values)
    if (accepted,denied)!=(4,12):
        sys.exit(f"STAGE35_BLOCKED: concurrency violated cap: accepted={accepted}, denied={denied}")
    print("PASS: 16 concurrent fake anonymous visitors: exactly 4 admitted and 12 rejected by shared hourly counter.")
    print("SCOPE: isolated staging telemetry only; global cap is not a complete bot/Sybil defense.")
