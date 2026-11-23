#!/usr/bin/env python3
"""Live no-write staging performance gateway API regression."""
from urllib import request,error
import json
URL="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-perf-ingest-v1"
QA="http://localhost:8000"
def call(method="POST",origin=QA,body=None,headers=None):
    h=dict(headers or {})
    if origin is not None:h["Origin"]=origin
    if body is not None:
        h["Content-Type"]="application/json"
    data=None if body is None else json.dumps(body).encode()
    req=request.Request(URL,method=method,data=data,headers=h)
    try:
        with request.urlopen(req,timeout=25) as response:
            return response.status,response.headers,response.read(2048)
    except error.HTTPError as e:
        return e.code,e.headers,e.read(2048)
def check(desc,status_expected,code_expected=None,**kw):
    status,headers,body=call(**kw)
    actual=json.loads(body) if body else {}
    assert status==status_expected and (code_expected is None or actual.get('error')==code_expected),(desc,status,actual)
    print("PASS",desc)
    return headers
h=check("local CORS preflight",204,method="OPTIONS")
assert h.get("Access-Control-Allow-Origin")==QA
h=check("production origin denied",403,"ORIGIN_NOT_ALLOWED",method="OPTIONS",origin="https://baeguindex.com")
assert not h.get("Access-Control-Allow-Origin")
h=check("missing origin denied",403,"ORIGIN_NOT_ALLOWED",method="OPTIONS",origin=None)
assert not h.get("Access-Control-Allow-Origin")
check("GET denied",405,"METHOD_NOT_ALLOWED",method="GET")
check("no content type denied",415,"JSON_REQUIRED")
check("auth bearer not accepted",403,"IDENTITY_BEARER_NOT_ACCEPTED",body={},
      headers={"Authorization":"Bearer any.jwt.token"})
for val in ({},{'visitor':'abc'},{'visitor':'f0000000-0000-4000-8000-000000000001',
        'page':'school-report','operation':'school_selection','duration_ms':115,'ok':True},
        {'visitor':'f0000000-0000-4000-8000-000000000001',
        'page':'index','operation':'navigation','duration_ms':120001,'ok':True}):
    check("invalid sample denied",400,"INVALID_SAMPLE",body=val)
print("PASS real HTTP no data writes; sample collection is not exercised by this test")
