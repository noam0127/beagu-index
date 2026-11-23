#!/usr/bin/env python3
"""REAL staging HTTP, positive ping/visit/idempotent replay plus denial cases.
Uses only deterministic SYNTHETIC QA UUIDs. Cleanup is a separate DB step.
"""
from urllib import request,error
import json
URL="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-telemetry-v2"
QA="http://localhost:8000"
VISITOR="a0000000-0000-4000-8000-000000000001"
EVENT="a0000000-0000-4000-8000-000000000002"
def call(method,origin=QA,payload=None):
 h={}
 if origin is not None:h["Origin"]=origin
 if payload is not None:h["Content-Type"]="application/json"
 data=None if payload is None else json.dumps(payload).encode("utf-8")
 r=request.Request(URL,headers=h,method=method,data=data)
 try:
  with request.urlopen(r,timeout=25) as resp:return resp.status,resp.headers,resp.read(2048)
 except error.HTTPError as exc:return exc.code,exc.headers,exc.read(2048)
status,h,b=call("OPTIONS")
assert status==204 and h.get("Access-Control-Allow-Origin")==QA,(status,b)
print("PASS staging local preflight")
status,h,b=call("OPTIONS",origin="https://baeguindex.com")
assert status==403 and h.get("Access-Control-Allow-Origin") is None,(status,b)
print("PASS production origin denied")
status,h,b=call("GET",origin=None)
assert status==403 and h.get("Access-Control-Allow-Origin") is None,(status,b)
print("PASS no-Origin request denied")
status,h,b=call("GET")
assert status==200 and json.loads(b).get("version")==2,(status,b)
print("PASS staging readiness")
status,h,b=call("POST",payload={})
assert status==400,(status,b)
print("PASS invalid payload denied")
status,h,b=call("POST",payload={"action":"ping","page":"index","visitor":VISITOR})
assert status==200 and json.loads(b).get("ok") is True,(status,b)
print("PASS positive live-presence ping")
visit={"action":"visit","page":"index","visitor":VISITOR,"event":EVENT}
status,h,b=call("POST",payload=visit)
assert status==200,(status,b)
first=json.loads(b)
assert first.get("total")>=1 and first.get("today")>=1,(status,first)
print("PASS visit recorded, daily/total aggregated")
status,h,b=call("POST",payload=visit)
assert status==200,(status,b)
second=json.loads(b)
assert second.get("total")==first.get("total") and second.get("today")==first.get("today"),(first,second)
print("PASS same visit event replay is idempotent")
print("QA SYNTHETIC POSITIVE HTTP PASSED; remove synthetic UUID rows via staging SQL cleanup")
