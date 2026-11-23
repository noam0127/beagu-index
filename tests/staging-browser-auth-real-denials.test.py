#!/usr/bin/env python3
"""Real isolated staging API NEGATIVE security probes with zero account writes.

Do NOT call login, register, signup, logout with valid credentials, paid API,
admin review or any mutation. Every request must be a missing/forged session
denial and must not expose protected content.
"""
import json
from urllib import request,error
BASE="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/"
ORIGIN="http://localhost:8000"
def call(name,method="POST",payload=None,headers=None):
    h={"Origin":ORIGIN,"Cache-Control":"no-store",**(headers or {})}
    if payload is not None:
        h["Content-Type"]="application/json"
    req=request.Request(BASE+name,method=method,headers=h,
                        data=json.dumps(payload).encode() if payload is not None else None)
    try:
        with request.urlopen(req,timeout=25) as res:
            return res.status,res.headers,res.read(2048)
    except error.HTTPError as exc:
        return exc.code,exc.headers,exc.read(2048)
def denial(name,method,payload,expected,reason,headers=None):
    status,h,body=call(name,method,payload,headers)
    try:data=json.loads(body)
    except ValueError:raise AssertionError((reason,status,"non-json response"))
    assert status==expected and data.get("error")==reason,(name,method,status,data)
    for forbidden in ("token","school_results","participants","referral_data",
                      "email","user","service_role"):
        assert forbidden not in data,("Response leaked sensitive attribute",forbidden)
    print("PASS",name,method,"without valid session ->",status,reason)
for action in ("verify","school","percentiles","offices","ranked_schools","survey_comparisons"):
    denial("beagu-level-api","POST",{"action":action},401,"AUTH_REQUIRED")
denial("beagu-level-api","POST",{"action":"verify"},401,"AUTH_REQUIRED",
       {"X-Beagu-Session":"0"*64})
denial("beagu-level-api","GET",None,405,"METHOD_NOT_ALLOWED")
for suffix in ("?action=writer_status","?action=schools"):
    denial("beagu-postit-api-v1"+suffix,"GET",None,403,"LEVEL_REQUIRED")
    denial("beagu-postit-api-v1"+suffix,"GET",None,403,"LEVEL_REQUIRED",
           {"X-Beagu-Level-Session":"0"*64})
print("PASS: real staging missing/forged participation tokens cannot read school/member data")
print("Not tested: real Lv1/Lv2/Lv3 positive login, email confirmation, Render or MFA")
