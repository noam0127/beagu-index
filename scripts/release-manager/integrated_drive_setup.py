"""Explicit local setup-only Google OAuth/read-only folder preflight.
No production DB connection, export, upload, or operational worker activation.
Run from reviewed trusted checkout, never as a public CI credentialed job.
"""
import argparse
import http.client
import json
import os
import pathlib
import re
import ssl
import stat
from urllib.parse import urlencode,urlsplit,parse_qs
import integrated_drive_checkpoint as drive
import integrated_vault as vault

SCOPE="https://www.googleapis.com/auth/drive.file"
TOKEN_HOST="oauth2.googleapis.com"
TOKEN_PATH="/token"
MAX_RESPONSE=1024*1024
KEYS={"schema","folder_id","owner_permission_id","client_id","client_secret","refresh_token"}
ROOT=pathlib.Path(__file__).resolve().parents[2]

def require(ok,code):drive.require(ok,code)

def private_parent(path,repository_root=ROOT):
    p=pathlib.Path(path).absolute()
    parent=p.parent
    repo=pathlib.Path(repository_root).resolve(strict=True)
    require(parent.resolve(strict=True)==parent and parent!=repo and repo not in parent.parents and parent not in repo.parents,"credential_inside_checkout_or_link")
    st=parent.stat()
    require(stat.S_ISDIR(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700,"unsafe_credential_directory")
    return p

def read_config(path,repository_root=ROOT):
    p=private_parent(path,repository_root)
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,"rb") as f:
        s=os.fstat(f.fileno())
        require(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and stat.S_IMODE(s.st_mode)==0o600 and s.st_nlink==1 and 0<s.st_size<=32768,"unsafe_credential_file")
        raw=f.read(32769)
        require(len(raw)==s.st_size,"credential_size_changed")
    try:
        c=vault.parse(raw)
        validate_config(c)
        return c
    except (ValueError,TypeError,KeyError,UnicodeError):
        raise ValueError("invalid_private_oauth_config") from None

def validate_config(c):
    require(isinstance(c,dict) and set(c)==KEYS and type(c["schema"]) is int and c["schema"]==1,"invalid_private_oauth_config")
    require(drive.valid_id(c["folder_id"]) and drive.valid_id(c["owner_permission_id"]),"invalid_drive_pins")
    require(isinstance(c["client_id"],str) and re.fullmatch(r"[A-Za-z0-9_-]{1,200}\.apps\.googleusercontent\.com",c["client_id"]),"invalid_oauth_client")
    for k in ("client_secret","refresh_token"):
        require(isinstance(c[k],str) and 1<=len(c[k])<=8192 and not re.search(r"[\x00-\x20\x7f]",c[k]),"invalid_oauth_credential")

class SetupHTTPS:
    """Only token refresh and GET of the exact pinned folder/permissions.
    No upload, mutation, redirects, arbitrary hosts, retries or response logging.
    """
    def __init__(self,folder_id,connection=http.client.HTTPSConnection):
        require(drive.valid_id(folder_id),"invalid_drive_pins")
        self.folder,self.connection=folder_id,connection
    def request(self,host,method,path,headers,body=None):
        u=urlsplit(path)
        require(not u.scheme and not u.netloc and not u.fragment and not re.search(r"[\r\n]",path),"setup_endpoint_denied")
        allowed=(host==TOKEN_HOST and method=="POST" and path==TOKEN_PATH and isinstance(body,bytes))
        allowed=allowed or (host==drive.HOST and method=="GET" and u.path in (drive.API+"/"+self.folder,drive.API+"/"+self.folder+"/permissions") and body is None and set(parse_qs(u.query))<=set(("fields","pageSize")))
        require(allowed,"setup_endpoint_denied")
        conn=self.connection(host,timeout=25,context=ssl.create_default_context())
        try:
            conn.request(method,path,body=body,headers=headers)
            res=conn.getresponse()
            raw=res.read(MAX_RESPONSE+1)
            require(len(raw)<=MAX_RESPONSE,"setup_response_too_large")
            return res.status,{},raw
        except (OSError,http.client.HTTPException):
            raise ValueError("setup_network_unavailable") from None
        finally:conn.close()

def refresh_access(c,transport):
    validate_config(c)
    body=urlencode({"client_id":c["client_id"],"client_secret":c["client_secret"],"refresh_token":c["refresh_token"],"grant_type":"refresh_token"}).encode()
    response=transport.request(TOKEN_HOST,"POST",TOKEN_PATH,{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body)
    code,_,raw=response
    require(code==200 and isinstance(raw,bytes) and len(raw)<=MAX_RESPONSE,"oauth_refresh_denied")
    try:t=vault.parse(raw)
    except (ValueError,TypeError,UnicodeError):raise ValueError("invalid_oauth_response") from None
    require(isinstance(t,dict) and t.get("token_type")=="Bearer" and t.get("scope")==SCOPE and type(t.get("expires_in")) is int and 60<=t["expires_in"]<=7200,"oauth_scope_or_expiry_not_verified")
    value=t.get("access_token")
    require(isinstance(value,str) and 1<=len(value)<=8192 and not re.search(r"[\x00-\x20\x7f]",value),"invalid_oauth_access")
    return value

def key_file(path,create=False,repository_root=ROOT):
    p=private_parent(path,repository_root)
    if create:
        fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"wb") as f:
            f.write(os.urandom(32));f.flush();os.fsync(f.fileno())
        return
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        require(stat.S_ISREG(os.fstat(fd).st_mode),"unsafe_key_descriptor")
        vault.key_from_fd(fd)
    finally:os.close(fd)

def preflight(c,transport):
    token=refresh_access(c,transport)
    adapter=drive.DriveCheckpoint(c["folder_id"],c["owner_permission_id"],transport)
    result=adapter.verify_folder(token,write=True)
    return {"oauth_scope_verified":True,"folder_private":result["folder_private"],"folder_add_capability_observed":result["write_capability_observed"],"actual_upload_verified":False,"independent_observer_verified":False,"execution_enabled":False}

def main():
    p=argparse.ArgumentParser(description="Backup setup only; never performs a backup")
    p.add_argument("operation",choices=("init-key","preflight"))
    p.add_argument("--key-file",required=True)
    p.add_argument("--oauth-file")
    a=p.parse_args()
    try:
        if a.operation=="init-key":
            key_file(a.key_file,create=True)
            result={"key_created":True,"execution_enabled":False}
        else:
            require(a.oauth_file is not None,"oauth_config_required")
            key_file(a.key_file)
            c=read_config(a.oauth_file)
            result=preflight(c,SetupHTTPS(c["folder_id"]))
            result["local_key_present"]=True
        print(json.dumps(result,sort_keys=True))
    except (ValueError,OSError,KeyError,TypeError):
        # Never echo provider errors, paths, tokens or secret file contents.
        print(json.dumps({"setup_ready":False,"execution_enabled":False}))
        raise SystemExit(1) from None
if __name__=="__main__":main()
