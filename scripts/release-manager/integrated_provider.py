"""Provider API adapter candidate. Production transport is deliberately disabled.
Tests inject a strict fake HTTP transport. No credentials, dispatch, or install.
Supabase Management API and existing GitHub Pages single-publisher API contracts.
"""
import hashlib
import http.client
import io
import json
import re
import ssl
import tarfile
import uuid
from urllib.parse import quote
import integrated_package as pkg
import integrated_verify as v

PRODUCTION_TRANSPORT_ENABLED=False
MAX_RESPONSE=32*1024*1024
SUPABASE_HOST="api.supabase.com"
GITHUB_HOST="api.github.com"
REPO=v.REPOSITORY
DOMAIN="baeguindex.com"
PROJECT=re.compile(r"[a-z0-9]{20}")
SLUG=re.compile(r"[a-z0-9][a-z0-9-]{0,79}")
IDENT=re.compile(r"[A-Za-z0-9_.:-]{1,120}")
HEX=re.compile(r"[a-f0-9]{64}")

def require(ok,code):v.require(ok,code)
def hash_bytes(raw):return hashlib.sha256(raw).hexdigest()
def canonical(obj):return pkg.canonical(obj)
def hex64(value):return isinstance(value,str) and HEX.fullmatch(value) is not None

class DisabledHTTPS:
    """Future trusted-runner transport. Source-level gate, no runtime env override."""
    def request(self,host,method,path,headers,body=None):
        require(PRODUCTION_TRANSPORT_ENABLED,"production_transport_disabled")
        require(host in (SUPABASE_HOST,GITHUB_HOST,DOMAIN) and path.startswith("/") and not path.startswith("//"),"untrusted_provider_endpoint")
        # No redirects, retry, proxy, or logging of request/response data.
        conn=http.client.HTTPSConnection(host,timeout=25,context=ssl.create_default_context())
        try:
            conn.request(method,path,body=body,headers=headers)
            res=conn.getresponse()
            data=res.read(MAX_RESPONSE+1)
            require(len(data)<=MAX_RESPONSE,"provider_response_too_large")
            return res.status,data
        finally:conn.close()

def json_response(response,status):
    actual,raw=response
    require(actual==status,"provider_effect_unconfirmed")
    result=v.read_json(raw)
    require(isinstance(result,dict),"invalid_provider_response")
    return result

def auth(token):
    require(isinstance(token,str) and 0<len(token)<=8192 and not re.search(r"[\r\n]",token),"invalid_provider_token")
    return {"Authorization":"Bearer "+token,"Accept":"application/json","User-Agent":"beagu-integrated-controller-v1"}

def multipart(metadata,files):
    boundary="beagu-"+uuid.uuid4().hex
    parts=[]
    for name,data,filename,content_type in [("metadata",canonical(metadata),None,"application/json")]+[("file",data,path,"application/octet-stream") for path,data in files]:
        require(filename is None or (v.valid_path(filename) and not re.search(r'["\r\n]',filename)),"invalid_multipart_path")
        disposition='Content-Disposition: form-data; name="'+name+'"'+('; filename="'+filename+'"' if filename is not None else '')
        parts.extend([("--"+boundary+"\r\n"+disposition+"\r\nContent-Type: "+content_type+"\r\n\r\n").encode(),data,b"\r\n"])
    parts.append(("--"+boundary+"--\r\n").encode())
    return "multipart/form-data; boundary="+boundary,b"".join(parts)

def package_files(raw,inventory,expected_sha):
    require(hex64(expected_sha) and hash_bytes(raw)==expected_sha,"provider_artifact_mismatch")
    with tarfile.open(fileobj=io.BytesIO(raw),mode="r:") as tar:
        members=tar.getmembers()
        require([m.name for m in members]==[f["path"] for f in inventory["files"]],"provider_inventory_mismatch")
        out=[]
        for m,pin in zip(members,inventory["files"]):
            require(m.isfile() and m.size<=v.MAX_BLOB and v.valid_path(m.name),"invalid_provider_package")
            data=tar.extractfile(m).read()
            require(hash_bytes(data)==pin["sha256"],"provider_file_mismatch")
            out.append((m.name,data))
        return out

class ProviderAdapter:
    """Real request/response mapping; no enabled live transport in this revision.
    Only trusted runner may construct this object after independent approval checks.
    """
    def __init__(self,project,transport=None):
        require(isinstance(project,str) and PROJECT.fullmatch(project),"invalid_project_ref")
        self.project=project
        self.http=transport if transport is not None else DisabledHTTPS()
    def edge_metadata(self,slug,token):
        require(isinstance(slug,str) and SLUG.fullmatch(slug),"invalid_edge_slug")
        return json_response(self.http.request(SUPABASE_HOST,"GET",f"/v1/projects/{self.project}/functions/{slug}",auth(token)),200)
    def deploy_edge(self,raw,inventory,artifact_sha,approved,write_token,read_token):
        slug=inventory["edge_function"]
        require(isinstance(slug,str) and SLUG.fullmatch(slug) and inventory["operation"]=="deploy_edge","invalid_edge_slug")
        require(set(approved)=={"project","slug","plan_sha256","candidate_sha","inventory_sha256","artifact_sha256","verify_jwt","previous_version","entrypoint_path","import_map_path","expected_bundle_sha256"},"invalid_edge_approval")
        require(approved["project"]==self.project and approved["slug"]==slug and approved["plan_sha256"]==inventory["plan_sha256"] and approved["candidate_sha"]==inventory["candidate_sha"] and approved["inventory_sha256"]==hash_bytes(canonical(inventory)) and approved["artifact_sha256"]==artifact_sha and type(approved["verify_jwt"]) is bool and hex64(approved["expected_bundle_sha256"]),"edge_approval_mismatch")
        files=package_files(raw,inventory,artifact_sha)
        names={p for p,_ in files}
        entry=approved["entrypoint_path"];imap=approved["import_map_path"]
        require(entry=="supabase/functions/"+slug+"/index.ts" and entry in names and (imap is None or imap in names),"invalid_edge_config")
        require(all(p.startswith("supabase/functions/"+slug+"/") or p.startswith("supabase/functions/_shared/") for p in names),"edge_package_scope")
        # Existing function must match preflight version; new function needs explicit 404.
        path=f"/v1/projects/{self.project}/functions/{slug}"
        status,body=self.http.request(SUPABASE_HOST,"GET",path,auth(read_token))
        previous=approved["previous_version"]
        if previous is None:require(status==404,"edge_already_exists")
        else:
            before=json_response((status,body),200)
            require(type(previous) is int and before.get("slug")==slug and before.get("version")==previous and before.get("status")=="ACTIVE","edge_base_changed")
        meta={"name":slug,"entrypoint_path":entry,"verify_jwt":approved["verify_jwt"]}
        if imap is not None:meta["import_map_path"]=imap
        typ,body=multipart(meta,files)
        headers={**auth(write_token),"Content-Type":typ}
        result=json_response(self.http.request(SUPABASE_HOST,"POST",f"/v1/projects/{self.project}/functions/deploy?slug={slug}",headers,body),201)
        require(result.get("slug")==slug and result.get("status")=="ACTIVE" and type(result.get("version")) is int and (previous is None or result["version"]>previous),"edge_deploy_unconfirmed")
        # Readback with separate read credential. Provider bundle hash is independently pinned,
        # not equated to the local tar hash. Runtime health probe still required.
        observed=self.edge_metadata(slug,read_token)
        require(observed.get("slug")==slug and observed.get("id")==result.get("id") and observed.get("version")==result["version"] and observed.get("status")=="ACTIVE" and observed.get("verify_jwt") is approved["verify_jwt"] and observed.get("ezbr_sha256")==approved["expected_bundle_sha256"],"edge_readback_mismatch")
        return {"slug":slug,"version":observed["version"],"bundle_sha256":observed["ezbr_sha256"],"runtime_verified":False}

    def publish_pages(self,approved,write_token,read_token,oidc_token):
        require(set(approved)=={"repository","workflow_sha","run_id","artifact_id","artifact_zip_sha256","candidate_sha","plan_sha256"} and approved["repository"]==REPO and v.sha(approved["workflow_sha"]) and v.sha(approved["candidate_sha"]) and hex64(approved["plan_sha256"]) and hex64(approved["artifact_zip_sha256"]) and type(approved["artifact_id"]) is int and approved["artifact_id"]>0 and type(approved["run_id"]) is int and approved["run_id"]>0,"invalid_pages_approval")
        headers={**auth(read_token),"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}
        prefix="/repos/"+REPO
        # Artifact ID + actual provider indexed digest must be independently approved.
        art=json_response(self.http.request(GITHUB_HOST,"GET",prefix+"/actions/artifacts/"+str(approved["artifact_id"]),headers),200)
        require(art.get("id")==approved["artifact_id"] and art.get("name")=="github-pages" and art.get("expired") is False and art.get("digest")=="sha256:"+approved["artifact_zip_sha256"] and art.get("workflow_run",{}).get("id")==approved["run_id"] and art.get("workflow_run",{}).get("head_sha")==approved["workflow_sha"],"pages_artifact_mismatch")
        require(isinstance(oidc_token,str) and 0<len(oidc_token)<=16384 and not re.search(r"[\r\n]",oidc_token),"invalid_pages_oidc")
        body=canonical({"artifact_id":approved["artifact_id"],"environment":"github-pages","pages_build_version":approved["workflow_sha"],"oidc_token":oidc_token})
        result=json_response(self.http.request(GITHUB_HOST,"POST",prefix+"/pages/deployments",{**headers,**auth(write_token),"Content-Type":"application/json"},body),200)
        dep=result.get("id")
        require(isinstance(dep,str) and IDENT.fullmatch(dep),"invalid_pages_deployment_id")
        return {"deployment_id":dep,"candidate_sha":approved["candidate_sha"],"plan_sha256":approved["plan_sha256"],"live_verified":False}

    def verify_pages(self,deployment,read_token,inventory,version):
        require(isinstance(deployment.get("deployment_id"),str) and IDENT.fullmatch(deployment["deployment_id"]) and deployment["candidate_sha"]==inventory["candidate_sha"] and deployment["plan_sha256"]==inventory["plan_sha256"] and inventory["operation"]=="publish_pages","pages_receipt_mismatch")
        prefix="/repos/"+REPO
        status=json_response(self.http.request(GITHUB_HOST,"GET",prefix+"/pages/deployments/"+quote(deployment["deployment_id"],safe=""),{**auth(read_token),"X-GitHub-Api-Version":"2022-11-28"}),200)
        require(status.get("status")=="succeed","pages_not_ready")
        require(any(f["path"]=="release-info.json" for f in inventory["files"]),"missing_release_metadata")
        observed=[]
        for pin in inventory["files"]:
            path=pin["path"]
            require(pkg.public_path(path),"nonpublic_live_probe")
            code,raw=self.http.request(DOMAIN,"GET","/"+quote(path,safe="/")+"?release="+deployment["candidate_sha"],{"Cache-Control":"no-cache","Accept-Encoding":"identity","User-Agent":"beagu-release-observer"})
            require(code==200 and hash_bytes(raw)==pin["sha256"],"live_file_mismatch")
            if path=="release-info.json":
                meta=v.read_json(raw)
                require(meta.get("commit")==deployment["candidate_sha"] and meta.get("version")==version and meta.get("environment")=="production","live_version_mismatch")
            observed.append(pin)
        return {"deployment_id":deployment["deployment_id"],"candidate_sha":deployment["candidate_sha"],"plan_sha256":deployment["plan_sha256"],"served_file_set_sha256":hash_bytes(canonical(observed)),"live_verified":True}
