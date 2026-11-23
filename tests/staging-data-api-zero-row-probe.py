#!/usr/bin/env python3
"""Check Data API routing using ONLY a zero-row deny-all RLS staging probe.
Never use service-role secrets or access any private object.
"""
from pathlib import Path
from urllib import request,error
import re,json
base=Path(__file__).resolve().parents[1]
config=(base/"_standalone_staging/js/supabase-config.js").read_text()
assert "ycwuugggqbunlbwuzvbx" in config, "Not the verified staging bundle"
m=re.search(r"sb_publishable_[A-Za-z0-9_-]+",config)
assert m, "No public staging publishable key in sandbox bundle"
key=m.group(0)
url="https://ycwuugggqbunlbwuzvbx.supabase.co/rest/v1/beagu_stage_rest_route_probe_20261123?select=flag&limit=0"
req=request.Request(url,headers={"apikey":key,"Accept":"application/json"})
try:
  with request.urlopen(req,timeout=25) as response:
    status=response.status
    body=response.read(512)
except error.HTTPError as e:
  status=e.code
  body=e.read(512)
code="NONE"
try:
  j=json.loads(body)
  if isinstance(j,dict):
    code=str(j.get("code","NONE"))
except (json.JSONDecodeError,UnicodeDecodeError):
  pass
print("TEST STAGING EMPTY RLS-DENY TABLE /rest/v1 => HTTP",status,"PostgREST code",code)
if status!=200:
  raise SystemExit("BLOCKED: Data API route unavailable even for a zero-row granted probe table")
if body.strip()!=b'[]':
  raise SystemExit("SECURITY FAILURE: zero-row RLS deny-all probe exposed unexpected contents")
print("PASS: staging REST is enabled and honors deny-all RLS; investigate table-level cache")

# Additional read-only probe: despite ACL SELECT, deny-all RLS must return []
score_url="https://ycwuugggqbunlbwuzvbx.supabase.co/rest/v1/arcade_game_scores?select=id&limit=0"
req=request.Request(score_url,headers={"apikey":key,"Accept":"application/json"})
try:
  with request.urlopen(req,timeout=25) as response:
    score_status=response.status
    score_body=response.read(512)
except error.HTTPError as e:
  score_status=e.code
  score_body=e.read(512)
score_code="NONE"
try:
  sj=json.loads(score_body)
  if isinstance(sj,dict):score_code=str(sj.get("code","NONE"))
except (json.JSONDecodeError,UnicodeDecodeError):pass
print("ANON SCORE TABLE route:",score_status,"code:",score_code)
if score_status==200 and score_body.strip()!=b'[]':
  raise SystemExit("SECURITY FAILURE: a raw arcade row became visible")
