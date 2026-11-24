"""Drive resumable protocol rehearsal using injected simulated transport only.

Fixed chunk ranges, one create session, exact acknowledgements, no retries.
Transport is NOT live; no HTTP implementation, credentials or CLI accepted.
"""
import hashlib
import os
import re
from urllib.parse import urlsplit,parse_qsl,urlencode
import integrated_stream_fixture as s
import integrated_vault as v
import integrated_drive_checkpoint as d

UPLOAD_CHUNK=4*1024**2
SCOPE="synthetic_stream_simulated_remote_only"
FOLDER="fixture_folder"
TOKEN="synthetic-token"
OWNER="fixture_owner"
require=v.require
def session_path(location):
    require(isinstance(location,str) and len(location)<=8192,"stream_session_invalid")
    u=urlsplit(location);pairs=parse_qsl(u.query,keep_blank_values=True);q=dict(pairs)
    require(u.scheme=="https" and u.netloc==d.HOST and u.path==d.UPLOAD and not u.fragment and len(pairs)==len(q) and set(q)<=set(("uploadType","upload_id","upload_protocol")) and q.get("uploadType","resumable")=="resumable" and q.get("upload_protocol","resumable")=="resumable" and re.fullmatch(r"[A-Za-z0-9_.~-]{1,4096}",q.get("upload_id","")),"stream_session_invalid")
    return u.path+"?"+u.query
def transfer(source_root,dest_root,pin,transport):
    require(getattr(transport,"scope",None)==SCOPE,"stream_live_transport_disabled")
    return _transfer(source_root,dest_root,pin,transport,FOLDER,OWNER,token)
def _transfer(source_root,dest_root,pin,transport,folder,owner,token):
    require(isinstance(pin,dict) and set(pin)==s.PIN_KEYS and pin["scope"]==s.SCOPE and v.match(v.HEX32,pin["checkpoint_id"]) and v.match(v.HASH,pin["object_sha256"]),"stream_pin_invalid")
    h={k:pin[k] for k in s.HEADER_KEYS}
    require(type(h["size"]) is int and 0<h["size"]<=s.MAX and h["chunk_size"]==s.CHUNK,"stream_size_invalid")
    total=len(s.framing(h))+h["size"]+((h["size"]+s.CHUNK-1)//s.CHUNK)*16+48
    name=pin["checkpoint_id"]+".stream";digest=pin["object_sha256"]
    adapter=d.DriveCheckpoint(folder,owner,transport)
    with s.input_object(source_root,name) as f:
        require(os.fstat(f.fileno()).st_size==total,"stream_remote_size")
        check=hashlib.sha256()
        while True:
            chunk=f.read(UPLOAD_CHUNK)
            if not chunk:break
            check.update(chunk)
        require(check.hexdigest()==digest,"stream_remote_source_mismatch")
        f.seek(0)
        adapter.verify_folder(token,write=True)
        meta=v.canonical({"name":digest+".stream","parents":[folder],"mimeType":d.MIME})
        code,headers,_=adapter.request("POST",d.UPLOAD+"?"+urlencode({"uploadType":"resumable","fields":d.FIELDS}),token,meta,{"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Type":d.MIME,"X-Upload-Content-Length":str(total)})
        require(code==200,"stream_create_uncertain")
        path=session_path(headers.get("Location") or headers.get("location"))
        offset=0;sent=hashlib.sha256()
        while offset<total:
            raw=s.exact(f,min(UPLOAD_CHUNK,total-offset));sent.update(raw)
            end=offset+len(raw)-1
            result=adapter.request("PUT",path,token,raw,{"Content-Type":d.MIME,"Content-Length":str(len(raw)),"Content-Range":f"bytes {offset}-{end}/{total}"})
            if end+1<total:
                require(result[0]==308 and (result[1].get("Range") or result[1].get("range"))==f"bytes=0-{end}","stream_upload_ack_uncertain")
            else:
                require(result[0] in (200,201),"stream_upload_completion_uncertain")
                fid=d.json_response(result,result[0]).get("id")
                require(d.valid_id(fid) and fid!=folder,"stream_file_id_invalid")
            offset=end+1
        require(f.read(1)==b"" and sent.hexdigest()==digest,"stream_remote_source_changed")
    m=adapter.private_metadata(fid,token)
    require(m.get("name")==digest+".stream" and m.get("parents")==[folder] and m.get("mimeType")==d.MIME and m.get("size")==str(total) and m.get("sha256Checksum")==digest,"stream_remote_metadata_mismatch")
    with s.fresh_output(dest_root,name) as out:
        offset=0;received=hashlib.sha256()
        while offset<total:
            end=min(total,offset+UPLOAD_CHUNK)-1
            code,headers,raw=adapter.request("GET",d.API+"/"+fid+"?alt=media",token,extra={"Range":f"bytes={offset}-{end}"})
            require(code==206 and (headers.get("Content-Range") or headers.get("content-range"))==f"bytes {offset}-{end}/{total}" and isinstance(raw,bytes) and len(raw)==end-offset+1,"stream_remote_range_mismatch")
            out.write(raw);received.update(raw);offset=end+1
        require(received.hexdigest()==digest,"stream_remote_digest_mismatch")
        adapter.verify_folder(token)
    return {"scope":SCOPE,"readback_verified":True,"bytes":total,"actual_drive_transfer_verified":False,"production_backup_proof":False,"execution_enabled":False}
