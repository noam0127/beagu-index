#!/usr/bin/env python3
"""Live NO-WRITE staging referral HTTP contract. No referral credentials."""
from urllib import request,error
import json
base="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/"
qa="http://localhost:8000"
def call(name,method,origin=qa):
 h={}
 if origin is not None:h["Origin"]=origin
 if method=="POST":h["Content-Type"]="application/json"
 req=request.Request(base+name,headers=h,data=b'{}' if method=="POST" else None,method=method)
 try:
  with request.urlopen(req,timeout=25) as response:
   return response.status,response.headers,response.read(2048)
 except error.HTTPError as exc:return exc.code,exc.headers,exc.read(2048)
for name in ("beagu-referral-link-v1","beagu-referral-checkin-v1"):
 s,h,b=call(name,"OPTIONS")
 assert s==204 and h.get("Access-Control-Allow-Origin")==qa,(name,s,b)
 print("PASS",name,"local preflight")
 s,h,b=call(name,"OPTIONS",origin="https://baeguindex.com")
 assert s==403 and not h.get("Access-Control-Allow-Origin"),(name,s,b)
 print("PASS",name,"production origin forbidden")
 s,h,b=call(name,"POST",origin=None)
 assert s==403 and not h.get("Access-Control-Allow-Origin"),(name,s,b)
 print("PASS",name,"missing Origin forbidden")
 s,h,b=call(name,"GET")
 assert s==405,(name,s,b)
 print("PASS",name,"GET forbidden")
 s,h,b=call(name,"POST")
 assert s==503 and json.loads(b).get("error")=="REFERRAL_NOT_READY",(name,s,b)
 print("PASS",name,"referral rollout explicitly locked")
print("PASS no-write real HTTP: even malformed client requests cannot create referral")
