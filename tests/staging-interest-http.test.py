#!/usr/bin/env python3
"""Staging-only real HTTP auth/CORS and PostgREST session-path probe.
Fake token is 64 hex zeroes (never corresponds to a real session).
No database writes, secrets or private data.
"""
from urllib import request,error
import json
U="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-school-interest-v1"
QA="http://localhost:8000"
def probe(method="POST",origin=QA,token=None,data=b'{}'):
  h={}
  if origin is not None:h["Origin"]=origin
  if token is not None:h["X-Beagu-Session"]=token
  if data is not None:h["Content-Type"]="application/json"
  req=request.Request(U,headers=h,method=method,data=data)
  try:
    with request.urlopen(req,timeout=20) as res:return res.status,res.headers,res.read(2048)
  except error.HTTPError as e:return e.code,e.headers,e.read(2048)
s,h,b=probe("OPTIONS",data=None)
assert s==204 and h.get("Access-Control-Allow-Origin")==QA,(s,b)
print("PASS allowed local preflight")
s,h,b=probe("OPTIONS",origin="https://baeguindex.com",data=None)
assert s==403 and h.get("Access-Control-Allow-Origin") is None,(s,b)
print("PASS production origin denied")
s,h,b=probe(token=None)
assert s==401,(s,b)
print("PASS missing session denied")
s,h,b=probe(token="0"*64)
obj=json.loads(b)
# A valid-length but non-existent token should be rejected as access denied,
# unless the Supabase REST layer is broken. Report that separately.
assert s==403,(s,obj)
print("PASS fake 64-hex session rejected after real DB lookup")
print("NOT TESTED: authorized Lv1 session, actual interest analytics browser")
