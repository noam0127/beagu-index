"""One explicit synthetic upload-session diagnostic. Never sends media bytes.
Preserve both earlier attempt records. No PUT, DELETE, retries or DB access.
Report only bounded query key names and fixed diagnostics, never values or URI.
"""
import argparse
import http.client
import json
import pathlib
import re
import ssl
from urllib.parse import urlsplit,parse_qsl
import integrated_drive_setup as setup
import integrated_drive_checkpoint as d
import integrated_stream_drive_fixture as protocol
import integrated_vault as v

MARKER="large-pg17-session-probe-attempt.json"
PREVIOUS=("large-pg17-fixture-attempt.json","large-pg17-fixture-recovery-attempt.json")
SIZE=192*1024**2
SAFE_KEY=re.compile(r"[A-Za-z_][A-Za-z0-9_.-]{0,39}")
require=v.require

def describe(location):
    result={"location_present":isinstance(location,str) and bool(location),"origin_and_path_valid":False,"query_keys":[],"unknown_query_keys":[],"duplicate_query_keys":False,"unsafe_key_names_redacted":0,"current_parser_accepts":False}
    if not isinstance(location,str) or not 0<len(location)<=8192 or any(ord(c)<=32 or ord(c)>=127 for c in location):
        return result
    try:
        u=urlsplit(location)
        result["origin_and_path_valid"]=u.scheme=="https" and u.netloc==d.HOST and u.path==d.UPLOAD and not u.fragment
        if not result["origin_and_path_valid"]:return result
        pairs=parse_qsl(u.query,keep_blank_values=True,strict_parsing=True,max_num_fields=32)
    except ValueError:return result
    keys=[k for k,_ in pairs]
    safe=sorted({k for k in keys if SAFE_KEY.fullmatch(k)})
    result["query_keys"]=safe
    result["unknown_query_keys"]=[k for k in safe if k not in protocol.SESSION_KEYS]
    result["duplicate_query_keys"]=len(keys)!=len(set(keys))
    result["unsafe_key_names_redacted"]=sum(not SAFE_KEY.fullmatch(k) for k in keys)
    try:
        protocol.session_path(location)
        result["current_parser_accepts"]=True
    except ValueError:pass
    return result

def probe(c,registry,refresh_transport=None,connection=http.client.HTTPSConnection):
    setup.validate_config(c)
    registry=setup.private_parent(pathlib.Path(registry)/MARKER).parent
    for name in PREVIOUS:
        record=v.parse(v.read_private(registry,name))
        require(isinstance(record,dict) and record.get("scope")=="synthetic_large_pg17_attempt" and record.get("execution_enabled") is False,"probe_prior_attempt_missing")
    require(not (registry/MARKER).exists(),"probe_already_attempted")
    transport=refresh_transport or setup.SetupHTTPS(c["folder_id"])
    token=setup.refresh_access(c,transport)
    d.DriveCheckpoint(c["folder_id"],c["owner_permission_id"],transport).verify_folder(token,write=True)
    # Reserve a session for nonzero synthetic bytes that will never be sent.
    # No completed file should result from this POST alone.
    body=v.canonical({"name":"synthetic-session-diagnostic-no-media.stream","parents":[c["folder_id"]],"mimeType":d.MIME})
    v.write_exclusive(registry,MARKER,v.canonical({"scope":"synthetic_session_probe_only","media_upload_attempted":False,"execution_enabled":False}))
    conn=connection(d.HOST,timeout=45,context=ssl.create_default_context())
    try:
        conn.request("POST",d.UPLOAD+"?uploadType=resumable",body=body,headers={"Authorization":"Bearer "+token,"Content-Type":"application/json; charset=UTF-8","Content-Length":str(len(body)),"X-Upload-Content-Type":d.MIME,"X-Upload-Content-Length":str(SIZE)})
        res=conn.getresponse()
        raw=res.read(1024*1024+1)
        require(len(raw)<=1024*1024,"probe_response_too_large")
        headers=[val for k,val in res.getheaders() if k.lower()=="location"]
        return {"scope":"synthetic_session_probe_only","http_status":res.status,"session_created":res.status==200 and len(headers)==1,**describe(headers[0] if res.status==200 and len(headers)==1 else None),"media_upload_attempted":False,"production_backup_executed":False,"execution_enabled":False}
    finally:conn.close()

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--oauth-file",required=True)
    p.add_argument("--confirm-session-probe-only",action="store_true",required=True)
    a=p.parse_args()
    try:
        c=setup.read_config(a.oauth_file)
        result=probe(c,pathlib.Path(a.oauth_file).absolute().parent)
        print(json.dumps(result,sort_keys=True))
    except (ValueError,OSError,KeyError,TypeError,http.client.HTTPException):
        print(json.dumps({"probe_verified":False,"media_upload_attempted":False,"execution_enabled":False}))
        raise SystemExit(1) from None
if __name__=="__main__":main()
