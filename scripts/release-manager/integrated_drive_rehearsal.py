"""Explicit Mac-only synthetic Drive round trip. No production database or deployment.

Generate the only accepted payload internally: a tiny SQLite fixture. A fresh
test-only encryption key is used, not the retained production-intended key.
Only one create session is allowed per invocation. No update/delete/retry.
"""
import argparse
import http.client
import json
import os
import pathlib
import sqlite3
import ssl
import tempfile
import uuid
from urllib.parse import urlsplit,parse_qs
import integrated_drive_setup as setup
import integrated_drive_checkpoint as drive
import integrated_vault as vault

require=setup.require
PINS=("a"*64,"b"*40,"c"*40)
ROWS=((1,"synthetic-a",7),(2,"synthetic-b",12),(3,"synthetic-c",0))
KEY_ID="drive-synthetic-rehearsal-v1"
MAX_FIXTURE=512*1024
# Only static internal error codes may be emitted. Never echo exception text.
SAFE_ERRORS=frozenset(["credential_inside_checkout_or_link","credential_size_changed","drive_checkpoint_changed","drive_folder_not_writable","drive_invalid_upload_session","drive_live_transport_disabled","drive_metadata_unconfirmed","drive_not_folder","drive_not_private","drive_owner_mismatch","drive_permissions_not_private","drive_upload_id_missing","drive_upload_metadata_mismatch","drive_upload_outcome_uncertain","drive_upload_readback_mismatch","drive_upload_session_unconfirmed","duplicate_vault_key","explicit_fixture_upload_required","fixture_create_denied","fixture_endpoint_denied","fixture_integrity_failure","fixture_network_or_outcome_uncertain","fixture_object_sha256","fixture_put_denied","fixture_readback_repeated","fixture_remote_bytes_missing","fixture_response_too_large","fixture_restore_mismatch","fixture_restore_verified","fixture_rows","fixture_rows_changed","fixture_too_large","fixture_verified","invalid_drive_file_id","invalid_drive_metadata","invalid_drive_path","invalid_drive_pins","invalid_drive_token","invalid_fixture_transport","invalid_key_descriptor","invalid_oauth_access","invalid_oauth_client","invalid_oauth_credential","invalid_oauth_response","invalid_private_oauth_config","invalid_release_pins","invalid_vault_fingerprint","invalid_vault_format","invalid_vault_header","invalid_vault_key","invalid_vault_key_length","invalid_vault_manifest","invalid_vault_manifest_size","invalid_vault_payload","invalid_vault_pin","invalid_vault_scope","missing_independent_vault_pin","oauth_config_required","oauth_refresh_denied","oauth_scope_or_expiry_not_verified","oauth_scope_verified","setup_endpoint_denied","setup_network_unavailable","setup_ready","setup_response_too_large","stale_or_tampered_vault","unsafe_credential_directory","unsafe_credential_file","unsafe_key_descriptor","unsafe_vault_directory","unsafe_vault_object","vault_authentication_failed","vault_checkpoint_mismatch","vault_dump_integrity_failure","vault_header_mismatch","vault_header_too_large","vault_manifest_pin_mismatch","vault_manifest_too_large","vault_object_too_large","vault_release_mismatch","vault_size_mismatch"])

def error_code(exc):
    if isinstance(exc,ValueError) and len(exc.args)==1 and isinstance(exc.args[0],str) and exc.args[0] in SAFE_ERRORS:return exc.args[0]
    if isinstance(exc,sqlite3.Error):return "local_sqlite_error"
    if isinstance(exc,OSError):return "local_io_error"
    return "unclassified_error"

class FixtureTransport:
    """Bounded TLS transport for one generated synthetic ciphertext only."""
    def __init__(self,folder,raw,connection=http.client.HTTPSConnection):
        require(drive.valid_id(folder) and isinstance(raw,bytes) and 0<len(raw)<=MAX_FIXTURE and raw.startswith(vault.MAGIC),"invalid_fixture_transport")
        self.folder,self.raw,self.connection=folder,raw,connection
        self.file_id=None;self.session=None;self.posted=False;self.put=False;self.downloaded=None
    def request(self,host,method,path,headers,body=None):
        u=urlsplit(path)
        require(host==drive.HOST and not u.scheme and not u.netloc and not u.fragment,"fixture_endpoint_denied")
        q=parse_qs(u.query,keep_blank_values=True)
        require(all(len(x)==1 for x in q.values()),"fixture_endpoint_denied")
        allowed_ids={self.folder}
        if self.file_id:allowed_ids.add(self.file_id)
        if method=="GET":
            allowed=any(u.path in (drive.API+"/"+f,drive.API+"/"+f+"/permissions") for f in allowed_ids) and body is None and set(q)<=set(("fields","pageSize"))
            media=self.file_id is not None and u.path==drive.API+"/"+self.file_id and q=={"alt":["media"]} and body is None
            require(allowed or media,"fixture_endpoint_denied")
        elif method=="POST":
            require(not self.posted and u.path==drive.UPLOAD and q=={"uploadType":["resumable"],"fields":[drive.FIELDS]} and body==vault.canonical({"name":vault.digest(self.raw)+".vault","parents":[self.folder],"mimeType":drive.MIME}) and headers.get("X-Upload-Content-Length")==str(len(self.raw)),"fixture_create_denied")
            self.posted=True
        elif method=="PUT":
            require(self.posted and not self.put and self.session==path and u.path==drive.UPLOAD and body==self.raw,"fixture_put_denied")
            self.put=True
        else:raise ValueError("fixture_endpoint_denied")
        conn=self.connection(host,timeout=45,context=ssl.create_default_context())
        try:
            conn.request(method,path,body=body,headers=headers)
            res=conn.getresponse();raw=res.read(1024*1024+1)
            require(len(raw)<=1024*1024,"fixture_response_too_large")
            h={}
            if method=="POST" and res.status==200:
                location=res.getheader("Location")
                require(isinstance(location,str) and len(location)<=8192,"drive_invalid_upload_session")
                p=urlsplit(location)
                require(p.scheme=="https" and p.netloc==drive.HOST and p.path==drive.UPLOAD and not p.fragment,"drive_invalid_upload_session")
                self.session=p.path+"?"+p.query;h["Location"]=location
            if method=="PUT" and res.status in (200,201):
                m=vault.parse(raw);fid=m.get("id")
                require(drive.valid_id(fid) and fid!=self.folder,"drive_upload_id_missing")
                self.file_id=fid
            if method=="GET" and media and res.status==200:
                require(self.downloaded is None,"fixture_readback_repeated")
                self.downloaded=raw
            return res.status,h,raw
        except (OSError,http.client.HTTPException):
            raise ValueError("fixture_network_or_outcome_uncertain") from None
        finally:conn.close()

def fingerprint(db):
    with sqlite3.connect(str(db)) as conn:
        require(conn.execute("PRAGMA integrity_check").fetchall()==[("ok",)],"fixture_integrity_failure")
        schema=conn.execute("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
        rows=conn.execute("SELECT id,label,value FROM fixture ORDER BY id").fetchall()
        require(tuple(rows)==ROWS,"fixture_rows_changed")
        return {"row_count":len(rows),"sha256":vault.digest(vault.canonical({"schema":schema,"rows":rows}))}

def rehearsal(parent,c,transport_factory=FixtureTransport,refresh_transport=None,*,preflight_only=False,state=None):
    state={} if state is None else state
    state["phase"]="local_fixture"
    # Only a fresh fixture created here can reach the network. No path to
    # a real DB, SQL import, user-supplied payload, or production key.
    setup.validate_config(c)
    parent=setup.private_parent(pathlib.Path(parent)/"placeholder").parent
    with tempfile.TemporaryDirectory(prefix="drive-fixture-",dir=parent) as tmp:
        root=pathlib.Path(tmp);source=root/"source.sqlite"
        with sqlite3.connect(str(source)) as conn:
            conn.execute("CREATE TABLE fixture(id INTEGER PRIMARY KEY,label TEXT NOT NULL,value INTEGER NOT NULL)")
            conn.executemany("INSERT INTO fixture VALUES(?,?,?)",ROWS)
        source_fp=fingerprint(source);data=source.read_bytes()
        key=os.urandom(32)
        manifest={"schema":1,"scope":vault.SCOPE,"checkpoint_id":uuid.uuid4().hex,"plan_sha256":PINS[0],"base_sha":PINS[1],"candidate_sha":PINS[2],"dump_sha256":vault.digest(data),"dump_size":len(data),"fingerprint":source_fp}
        send=root/"send";send.mkdir(mode=0o700)
        pin=vault.seal(send,key,KEY_ID,manifest,data,*PINS)
        encrypted=vault.read_private(send,pin["checkpoint_id"]+".vault")
        require(len(encrypted)<=MAX_FIXTURE,"fixture_too_large")
        state["phase"]="oauth_refresh"
        refresh_transport=refresh_transport or setup.SetupHTTPS(c["folder_id"])
        token=setup.refresh_access(c,refresh_transport)
        state["phase"]="folder_preflight"
        if preflight_only:
            adapter=drive.DriveCheckpoint(c["folder_id"],c["owner_permission_id"],refresh_transport)
            folder=adapter.verify_folder(token,write=True)
            return {"local_fixture_verified":True,"oauth_scope_verified":True,"folder_private":folder["folder_private"],"folder_add_capability_observed":folder["write_capability_observed"],"upload_attempted":False,"execution_enabled":False}
        state["phase"]="drive_transfer"
        transport=transport_factory(c["folder_id"],encrypted)
        adapter=drive.DriveCheckpoint(c["folder_id"],c["owner_permission_id"],transport)
        state["upload_may_be_attempted"]=True
        receipt=adapter.transfer_fixture(send,key,KEY_ID,pin,*PINS,token,token)
        # The restore input must be the actual downloaded bytes, not local copy.
        state["phase"]="downloaded_fixture_restore"
        downloaded=transport.downloaded
        require(isinstance(downloaded,bytes) and vault.digest(downloaded)==pin["object_sha256"],"fixture_remote_bytes_missing")
        receive=root/"receive";receive.mkdir(mode=0o700)
        vault.write_exclusive(receive,pin["checkpoint_id"]+".vault",downloaded)
        m,restored=vault.unseal(receive,key,KEY_ID,pin,*PINS)
        dest=root/"restored.sqlite"
        vault.write_exclusive(root,dest.name,restored)
        require(m["fingerprint"]==source_fp==fingerprint(dest)==fingerprint(source),"fixture_restore_mismatch")
        return {"scope":"synthetic_sqlite_only","encrypted_upload_verified":receipt["readback_verified"],"download_verified":True,"fixture_restore_verified":True,"fixture_rows":len(ROWS),"fixture_object_sha256":pin["object_sha256"],"actual_postgresql_remote_restore_verified":False,"production_backup_executed":False,"independent_observer_verified":False,"execution_enabled":False}

def main():
    p=argparse.ArgumentParser(description="Upload one small encrypted synthetic fixture, download and restore locally")
    p.add_argument("--oauth-file",required=True)
    p.add_argument("--key-file",required=True,help="Check existing key only; fixture uses separate temporary key")
    group=p.add_mutually_exclusive_group(required=True)
    group.add_argument("--confirm-synthetic-upload",action="store_true")
    group.add_argument("--preflight-only",action="store_true",help="Local fixture and read-only Google folder checks; no upload")
    a=p.parse_args()
    state={"phase":"local_credentials"}
    try:
        setup.key_file(a.key_file)
        c=setup.read_config(a.oauth_file)
        result=rehearsal(pathlib.Path(a.oauth_file).absolute().parent,c,preflight_only=a.preflight_only,state=state)
        print(json.dumps(result,sort_keys=True))
    except (ValueError,OSError,KeyError,TypeError,sqlite3.Error) as exc:
        print(json.dumps({"fixture_verified":False,"phase":state["phase"],"reason":error_code(exc),"remote_object_may_exist":bool(state.get("upload_may_be_attempted")),"execution_enabled":False}))
        raise SystemExit(1) from None
if __name__=="__main__":main()
