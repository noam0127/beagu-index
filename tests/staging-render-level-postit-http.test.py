#!/usr/bin/env python3
"""No-write live Stage Edge CORS tests for 4 critical browser APIs.
Reject production, unknown Render host, missing Origin; allow localhost only.
Never create users, send participation codes, verify login or write DB rows.
"""
import json
from urllib import error,request

BASE="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/"
APIS={
 "beagu-level-api":("POST",{"content-type","x-beagu-session","authorization"}),
 "beagu-postit-api-v1":("GET",{"content-type","x-beagu-level-session","authorization"}),
 "beagu-perf-ingest-v1":("POST",{"content-type"}),
 "beagu-2026-review-admin":("POST",{"content-type","authorization"}),
}
SAFE="http://localhost:8000"

def call(name,method="OPTIONS",origin=SAFE,path=""):
 h={
  "Access-Control-Request-Method":"POST",
  "Access-Control-Request-Headers":"authorization,content-type,x-beagu-session,x-beagu-level-session",
  "Cache-Control":"no-store",
 }
 if origin is not None:h["Origin"]=origin
 r=request.Request(BASE+name+path,method=method,headers=h)
 try:
  with request.urlopen(r,timeout=25) as v:
   return v.status,{k.lower():val for k,val in v.headers.items()},v.read(2048)
 except error.HTTPError as e:
  return e.code,{k.lower():val for k,val in e.headers.items()},e.read(2048)

for name,(method,required) in APIS.items():
 status,head,_=call(name)
 assert status==204,(name,"local preflight",status)
 assert head.get("access-control-allow-origin")==SAFE,(name,"localhost CORS",head)
 methods={v.strip().upper() for v in head.get("access-control-allow-methods","").split(",")}
 assert method in methods,(name,"missing method",methods)
 allowed={v.strip().lower() for v in head.get("access-control-allow-headers","").split(",")}
 assert required.issubset(allowed),(name,"missing headers",required-allowed)
 assert "origin" in head.get("vary","").lower(),(name,"Vary Origin missing")
 print("PASS LOCAL ORIGIN",name,method)
 for bad in ("https://baeguindex.com","https://www.baeguindex.com",
             "https://forged-baegu-preview.onrender.com",None):
  status,head,_=call(name,origin=bad)
  assert status==403,(name,"wrong Origin",bad,status)
  assert not head.get("access-control-allow-origin"),(name,"unexpected CORS on denial",bad,head)
 print("PASS DENY production/unknown Render/no-Origin",name)

# Confirm the newly replaced security-sensitive handlers still deny without
# any session. These are negative reads only and must not consume login quota.
status,head,body=call("beagu-level-api",method="GET")
assert status==405 and json.loads(body).get("error")=="METHOD_NOT_ALLOWED",(status,body)
status,head,body=call("beagu-postit-api-v1",method="GET",path="?action=writer_status")
assert status==403 and json.loads(body).get("error")=="LEVEL_REQUIRED",(status,body)
print("PASS unchanged level/posts access denies without session")
print("NO WRITES; actual Render host and verified Lv3/MFA still not tested")
