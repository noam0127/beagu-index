#!/usr/bin/env python3
"""ONE-TIME POSITIVE live HTTP QA. WILL write one synthetic perf sample to staging.

Run only on clean isolated staging. GitHub Actions DOES NOT contain credentials.
The synthetic sample MUST be deleted via the validated cleanup SQL after test.
DO NOT put this test into continuous/on-every-push workflows.
"""
from urllib import request,error
import json
URL="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-perf-ingest-v1"
QA="http://localhost:8000"
PAYLOAD={
    "visitor":"f0000000-0000-4000-8000-000000000001",
    "page":"index","operation":"navigation","duration_ms":157,"ok":True
}
def send():
    req=request.Request(URL,method="POST",
        headers={"Origin":QA,"Content-Type":"application/json"},
        data=json.dumps(PAYLOAD).encode())
    try:
        with request.urlopen(req,timeout=30) as response:
            return response.status,response.read(2048)
    except error.HTTPError as exc:
        return exc.code,exc.read(2048)
status,body=send()
assert status==200,(status,body)
first=json.loads(body)
assert first=={"ok":True,"accepted":True},first
print("PASS isolated live Edge sampled one fixed synthetic page/navigation event")
status,body=send()
assert status==200,(status,body)
second=json.loads(body)
assert second=={"ok":True,"accepted":False},second
print("PASS same visitor/page/operation replay was rate limited within 20 seconds")
print("ACTION REQUIRED: delete exactly this one QA sample/rate/global-budget via cleanup SQL")
