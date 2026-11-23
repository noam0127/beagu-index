#!/usr/bin/env python3
"""Offline fail-closed tests of real Render SHA and CORS checker."""
import importlib.util
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("check_render",root/"scripts/staging/check-render-live-sha-cors.py")
checker=importlib.util.module_from_spec(spec);spec.loader.exec_module(checker)
ORIGIN="https://qa-preview.onrender.com"; SHA="b"*40
def pages(sha=SHA):
    s={
     "/beagu-preview-health.json":(200,{"content-type":"application/json","access-control-allow-origin":"*"},
       '{"schema":1,"kind":"standalone-staging","hosting":"independent-static","staging_sha":"'+sha+'","supabase_ref":"ycwuugggqbunlbwuzvbx"}'),
     "/beagu-staging-navigation-guard.js":(200,{"content-type":"application/javascript"},"STAGE_SUPABASE beagu-release-"),
     "/js/supabase-config.js":(200,{"content-type":"application/javascript"},"ycwuugggqbunlbwuzvbx"),
     "/robots.txt":(200,{"content-type":"text/plain"},"Disallow: /"),
    }
    for p in checker.site.PAGES:
        body="beagu-staging-watermark"
        if p=="/admin-updates.html":body+=" 업데이트 관리 · 읽기 전용"
        s[p]=(200,{"content-type":"text/html","x-robots-tag":"noindex",
           "content-security-policy":"connect-src https://ycwuugggqbunlbwuzvbx.supabase.co"},body)
    return s
def cors(origin,slug):
    assert slug in checker.FUNCTIONS
    return 204,{"access-control-allow-origin":origin,
      "access-control-allow-methods":"POST,OPTIONS",
      "access-control-allow-headers":"authorization,content-type,x-beagu-session,x-beagu-level-session",
      "vary":"Origin"}
p=pages()
assert checker.check(ORIGIN,SHA,lambda o,path:p[path],cors)==14
def blocked(desc,what,fragment):
    try:what()
    except (AssertionError,ValueError) as exc:
        assert fragment in str(exc),(desc,str(exc))
        print("PASS blocked "+desc)
    else:raise AssertionError("Unsafe live host passed: "+desc)
blocked("stale SHA",lambda:checker.check(ORIGIN,SHA,lambda o,path:pages("a"*40)[path],cors),"incorrect SHA")
blocked("missing deployment",lambda:checker.check(ORIGIN,SHA,lambda o,path:(404,{},''),cors),"Health marker")
def fallback(o,s):
    code,headers=cors(o,s);headers["access-control-allow-origin"]="https://baeguindex.com";return code,headers
blocked("production CORS fallback",lambda:checker.check(ORIGIN,SHA,lambda o,path:p[path],fallback),"exact Render Origin")
def wildcard(o,s):
    code,headers=cors(o,s);headers["access-control-allow-origin"]="*";return code,headers
blocked("wildcard CORS",lambda:checker.check(ORIGIN,SHA,lambda o,path:p[path],wildcard),"exact Render Origin")
def no_header(o,s):
    code,headers=cors(o,s);headers["access-control-allow-headers"]="content-type";return code,headers
blocked("missing auth CORS",lambda:checker.check(ORIGIN,SHA,lambda o,path:p[path],no_header),"missing CORS request headers")
blocked("untrusted URL",lambda:checker.check("https://example.org",SHA,lambda o,path:p[path],cors),"Render HTTPS")
print("PASS offline SHA/CORS contract. NOT PROVEN: live Render service exists.")
