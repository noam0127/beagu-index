#!/usr/bin/env python3
"""Real no-write HTTP negative smoke for isolated challenge issuer.
Public session tokens are NEVER used in CI.
"""
from urllib import request,error
import json
URL="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-challenge-identity"
QA="http://localhost:8000"
def call(method,origin=QA,payload=None,token=None):
 h={}
 if origin is not None:h["Origin"]=origin
 if payload is not None:h["Content-Type"]="application/json"
 if token is not None:h["X-Beagu-Session"]=token
 data=None if payload is None else json.dumps(payload).encode("utf-8")
 r=request.Request(URL,headers=h,method=method,data=data)
 try:
  with request.urlopen(r,timeout=25) as res:return res.status,res.headers,res.read(2048)
 except error.HTTPError as exc:return exc.code,exc.headers,exc.read(2048)
s,h,b=call("OPTIONS")
assert s==204 and h.get("Access-Control-Allow-Origin")==QA,(s,b)
print("PASS local OPTIONS preflight")
s,h,b=call("OPTIONS",origin="https://baeguindex.com")
assert s==403 and h.get("Access-Control-Allow-Origin") is None,(s,b)
print("PASS production origin denied")
s,h,b=call("POST",origin=None,payload={"action":"issue"})
assert s==403 and h.get("Access-Control-Allow-Origin") is None,(s,b)
print("PASS no-Origin denied")
s,h,b=call("GET")
assert s==405,(s,b)
print("PASS GET denied")
s,h,b=call("POST",payload={"action":"issue","visitor":"c0000000-0000-4000-8000-000000000001"})
assert s==401,(s,b)
print("PASS no-session issuance denied")
s,h,b=call("POST",token="0"*64,payload={"action":"issue","visitor":"c0000000-0000-4000-8000-000000000001","deviceSecret":"a"*64})
assert s==401,(s,b)
print("PASS nonexistent session rejected without inserting identity")
print("PASS NO-WRITE staging challenge HTTP smoke; real positive Lv1 still not E2E proven")
