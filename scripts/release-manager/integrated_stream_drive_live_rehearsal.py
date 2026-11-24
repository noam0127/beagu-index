"""One explicit local synthetic PG17 large Drive rehearsal; never production.
No arbitrary dump, DB URL, credential expansion, update, delete or retry.
A private no-replace attempt record prevents repeat create across invocations.
"""
import argparse
import hashlib
import http.client
import json
import os
import pathlib
import ssl
import subprocess
from urllib.parse import urlsplit,parse_qs
import integrated_stream_pg_fixture as pg
import integrated_stream_drive_fixture as protocol
import integrated_stream_fixture as s
import integrated_drive_setup as setup
import integrated_drive_checkpoint as d
import integrated_vault as v

MARKER="large-pg17-fixture-attempt.json"
RECOVERY_MARKER="large-pg17-fixture-recovery-attempt.json"
PROBE_MARKER="large-pg17-session-probe-attempt.json"
DIAGNOSED_MARKER="large-pg17-fixture-diagnosed-attempt.json"
MAX_LIVE=200*1024**2
require=v.require
class LocalFixtureHTTPS:
    def __init__(self,folder,source,pin,registry,connection=http.client.HTTPSConnection,*,marker=MARKER):
        require(d.valid_id(folder) and pin["scope"]==s.SCOPE and pin["key_id"]==pg.KEY_ID and (pin["plan_sha256"],pin["base_sha"],pin["candidate_sha"])==pg.PINS,"large_fixture_pin_invalid")
        self.folder,self.connection,self.registry=folder,connection,registry
        self.marker=marker
        self.digest=pin["object_sha256"]
        self.hashes=[];self.total=0
        with s.input_object(source,pin["checkpoint_id"]+".stream") as f:
            allhash=hashlib.sha256()
            while True:
                raw=f.read(protocol.UPLOAD_CHUNK)
                if not raw:break
                self.total+=len(raw);allhash.update(raw);self.hashes.append(v.digest(raw))
        require(128*1024**2<self.total<=MAX_LIVE and allhash.hexdigest()==self.digest,"large_fixture_size_or_digest")
        self.meta=v.canonical({"name":self.digest+".stream","parents":[folder],"mimeType":d.MIME})
        self.posted=False;self.session=None;self.file_id=None;self.offset=0
    def request(self,host,method,path,headers,body=None):
        u=urlsplit(path);q=parse_qs(u.query,keep_blank_values=True)
        require(host==d.HOST and not u.scheme and not u.netloc and not u.fragment and not any(c in path for c in "\r\n") and all(len(x)==1 for x in q.values()),"large_fixture_endpoint_denied")
        media=False
        if method=="GET":
            ids={self.folder}
            if self.file_id:ids.add(self.file_id)
            ordinary=any(u.path in (d.API+"/"+f,d.API+"/"+f+"/permissions") for f in ids) and set(q)<=set(("fields","pageSize"))
            media=self.file_id is not None and u.path==d.API+"/"+self.file_id and q=={"alt":["media"]}
            require(body is None and (ordinary or media),"large_fixture_endpoint_denied")
            if media:
                import re
                m=re.fullmatch(r"bytes=(\d+)-(\d+)",headers.get("Range",""))
                require(m is not None,"large_fixture_range_denied")
                a,b=map(int,m.groups())
                require(0<=a<=b<self.total and b-a+1<=protocol.UPLOAD_CHUNK,"large_fixture_range_denied")
        elif method=="POST":
            require(not self.posted and u.path==d.UPLOAD and q=={"uploadType":["resumable"]} and body==self.meta and headers.get("X-Upload-Content-Length")==str(self.total) and headers.get("X-Upload-Content-Type")==d.MIME,"large_fixture_create_denied")
            v.write_exclusive(self.registry,self.marker,v.canonical({"scope":"synthetic_large_pg17_attempt","object_sha256":self.digest,"bytes":self.total,"execution_enabled":False}))
            self.posted=True
        elif method=="PUT":
            n=min(protocol.UPLOAD_CHUNK,self.total-self.offset)
            require(self.posted and self.session is not None and path==self.session and n>0 and isinstance(body,bytes) and len(body)==n and v.digest(body)==self.hashes[self.offset//protocol.UPLOAD_CHUNK] and headers.get("Content-Length")==str(n) and headers.get("Content-Range")==f"bytes {self.offset}-{self.offset+n-1}/{self.total}","large_fixture_put_denied")
        else:raise ValueError("large_fixture_endpoint_denied")
        conn=self.connection(host,timeout=90,context=ssl.create_default_context())
        try:
            conn.request(method,path,body=body,headers=headers)
            res=conn.getresponse();limit=protocol.UPLOAD_CHUNK if media else 1024*1024
            raw=res.read(limit+1)
            require(len(raw)<=limit,"large_fixture_response_limit")
            h={k.lower():val for k,val in res.getheaders()}
            if method=="POST" and res.status==200:
                self.session=protocol.session_path(h.get("location"))
            if method=="PUT":
                if self.offset+n<self.total:
                    require(res.status==308 and h.get("range")==f"bytes=0-{self.offset+n-1}","stream_upload_ack_uncertain")
                else:
                    require(res.status in (200,201),"stream_upload_completion_uncertain")
                    fid=v.parse(raw).get("id")
                    require(d.valid_id(fid) and fid!=self.folder,"stream_file_id_invalid")
                    self.file_id=fid
                self.offset+=n
            return res.status,h,raw
        except (OSError,http.client.HTTPException):
            raise ValueError("large_fixture_network_uncertain") from None
        finally:conn.close()

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--oauth-file",required=True)
    p.add_argument("--key-file",required=True)
    p.add_argument("--confirm-large-pg-fixture-upload",required=True,action="store_true")
    group=p.add_mutually_exclusive_group()
    group.add_argument("--retry-after-session-rejection",action="store_true",help="Original one-time recovery; no reuse")
    group.add_argument("--retry-after-session-diagnosis",action="store_true",help="One explicit post-diagnosis synthetic attempt only after operator reconciliation")
    a=p.parse_args()
    phase="local_credentials";registry=None;marker=DIAGNOSED_MARKER if a.retry_after_session_diagnosis else (RECOVERY_MARKER if a.retry_after_session_rejection else MARKER)
    try:
        setup.key_file(a.key_file)
        c=setup.read_config(a.oauth_file)
        registry=setup.private_parent(a.oauth_file).parent
        require(not os.path.lexists(registry/DIAGNOSED_MARKER),"large_fixture_attempt_already_recorded")
        if a.retry_after_session_diagnosis:
            for name in (MARKER,RECOVERY_MARKER):
                prior=v.parse(v.read_private(registry,name))
                require(isinstance(prior,dict) and set(prior)=={"scope","object_sha256","bytes","execution_enabled"} and prior["scope"]=="synthetic_large_pg17_attempt" and v.match(v.HASH,prior["object_sha256"]) and type(prior["bytes"]) is int and 128*1024**2<prior["bytes"]<=MAX_LIVE and prior["execution_enabled"] is False,"large_fixture_prior_attempt_invalid")
            probe=v.parse(v.read_private(registry,PROBE_MARKER))
            require(probe=={"scope":"synthetic_session_probe_only","media_upload_attempted":False,"execution_enabled":False},"large_fixture_prior_attempt_invalid")
        elif a.retry_after_session_rejection:
            require(not os.path.lexists(registry/RECOVERY_MARKER),"large_fixture_attempt_already_recorded")
            prior=v.parse(v.read_private(registry,MARKER))
            require(isinstance(prior,dict) and set(prior)=={"scope","object_sha256","bytes","execution_enabled"} and prior["scope"]=="synthetic_large_pg17_attempt" and v.match(v.HASH,prior["object_sha256"]) and type(prior["bytes"]) is int and 128*1024**2<prior["bytes"]<=MAX_LIVE and prior["execution_enabled"] is False,"large_fixture_prior_attempt_invalid")
        else:
            require(not os.path.lexists(registry/MARKER) and not os.path.lexists(registry/RECOVERY_MARKER) and not os.path.lexists(registry/PROBE_MARKER),"large_fixture_attempt_already_recorded")
        phase="local_pg_fixture"
        def transfer(source,dest,pin):
            nonlocal phase
            phase="oauth_refresh"
            token=setup.refresh_access(c,setup.SetupHTTPS(c["folder_id"]))
            phase="large_drive_transfer"
            transport=LocalFixtureHTTPS(c["folder_id"],source,pin,registry,marker=marker)
            result=protocol._transfer(source,dest,pin,transport,c["folder_id"],c["owner_permission_id"],token)
            phase="downloaded_pg_restore"
            return result
        result=pg.rehearsal(registry,transfer_generated=transfer)
        print(json.dumps({**result,"scope":"synthetic_pg17_stream_actual_drive_only","actual_drive_transfer_verified":True,"independent_observer_verified":False,"production_backup_executed":False},sort_keys=True))
    except (ValueError,OSError,KeyError,TypeError,RuntimeError,subprocess.SubprocessError) as exc:
        # Fixed diagnostic only: no raw provider errors, credentials, or session URL.
        safe={"large_fixture_attempt_already_recorded","stream_session_invalid","stream_session_format_invalid","stream_session_origin_invalid","stream_session_query_invalid","stream_session_parameter_invalid","stream_session_id_invalid","stream_session_credential_invalid","large_fixture_prior_attempt_invalid","large_fixture_network_uncertain","stream_upload_ack_uncertain","stream_upload_completion_uncertain","stream_remote_range_mismatch","stream_remote_metadata_mismatch","stream_remote_digest_mismatch","oauth_refresh_denied"}
        reason=str(exc) if isinstance(exc,ValueError) and str(exc) in safe else "large_fixture_check_failed"
        print(json.dumps({"fixture_verified":False,"phase":phase,"reason":reason,"remote_object_may_exist":registry is not None and os.path.lexists(registry/marker),"execution_enabled":False}))
        raise SystemExit(1) from None
if __name__=="__main__":main()
