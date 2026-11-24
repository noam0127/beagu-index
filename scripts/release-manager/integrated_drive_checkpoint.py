"""Drive checkpoint adapter rehearsal only. No live transport or production export.

Only the authenticated existing fixture vault format can be transferred. The
operator supplies folder/owner pins and separate OAuth credentials outside Git.
A real production exporter, durable store policy and observer remain required.
"""
import re
from urllib.parse import urlencode,urlsplit,parse_qsl
import integrated_vault as vault
import integrated_verify as v

HOST="www.googleapis.com"
API="/drive/v3/files"
UPLOAD="/upload/drive/v3/files"
MIME="application/octet-stream"
FOLDER="application/vnd.google-apps.folder"
LIVE_TRANSPORT_ENABLED=False
ID=re.compile(r"[A-Za-z0-9_-]{8,200}")
FIELDS="id,name,mimeType,parents,trashed,shared,ownedByMe,driveId,capabilities(canAddChildren),size,sha256Checksum"

def require(ok,code):v.require(ok,code)
def valid_id(value):return isinstance(value,str) and ID.fullmatch(value) is not None
def json_response(response,status):
    code,headers,raw=response
    require(code==status and isinstance(raw,bytes) and len(raw)<=1024*1024,"drive_metadata_unconfirmed")
    data=v.read_json(raw)
    require(isinstance(data,dict),"invalid_drive_metadata")
    return data

class DisabledTransport:
    def request(self,*args,**kwargs):
        raise ValueError("drive_live_transport_disabled")

class DriveCheckpoint:
    def __init__(self,folder_id,owner_permission_id,transport=None):
        require(valid_id(folder_id) and valid_id(owner_permission_id),"invalid_drive_pins")
        self.folder,self.owner=folder_id,owner_permission_id
        self.http=transport if transport is not None else DisabledTransport()

    def request(self,method,path,token,body=None,extra=None):
        require(isinstance(token,str) and 0<len(token)<=8192 and not re.search(r"[\r\n]",token),"invalid_drive_token")
        require(path.startswith(API+"/") or path.startswith(API+"?") or path.startswith(UPLOAD+"?"),"invalid_drive_path")
        headers={"Authorization":"Bearer "+token,"Accept":"application/json","Cache-Control":"no-cache"}
        headers.update(extra or {})
        return self.http.request(HOST,method,path,headers,body)

    def metadata(self,file_id,token):
        require(valid_id(file_id),"invalid_drive_file_id")
        return json_response(self.request("GET",API+"/"+file_id+"?"+urlencode({"fields":FIELDS}),token),200)

    def owner_only(self,file_id,token):
        result=json_response(self.request("GET",API+"/"+file_id+"/permissions?"+urlencode({"fields":"nextPageToken,permissions(id,type,role,deleted)","pageSize":100}),token),200)
        require(not result.get("nextPageToken") and isinstance(result.get("permissions"),list) and len(result["permissions"])==1,"drive_permissions_not_private")
        p=result["permissions"][0]
        require(isinstance(p,dict) and p.get("id")==self.owner and p.get("type")=="user" and p.get("role")=="owner" and p.get("deleted",False) is False,"drive_owner_mismatch")

    def private_metadata(self,file_id,token):
        m=self.metadata(file_id,token)
        require(m.get("id")==file_id and m.get("shared") is False and m.get("ownedByMe") is True and m.get("trashed") is False and not m.get("driveId"),"drive_not_private")
        self.owner_only(file_id,token)
        return m

    def verify_folder(self,token,write=False):
        m=self.private_metadata(self.folder,token)
        require(m.get("mimeType")==FOLDER,"drive_not_folder")
        if write:require(m.get("capabilities",{}).get("canAddChildren") is True,"drive_folder_not_writable")
        return {"folder_private":True,"write_capability_observed":write,"execution_enabled":False}

    def transfer_fixture(self,root,key,key_id,pin,plan,base,candidate,write_token,read_token):
        # Authenticate ciphertext and the independent manifest before any upload.
        # unseal is fixture-scoped and rejects plaintext, wrong keys and stale pins.
        vault.unseal(root,key,key_id,pin,plan,base,candidate)
        raw=vault.read_private(root,pin["checkpoint_id"]+".vault")
        sha=vault.digest(raw)
        require(sha==pin["object_sha256"],"drive_checkpoint_changed")
        self.verify_folder(write_token,write=True)
        self.verify_folder(read_token)
        name=sha+".vault"
        # No real network transport is provided. Explicitly avoid retrying an
        # uncertain create: reconcile the object by metadata/hash before retry.
        meta=vault.canonical({"name":name,"parents":[self.folder],"mimeType":MIME})
        result=self.request("POST",UPLOAD+"?"+urlencode({"uploadType":"resumable","fields":FIELDS}),write_token,meta,{"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Type":MIME,"X-Upload-Content-Length":str(len(raw))})
        code,headers,_=result
        require(code==200 and isinstance(headers,dict),"drive_upload_session_unconfirmed")
        location=headers.get("Location") or headers.get("location")
        require(isinstance(location,str) and len(location)<=8192,"drive_invalid_upload_session")
        u=urlsplit(location)
        qs=parse_qsl(u.query,keep_blank_values=True)
        require(u.scheme=="https" and u.netloc==HOST and u.path==UPLOAD and not u.fragment and len(qs)==len(dict(qs)) and set(dict(qs))<=set(("uploadType","upload_id")) and dict(qs).get("uploadType")=="resumable" and isinstance(dict(qs).get("upload_id"),str) and re.fullmatch(r"[A-Za-z0-9_.~-]{1,4096}",dict(qs)["upload_id"]),"drive_invalid_upload_session")
        code,h,body=self.request("PUT",u.path+"?"+u.query,write_token,raw,{"Content-Type":MIME,"Content-Length":str(len(raw))})
        require(code in (200,201),"drive_upload_outcome_uncertain")
        created=json_response((code,h,body),code)
        fid=created.get("id")
        require(valid_id(fid),"drive_upload_id_missing")
        m=self.private_metadata(fid,read_token)
        require(m.get("name")==name and m.get("mimeType")==MIME and m.get("parents")==[self.folder] and m.get("size")==str(len(raw)) and m.get("sha256Checksum")==sha,"drive_upload_metadata_mismatch")
        # Independent byte readback, not just provider checksum. No decryption
        # key, database data, session URL or access token is returned or logged.
        code,_,observed=self.request("GET",API+"/"+fid+"?alt=media",read_token)
        require(code==200 and isinstance(observed,bytes) and len(observed)==len(raw) and vault.digest(observed)==sha,"drive_upload_readback_mismatch")
        self.verify_folder(read_token)
        return {"scope":vault.SCOPE,"file_id":fid,"object_sha256":sha,"bytes":len(raw),"readback_verified":True,"encryption_verified":True,"durable_storage_verified":False,"restore_verified":False,"execution_enabled":False}
