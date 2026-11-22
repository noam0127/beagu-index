#!/usr/bin/env python3
"""Offline contract tests for scripts/verify-render-preview.py."""
import importlib.util
from pathlib import Path

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("render_checker",root/"scripts/verify-render-preview.py")
checker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

ORIGIN="https://baegu-index-v110-sandbox.onrender.com"
SHA="a"*40
CSP=("default-src 'self'; script-src 'self'; connect-src 'self' "
     "https://ycwuugggqbunlbwuzvbx.supabase.co")
json_head='{"schema":1,"kind":"standalone-staging","hosting":"independent-static",' \
          '"staging_sha":"'+SHA+'","supabase_ref":"ycwuugggqbunlbwuzvbx"}'

def response_map():
    map_={
        "/beagu-preview-health.json":(200,{"content-type":"application/json",
              "access-control-allow-origin":"*"},json_head),
        "/beagu-staging-navigation-guard.js":(200,{"content-type":"application/javascript"},
               'const STAGE_SUPABASE="ycwuugggqbunlbwuzvbx"; /* beagu-release- */'),
        "/js/supabase-config.js":(200,{"content-type":"application/javascript"},
                'const SITE_URL="https://ycwuugggqbunlbwuzvbx.supabase.co";'),
        "/robots.txt":(200,{"content-type":"text/plain"},"User-agent: *\nDisallow: /\n")
    }
    for path in checker.PAGES:
        body='<html><head></head><body id="beagu-staging-watermark"></body></html>'
        if path=="/admin-updates.html":
            body='<html><body id="beagu-staging-watermark">업데이트 관리 · 읽기 전용</body></html>'
        map_[path]=(200,{"content-type":"text/html; charset=utf-8",
                    "x-robots-tag":"noindex, nofollow",
                    "content-security-policy":CSP},body)
    return map_

def assert_fails(description, edits, snippet):
    cases=response_map()
    edits(cases)
    try:
        checker.check(ORIGIN,SHA,lambda origin,path: cases[path])
    except (AssertionError, ValueError) as err:
        assert snippet in str(err), description+": "+str(err)
        print("PASS: blocked "+description)
    else:
        raise AssertionError("Allowed dangerous state: "+description)

baseline=response_map()
assert checker.check(ORIGIN,SHA,lambda origin,path: baseline[path])==10
assert checker.valid_origin(ORIGIN+"/")==ORIGIN
for bad in ("http://"+ORIGIN[8:], "https://baeguindex.com",
            "https://example.onrender.com.evil.com", "https://onrender.com",
            ORIGIN+"/admin-updates.html", ORIGIN+"?cookie=1", ORIGIN+"#x",
            "https://user:pass@baegu-index-v110-sandbox.onrender.com"):
    try:checker.valid_origin(bad)
    except ValueError:pass
    else:raise AssertionError("Accepted unsafe Render URL: "+bad)
print("PASS: HTTPS Render-origin and redirect-safe URL validation")

assert_fails("wrong staging sha",
    lambda q:q.__setitem__("/beagu-preview-health.json",(200,
      q["/beagu-preview-health.json"][1],json_head.replace(SHA,"b"*40))),
    "incorrect SHA")
assert_fails("missing CORS",
    lambda q:q["/beagu-preview-health.json"][1].pop("access-control-allow-origin"),
    "Health CORS")
assert_fails("missing pages",
    lambda q:q.__setitem__("/challenge.html",(404,q["/challenge.html"][1],"not found")),
    "not deployed")
assert_fails("missing production isolation header",
    lambda q:q["/"][1].pop("content-security-policy"),
    "CSP")
assert_fails("production backend leak",
    lambda q:q.__setitem__("/js/supabase-config.js",(200,
      q["/js/supabase-config.js"][1],
      'const SITE_URL="https://snvzwrexuqavnfvzgxqj.supabase.co";')),
    "Production Supabase")
assert_fails("writable release surface",
    lambda q:q.__setitem__("/admin-updates.html",(200,
      q["/admin-updates.html"][1],
      '<html id="beagu-staging-watermark">업데이트 관리 · 읽기 전용 '
      '<button id="releaseProdApply">deploy</button></html>')),
    "Privileged control")
print("PASS: offline mock rejects stale SHA, CORS, 404, CSP, DB leak and release writes")
