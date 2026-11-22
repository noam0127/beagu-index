#!/usr/bin/env python3
"""Trigger one-shot staging Auth test; no secrets or user inputs."""
import json
import sys
import urllib.error
import urllib.request
URL="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-stage35-lv3-once"
assert "snvzwrexuqavnfvzgxqj" not in URL and "baeguindex.com" not in URL
req=urllib.request.Request(URL,method="POST",
   data=b'{}',headers={"Content-Type":"application/json","Accept":"application/json"})
try:
    with urllib.request.urlopen(req,timeout=105) as resp:
        status=resp.status
        data=resp.read(1600)
except urllib.error.HTTPError as err:
    status=err.code
    data=err.read(1600)
except (TimeoutError,urllib.error.URLError) as err:
    sys.exit("STAGE35_BLOCKED: isolated staging invocation failed: "+type(err).__name__)
try: obj=json.loads(data)
except (ValueError,UnicodeDecodeError):obj={}
print("STAGE35_AUTH_AB: HTTP",status,
      "status",obj.get("status","unknown"),
      "checks_passed",obj.get("checks_passed",0),
      "cleanup_ok",obj.get("cleanup_ok",False),
      "reason",str(obj.get("reason","unknown"))[:85])
if status!=200 or obj.get("status")!="PASS" or obj.get("checks_passed")!=15 or obj.get("cleanup_ok") is not True:
    sys.exit("STAGE35_BLOCKED: genuine staging A/B Auth verification incomplete.")
print("PASS: two real Auth JWTs: 8 identity/admin checks and 7 Lv3 eligibility/revocation checks.")
print("SCOPE: staging Lv3 Auth+earned visitor proof; production data release and MFA still unverified.")
