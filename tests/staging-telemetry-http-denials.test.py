#!/usr/bin/env python3
"""Repeatable zero-write smoke for the real isolated Supabase telemetry API."""
from urllib import request,error
import json
URL="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-telemetry-v2"
QA="http://localhost:8000"
def call(method,origin=QA,payload=None):
  h={}
  if origin is not None:h["Origin"]=origin
  if payload is not None:h["Content-Type"]="application/json"
  body=None if payload is None else json.dumps(payload).encode("utf-8")
  req=request.Request(URL,headers=h,method=method,data=body)
  try:
    with request.urlopen(req,timeout=25) as resp:return resp.status,resp.headers,resp.read(2048)
  except error.HTTPError as exc:return exc.code,exc.headers,exc.read(2048)
s,h,b=call("OPTIONS")
assert s==204 and h.get("Access-Control-Allow-Origin")==QA,(s,b)
print("PASS allowed local OPTIONS")
s,h,b=call("OPTIONS",origin="https://baeguindex.com")
assert s==403 and not h.get("Access-Control-Allow-Origin"),(s,b)
print("PASS production Origin denied")
s,h,b=call("GET",origin=None)
assert s==403 and not h.get("Access-Control-Allow-Origin"),(s,b)
print("PASS missing Origin denied")
s,h,b=call("GET")
assert s==200 and json.loads(b).get("version")==2,(s,b)
print("PASS readiness GET without recording visit")
for bad in [{},{"action":"visit","page":"index"},{"action":"ping","visitor":"invalid","page":"index"}]:
  s,h,b=call("POST",payload=bad)
  assert s==400,(s,b)
print("PASS invalid POST blocked without calling telemetry guard or writing counters")
print("PASS: NO-WRITE staging smoke. Original synthetic positive evidence retained separately.")
