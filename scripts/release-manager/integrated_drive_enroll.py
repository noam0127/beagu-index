"""Local desktop OAuth + native Google Picker setup, not an operational backup.

Google's single browser flow grants drive.file and selects exactly one existing
folder. PKCE, state and loopback callback. Never print codes/tokens, upload files,
or connect to the database. The user explicitly starts this on a trusted machine.
"""
import argparse
import base64
import hashlib
import http.server
import json
import os
import pathlib
import re
import secrets
import time
import webbrowser
from urllib.parse import urlencode, urlsplit, parse_qs
import integrated_drive_setup as setup
import integrated_drive_checkpoint as drive
import integrated_vault as vault

AUTH="https://accounts.google.com/o/oauth2/v2/auth"
CALLBACK="/oauth2callback"
require=setup.require

def b64(raw):return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

def authorization_url(client_id,folder_id,redirect,state,verifier):
    require(drive.valid_id(folder_id),"invalid_drive_pins")
    require(isinstance(client_id,str) and re.fullmatch(r"[A-Za-z0-9_-]{1,200}\.apps\.googleusercontent\.com",client_id),"invalid_oauth_client")
    require(re.fullmatch(r"http://127\.0\.0\.1:[0-9]{1,5}/oauth2callback",redirect) is not None,"invalid_loopback_redirect")
    require(re.fullmatch(r"[A-Za-z0-9_-]{43,128}",verifier) is not None and re.fullmatch(r"[A-Za-z0-9_-]{43,128}",state) is not None,"invalid_oauth_state")
    return AUTH+"?"+urlencode({"client_id":client_id,"scope":setup.SCOPE,"redirect_uri":redirect,"response_type":"code","access_type":"offline","prompt":"consent","include_granted_scopes":"false","trigger_onepick":"true","allow_multiple":"false","allow_folder_selection":"true","file_ids":folder_id,"mimetypes":drive.FOLDER,"state":state,"code_challenge":b64(hashlib.sha256(verifier.encode("ascii")).digest()),"code_challenge_method":"S256"})

def parse_callback(path,state,folder_id):
    require(isinstance(path,str) and len(path)<=16384,"invalid_oauth_callback")
    u=urlsplit(path)
    require(not u.scheme and not u.netloc and not u.fragment and u.path==CALLBACK,"invalid_oauth_callback")
    q=parse_qs(u.query,keep_blank_values=True,max_num_fields=20)
    require(all(len(x)==1 for x in q.values()) and len(q.get("state",[]))==1 and secrets.compare_digest(q["state"][0],state),"oauth_state_mismatch")
    require("error" not in q,"oauth_cancelled")
    require(q.get("picked_file_ids")==[folder_id],"oauth_wrong_folder")
    require(q.get("scope")==[setup.SCOPE],"oauth_scope_not_verified")
    code=q.get("code",[""])[0]
    require(1<=len(code)<=8192 and not re.search(r"[\x00-\x20\x7f]",code),"invalid_oauth_code")
    return code

def get_code(client_id,folder_id,timeout=300,open_browser=webbrowser.open):
    state=b64(secrets.token_bytes(32));verifier=b64(secrets.token_bytes(48))
    result={}
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_GET(self):
            ok=False
            try:
                require(self.headers.get("Host")==self.server.expected_host,"invalid_loopback_host")
                code=parse_callback(self.path,state,folder_id)
                if not result:result["code"]=code
                ok=True
            except (ValueError,TypeError,KeyError):
                pass
            # No external assets or callback details; do not log the request.
            payload=("Google selection received. Return to the setup program." if ok else "Selection not accepted. Return to the setup program.").encode()
            self.send_response(200 if ok else 400)
            self.send_header("Content-Type","text/plain; charset=utf-8")
            self.send_header("Cache-Control","no-store")
            self.send_header("Referrer-Policy","no-referrer")
            self.send_header("Content-Security-Policy","default-src 'none'; frame-ancestors 'none'")
            self.send_header("Content-Length",str(len(payload)))
            self.end_headers();self.wfile.write(payload)
        def do_POST(self):self.send_error(405)
    with http.server.HTTPServer(("127.0.0.1",0),Handler) as server:
        server.expected_host="127.0.0.1:"+str(server.server_port)
        redirect="http://"+server.expected_host+CALLBACK
        server.timeout=0.5
        require(open_browser(authorization_url(client_id,folder_id,redirect,state,verifier)) is True,"browser_open_failed")
        deadline=time.monotonic()+timeout
        while not result and time.monotonic()<deadline:server.handle_request()
        require("code" in result,"oauth_selection_not_completed")
    return result["code"],redirect,verifier

def exchange(client_id,client_secret,code,redirect,verifier,transport):
    require(isinstance(client_secret,str) and 1<=len(client_secret)<=8192 and not re.search(r"[\x00-\x20\x7f]",client_secret),"invalid_oauth_client")
    body=urlencode({"client_id":client_id,"client_secret":client_secret,"code":code,"code_verifier":verifier,"redirect_uri":redirect,"grant_type":"authorization_code"}).encode()
    status,_,raw=transport.request(setup.TOKEN_HOST,"POST",setup.TOKEN_PATH,{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body)
    require(status==200 and isinstance(raw,bytes) and len(raw)<=setup.MAX_RESPONSE,"oauth_exchange_denied")
    t=vault.parse(raw)
    require(isinstance(t,dict) and t.get("scope")==setup.SCOPE and t.get("token_type")=="Bearer" and type(t.get("expires_in")) is int and 60<=t["expires_in"]<=7200,"oauth_scope_or_expiry_not_verified")
    for k in ("access_token","refresh_token"):
        require(isinstance(t.get(k),str) and 1<=len(t[k])<=8192 and not re.search(r"[\x00-\x20\x7f]",t[k]),"oauth_token_missing")
    return t["access_token"],t["refresh_token"]

def selected_config(client_id,client_secret,folder_id,token,refresh,transport):
    # Read the exact selected folder and derive a pin only from owner-only
    # permissions of the currently authenticated owner, not browser metadata.
    from urllib.parse import urlencode
    path=drive.API+"/"+folder_id
    headers={"Authorization":"Bearer "+token,"Accept":"application/json","Cache-Control":"no-cache"}
    m=drive.json_response(transport.request(drive.HOST,"GET",path+"?"+urlencode({"fields":drive.FIELDS}),headers),200)
    require(m.get("id")==folder_id and m.get("mimeType")==drive.FOLDER and m.get("ownedByMe") is True and m.get("shared") is False and m.get("trashed") is False and not m.get("driveId") and m.get("capabilities",{}).get("canAddChildren") is True,"drive_folder_not_private_writable")
    p=drive.json_response(transport.request(drive.HOST,"GET",path+"/permissions?"+urlencode({"fields":"nextPageToken,permissions(id,type,role,deleted)","pageSize":100}),headers),200)
    ps=p.get("permissions")
    require(not p.get("nextPageToken") and isinstance(ps,list) and len(ps)==1 and isinstance(ps[0],dict) and ps[0].get("type")=="user" and ps[0].get("role")=="owner" and ps[0].get("deleted",False) is False and drive.valid_id(ps[0].get("id")),"drive_permissions_not_private")
    c={"schema":1,"folder_id":folder_id,"owner_permission_id":ps[0]["id"],"client_id":client_id,"client_secret":client_secret,"refresh_token":refresh}
    setup.validate_config(c)
    # Verify refreshed token also retains selected folder access before persisting.
    setup.preflight(c,transport)
    return c

def read_client(path):
    p=setup.private_parent(path)
    # Reuse secure file read, not a permissive path loader.
    raw=vault.read_private(p.parent,p.name)
    require(len(raw)<=32768,"invalid_desktop_client")
    j=vault.parse(raw)
    require(isinstance(j,dict) and set(j)=={"installed"} and isinstance(j["installed"],dict),"invalid_desktop_client")
    c=j["installed"]
    require(c.get("auth_uri")==AUTH.replace("/v2/auth","/auth") or c.get("auth_uri")==AUTH,"invalid_desktop_client")
    require(c.get("token_uri")=="https://oauth2.googleapis.com/token","invalid_desktop_client")
    client_id,secret=c.get("client_id"),c.get("client_secret")
    require(isinstance(client_id,str) and re.fullmatch(r"[A-Za-z0-9_-]{1,200}\.apps\.googleusercontent\.com",client_id) and isinstance(secret,str) and 1<=len(secret)<=8192 and not re.search(r"[\x00-\x20\x7f]",secret),"invalid_desktop_client")
    return client_id,secret

def main():
    p=argparse.ArgumentParser(description="Local one-time folder selection and credential setup only")
    p.add_argument("--desktop-client-file",required=True)
    p.add_argument("--folder-id",required=True)
    p.add_argument("--oauth-file",required=True)
    p.add_argument("--key-file",required=True)
    a=p.parse_args()
    try:
        require(drive.valid_id(a.folder_id),"invalid_drive_pins")
        dest=setup.private_parent(a.oauth_file)
        key=setup.private_parent(a.key_file)
        source=setup.private_parent(a.desktop_client_file)
        require(len({dest,key,source})==3 and not os.path.lexists(dest),"existing_or_conflicting_setup_file")
        if os.path.lexists(key):setup.key_file(key)
        client,secret=read_client(source)
        transport=setup.SetupHTTPS(a.folder_id)
        code,redirect,verifier=get_code(client,a.folder_id)
        token,refresh=exchange(client,secret,code,redirect,verifier,transport)
        config=selected_config(client,secret,a.folder_id,token,refresh,transport)
        if not os.path.lexists(key):setup.key_file(key,create=True)
        else:setup.key_file(key)
        vault.write_exclusive(dest.parent,dest.name,vault.canonical(config))
        setup.read_config(dest)
        print(json.dumps({"oauth_scope_verified":True,"folder_private":True,"local_key_present":True,"actual_upload_verified":False,"execution_enabled":False}))
    except (ValueError,OSError,KeyError,TypeError):
        print(json.dumps({"setup_ready":False,"execution_enabled":False}))
        raise SystemExit(1) from None
if __name__=="__main__":main()
