#!/usr/bin/env python3
"""Live negative-only staging smoke, no personal data or authentication."""
from urllib import request,error
URL="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-school-culture-v1"
def call(method,origin=None,data=None):
    h={}
    if origin:h["Origin"]=origin
    if data is not None:h["Content-Type"]="application/json"
    req=request.Request(URL,headers=h,data=data,method=method)
    try:
        with request.urlopen(req,timeout=25) as resp:return resp.status,resp.headers
    except error.HTTPError as exc:return exc.code,exc.headers

origin="http://localhost:8000"
code,h=call("OPTIONS",origin)
assert code==204 and h.get("Access-Control-Allow-Origin")==origin,("preflight",code)
print("PASS allowed local QA preflight")
code,h=call("OPTIONS","https://baeguindex.com")
assert code==403 and not h.get("Access-Control-Allow-Origin"),("prod preflight",code)
print("PASS rejected production origin")
code,h=call("POST",origin,b'{"action":"batch","schoolIds":["TST9041"]}')
assert code==401 and h.get("Access-Control-Allow-Origin")==origin,("missing token",code)
print("PASS no-session data request denied")
code,h=call("GET",origin)
assert code==405,("method",code)
print("PASS GET blocked")
code,h=call("POST",None,b'{}')
assert code==403 and not h.get("Access-Control-Allow-Origin"),("missing origin",code)
print("PASS missing origin blocked")
print("LIVE NEGATIVE PASS: authorized data access/hosted login still NOT validated")
