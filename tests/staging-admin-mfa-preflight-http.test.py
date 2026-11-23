#!/usr/bin/env python3
"""REAL staging 2026 reviewer MFA preflight negative HTTP, strictly NO WRITES.
Do not supply a real access token in CI or print credentials.
"""
from urllib import request, error
import base64
import json
URL=("https://ycwuugggqbunlbwuzvbx.supabase.co"
     "/functions/v1/beagu-2026-review-admin")
QA="http://localhost:8000"
def call(preflight=False,method="POST",origin=QA,token=None,body=b"{}"):
    headers={"Content-Type":"application/json"}
    if origin is not None:headers["Origin"]=origin
    if token is not None:headers["Authorization"]="Bearer "+token
    url=URL+("?preflight=mfa" if preflight else "")
    data=body if method=="POST" else None
    r=request.Request(url,data=data,headers=headers,method=method)
    try:
        with request.urlopen(r,timeout=25) as response:
            return response.status,response.headers,response.read(4096)
    except error.HTTPError as exc:
        return exc.code,exc.headers,exc.read(4096)
# No real credentials or seeded Auth accounts in CI.
s,h,b=call(preflight=True)
assert s==401 and json.loads(b).get("error")=="authentication_required",(s,b)
print("PASS unsigned/missing JWT rejected by read-only preflight")
s,h,b=call(preflight=True,origin=None)
assert s==403 and not h.get("Access-Control-Allow-Origin"),(s,b)
print("PASS missing Origin denied")
s,h,b=call(preflight=True,origin="https://baeguindex.com")
assert s==403 and not h.get("Access-Control-Allow-Origin"),(s,b)
print("PASS production Origin denied")
s,h,b=call(preflight=True,method="OPTIONS")
assert s==204 and h.get("Access-Control-Allow-Origin")==QA,(s,b)
print("PASS controlled local preflight CORS")
s,h,b=call(preflight=True,token="x"*8192)
assert s==401,(s,b)
print("PASS oversized bearer token rejected before Auth lookup")
def b64(x):
    return base64.urlsafe_b64encode(json.dumps(x,separators=(",",":")).encode()).decode().rstrip("=")
# A self-declared signed-looking AAL2+owner is UNTRUSTED.
for fake in (
    b64({"alg":"none","typ":"JWT"})+"."+b64({
        "sub":"c0000000-0000-4000-8000-00000000a001",
        "aal":"aal2","session_id":"c0000000-0000-4000-8000-00000000a002"
    })+".invalidsignature",
    "a.b.c",
    "0"*64
):
    s,h,b=call(preflight=True,token=fake)
    assert s==401 and json.loads(b).get("error")=="authentication_required",(s,b)
print("PASS forged JWT payload and fake AAL2 rejected")
s,h,b=call(preflight=False)
assert s==503 and json.loads(b).get("error")=="REVIEW_NOT_READY",(s,b)
print("PASS normal review actions remain DISABLED")
print("NO-WRITE preflight passed; real owner+TOTP login remains untested")
