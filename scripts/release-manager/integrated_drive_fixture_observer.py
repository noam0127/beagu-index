"""Separate read-only fixture observer; never production authorization or independent identity proof."""
import argparse
import http.client
import json
import re
import ssl
from urllib.parse import urlsplit,parse_qs
import integrated_drive_setup as setup
import integrated_drive_checkpoint as drive
import integrated_vault as vault

MAX=512*1024
class ReadOnly:
    def __init__(self,folder,fid,connection=http.client.HTTPSConnection):
        drive.require(drive.valid_id(folder) and drive.valid_id(fid) and folder!=fid,"observer_invalid_pins")
        self.folder,self.fid,self.connection=folder,fid,connection
        self.refresh=setup.SetupHTTPS(folder,connection)
    def request(self,host,method,path,headers,body=None):
        if host==setup.TOKEN_HOST:
            return self.refresh.request(host,method,path,headers,body)
        u=urlsplit(path);q=parse_qs(u.query,keep_blank_values=True)
        drive.require(host==drive.HOST and method=="GET" and body is None and not u.scheme and not u.netloc and not u.fragment and not re.search(r"[\r\n]",path),"observer_endpoint_denied")
        meta=u.path in (drive.API+"/"+self.folder,drive.API+"/"+self.folder+"/permissions",drive.API+"/"+self.fid,drive.API+"/"+self.fid+"/permissions") and set(q)<=set(("fields","pageSize")) and all(len(x)==1 for x in q.values())
        media=u.path==drive.API+"/"+self.fid and q=={"alt":["media"]}
        drive.require(meta or media,"observer_endpoint_denied")
        limit=MAX if media else 1024*1024
        conn=self.connection(host,timeout=45,context=ssl.create_default_context())
        try:
            conn.request(method,path,body=None,headers=headers)
            res=conn.getresponse();raw=res.read(limit+1)
            drive.require(len(raw)<=limit,"observer_response_limit")
            return res.status,{},raw
        except (OSError,http.client.HTTPException):
            raise ValueError("observer_network_failure") from None
        finally:conn.close()

def observe(c,fid,expected,transport=None):
    setup.validate_config(c)
    drive.require(drive.valid_id(fid) and fid!=c["folder_id"] and isinstance(expected,str) and vault.HASH.fullmatch(expected),"observer_invalid_pins")
    t=transport if transport is not None else ReadOnly(c["folder_id"],fid)
    token=setup.refresh_access(c,t)
    a=drive.DriveCheckpoint(c["folder_id"],c["owner_permission_id"],t)
    a.verify_folder(token)
    m=a.private_metadata(fid,token)
    size=m.get("size")
    drive.require(isinstance(size,str) and size.isdigit() and len(size)<=7 and 0<int(size)<=MAX and m.get("name")==expected+".vault" and m.get("parents")==[c["folder_id"]] and m.get("mimeType")==drive.MIME and m.get("sha256Checksum")==expected,"observer_metadata_mismatch")
    status,_,raw=a.request("GET",drive.API+"/"+fid+"?alt=media",token)
    drive.require(status==200 and isinstance(raw,bytes) and len(raw)==int(size) and raw.startswith(vault.MAGIC) and vault.digest(raw)==expected,"observer_bytes_mismatch")
    a.verify_folder(token)
    return {"scope":"synthetic_ciphertext_observation_only","fixture_object_sha256":expected,"bytes":len(raw),"private_metadata_verified":True,"remote_ciphertext_verified":True,"independent_observer_verified":False,"restore_verified":False,"production_backup_proof":False,"execution_enabled":False}

def main():
    p=argparse.ArgumentParser(description="Read-only exact synthetic ciphertext observation, no write or decryption")
    p.add_argument("--oauth-file",required=True)
    p.add_argument("--file-id",required=True)
    p.add_argument("--sha256",required=True)
    a=p.parse_args()
    try:print(json.dumps(observe(setup.read_config(a.oauth_file),a.file_id,a.sha256),sort_keys=True))
    except (ValueError,OSError,KeyError,TypeError):
        print(json.dumps({"observation_verified":False,"execution_enabled":False}))
        raise SystemExit(1) from None
if __name__=="__main__":main()
