#!/usr/bin/env python3
"""Real staging-only DENIAL HTTP smoke. Does not submit PINs/tokens or write data."""
from urllib import request,error
import json
base="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/"
qa="http://localhost:8000"
services=[
  ("class-diary-guest-access-v1","PREVIEW_NOT_READY"),
  ("class-diary-progress-v1","PREVIEW_NOT_READY"),
  ("beagu-2026-review-admin","REVIEW_NOT_READY"),
]
def call(name,method,origin=qa):
  headers={}
  if origin is not None: headers["Origin"]=origin
  if method=="POST": headers["Content-Type"]="application/json"
  req=request.Request(base+name,headers=headers,method=method,data=b'{}' if method=="POST" else None)
  try:
    with request.urlopen(req,timeout=25) as response:
      return response.status,response.headers,response.read(2048)
  except error.HTTPError as exc:return exc.code,exc.headers,exc.read(2048)
for name,lock in services:
  s,h,b=call(name,"OPTIONS")
  assert s==204 and h.get("Access-Control-Allow-Origin")==qa,(name,s,b)
  print("PASS",name,"local OPTIONS")
  s,h,b=call(name,"OPTIONS",origin="https://baeguindex.com")
  assert s==403 and not h.get("Access-Control-Allow-Origin"),(name,s,b)
  print("PASS",name,"production origin blocked")
  s,h,b=call(name,"POST",origin=None)
  assert s==403 and not h.get("Access-Control-Allow-Origin"),(name,s,b)
  print("PASS",name,"no-Origin blocked")
  s,h,b=call(name,"GET")
  assert s==405,(name,s,b)
  print("PASS",name,"GET blocked")
  s,h,b=call(name,"POST")
  assert s==503 and json.loads(b).get("error")==lock,(name,s,b)
  print("PASS",name,"no private PIN/reviewer data exposed while locked")
print("PASS: no writes to staging or production, 3 locked rollout gates verified")
