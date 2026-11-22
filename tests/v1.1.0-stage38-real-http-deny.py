#!/usr/bin/env python3
"""One-shot release-manager authentication denial HTTP tests.

Targets ONLY isolated Supabase staging whose release actions and signed
worker path are disabled in the deployed QA function.
"""
import base64
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-stage38-release-guard"
TIMEOUT=22
def unsigned_jwt():
    def token(x):return base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip("=")
    return ".".join((token({"alg":"none","typ":"JWT"}),token({
        "sub":"00000000-0000-4000-8000-000000000001",
        "aal":"aal2","session_id":"00000000-0000-4000-8000-000000000002",
        "role":"service_role"
    }),"unsigned"))
FAKE=unsigned_jwt()
cases=[
 ("GET method rejected","GET",None,{},405),
 ("missing owner credentials","POST",{"action":"status"},{},401),
 ("forged owner token","POST",{"action":"register_stage_candidate","candidate_sha":"a"*40},
    {"Authorization":"Bearer "+FAKE},403),
 ("fake deploy approval","POST",{"action":"stage_apply","confirmed_tested":True},
    {"Authorization":"Bearer "+FAKE},403),
 ("fake production approval","POST",{"action":"prod_apply","confirmed_tested":True},
    {"Authorization":"Bearer "+FAKE},403),
 ("fake signed worker","POST",{"action":"worker_next","head_sha":"a"*40},
    {"Authorization":"Bearer "+FAKE},403),
 ("unknown bearer","POST",{"action":"status"},
    {"Authorization":"Bearer invalid.jwt.token"},403),
 ("cross origin forbidden","POST",{"action":"status"},
    {"Origin":"https://foreign.example","Authorization":"Bearer "+FAKE},403),
 ("invalid JSON rejected","POST","{not-json",
    {"Authorization":"Bearer "+FAKE},400),
 ("oversize body rejected","POST",{"action":"status","padding":"a"*14500},
    {"Authorization":"Bearer "+FAKE},413)
]
for name,method,body,headers,expected in cases:
    data=None if method=="GET" else (body.encode() if isinstance(body,str) else json.dumps(body).encode())
    req=Request(API,data=data,method=method,headers={
        "Content-Type":"application/json","User-Agent":"stage38-no-write-guard-qa",
        **headers
    })
    try:
        with urlopen(req,timeout=TIMEOUT) as response:
            code=response.status
            response_body=response.read(1000)
    except HTTPError as exc:
        code=exc.code
        response_body=exc.read(1000)
    assert code==expected, f"{name}: expected {expected}, got {code} (response omitted)"
    value=json.loads(response_body)
    assert isinstance(value.get("error"),str),f"{name}: missing structured denial"
print("STAGE38_GUARD: PASS 10/10 genuine HTTP denials against isolated release manager code.")
print("SCOPE: negative AAL2/worker tests only. No valid AAL2 positive proof or live RC deploy.")
