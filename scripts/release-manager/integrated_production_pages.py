"""Immutable production Pages artifact preparation. No publishing or live I/O.
Reuse the existing Git tree, digest and private artifact helpers.
Explicit reviewed public paths are required. The separately approved public-data
overlay is read as a Git blob, never implicitly from a moving HEAD.
"""
import io
import json
import pathlib
import tarfile
import re
import integrated_package as p
import integrated_verify as v
import integrated_backup as b

OVERLAY="data/public-compare-school-directory-v1.json"
SCOPE="production_integrated_v1"
REQUIRED={"index.html","CNAME","release-info.json",OVERLAY,".nojekyll"}

def allowed(path):
    # Explicit reviewed inventory plus conservative deny rules. Admin UI is
    # public static code; access control is server-side. No source SQL, docs,
    # workflows, credentials, or arbitrary root files in the Pages artifact.
    if path in REQUIRED:return True
    if not v.valid_path(path) or any(x.startswith(".") for x in path.split("/")):return False
    if re.search(r"(?:secret|credential|private|backup|token|\.env)",path,re.I):return False
    if re.fullmatch(r"[A-Za-z0-9_-]+\.html",path):return True
    if re.fullmatch(r"data/[A-Za-z0-9_./-]+\.json",path) and path.startswith("data/public-"):return True
    return p.public_path(path)

def inventory(root,verified,overlay_blob,paths,build_timestamp):
    p.require(v.sha(overlay_blob) and v.sha(verified["candidate_sha"]) and v.DIGEST.fullmatch(verified["plan_sha256"]),"invalid_production_artifact_pins")
    p.require(isinstance(paths,list) and len(paths)<=p.MAX_FILES and len(set(paths))==len(paths) and REQUIRED.issubset(paths) and all(allowed(x) for x in paths),"invalid_production_public_paths")
    p.require(isinstance(build_timestamp,str) and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ",build_timestamp),"invalid_build_timestamp")
    files={};total=0
    for path in sorted(paths):
        if path==OVERLAY:
            p.require(v.git(root,"cat-file","-t",overlay_blob).strip()==b"blob","overlay_not_blob")
            size=int(v.git(root,"cat-file","-s",overlay_blob))
            p.require(0<size<=v.MAX_BLOB,"overlay_size_limit")
            raw=v.git(root,"cat-file","blob",overlay_blob)
            p.require(isinstance(v.read_json(raw),(dict,list)),"invalid_overlay_json")
        elif path==".nojekyll":raw=b""
        else:
            _,_,raw=v.tree_blob(root,verified["candidate_sha"],path)
        if path=="CNAME":p.require(raw.strip()==b"baeguindex.com","production_domain_mismatch")
        if path=="release-info.json":
            meta=v.read_json(raw)
            p.require(isinstance(meta,dict) and meta.get("schema")==1 and meta.get("version")==verified["version"],"release_metadata_mismatch")
            meta.update(environment="production",commit=verified["candidate_sha"],builtAt=build_timestamp,deployedAt=None)
            raw=p.canonical(meta)+b"\n"
        total+=len(raw);p.require(total<=p.MAX_TOTAL,"package_size_limit")
        files[path]=raw
    inv={"schema":1,"scope":SCOPE,"operation":"publish_pages","candidate_sha":verified["candidate_sha"],"plan_sha256":verified["plan_sha256"],"public_data_blob_sha":overlay_blob,"build_timestamp":build_timestamp,"files":[{"path":k,"sha256":p.hash_bytes(x)} for k,x in files.items()]}
    return inv,files

def build(root,verified,approved,expected_sha,destination):
    p.require(v.DIGEST.fullmatch(expected_sha) and p.hash_bytes(p.canonical(approved))==expected_sha,"production_inventory_pin_mismatch")
    fresh,files=inventory(root,verified,approved["public_data_blob_sha"],[f["path"] for f in approved["files"]],approved["build_timestamp"])
    p.require(fresh==approved,"production_inventory_changed")
    out=io.BytesIO()
    with tarfile.open(fileobj=out,mode="w",format=tarfile.USTAR_FORMAT) as tar:
        for path,raw in files.items():
            info=tarfile.TarInfo(path);info.size=len(raw);info.mode=0o644;info.mtime=0
            tar.addfile(info,io.BytesIO(raw))
    raw=out.getvalue()
    b.safe_dir(pathlib.Path(destination).parent)
    b.private_write(pathlib.Path(destination),raw)
    p.require(len(p.hash_bytes(raw))==64,"archive_hash_missing")
    return {"scope":SCOPE,"inventory_sha256":expected_sha,"artifact_sha256":p.hash_bytes(raw),"public_data_blob_sha":fresh["public_data_blob_sha"],"candidate_sha":fresh["candidate_sha"],"plan_sha256":fresh["plan_sha256"],"execution_enabled":False}


class Publisher:
    """Connect the verified Pages archive to the existing provider API adapter.
    This is called by a trusted single-publisher runner, not by candidate code.
    Production transport remains disabled in integrated_provider.
    """
    def __init__(self,provider):
        import integrated_provider as ip
        p.require(type(provider) is ip.ProviderAdapter and provider.project=="snvzwrexuqavnfvzgxqj","invalid_production_provider")
        self.provider=provider

    def publish(self,root,verified,approved_inventory,expected_inventory_sha,archive_path,archive_receipt,artifact_approval,write_token,read_token,oidc_token):
        p.require(isinstance(approved_inventory,dict) and approved_inventory.get("scope")==SCOPE,"invalid_production_inventory")
        fresh,contents=inventory(root,verified,approved_inventory["public_data_blob_sha"],[x["path"] for x in approved_inventory["files"]],approved_inventory["build_timestamp"])
        p.require(fresh==approved_inventory and p.hash_bytes(p.canonical(fresh))==expected_inventory_sha,"production_inventory_changed")
        raw=b.private_read(pathlib.Path(archive_path),p.MAX_TOTAL+p.MAX_FILES*1024+10240)
        expected={"scope":SCOPE,"inventory_sha256":expected_inventory_sha,"artifact_sha256":p.hash_bytes(raw),"public_data_blob_sha":fresh["public_data_blob_sha"],"candidate_sha":fresh["candidate_sha"],"plan_sha256":fresh["plan_sha256"],"execution_enabled":False}
        p.require(archive_receipt==expected,"production_artifact_receipt_mismatch")
        with tarfile.open(fileobj=io.BytesIO(raw),mode="r:") as tar:
            members=tar.getmembers()
            p.require([m.name for m in members]==list(contents),"production_archive_members_mismatch")
            for m in members:
                p.require(m.isfile() and m.size==len(contents[m.name]) and tar.extractfile(m).read()==contents[m.name],"production_archive_content_mismatch")
        # Artifact index digest and tar digest are distinct. The independent
        # upload observer must bind both before publication can be requested.
        p.require(isinstance(artifact_approval,dict) and set(artifact_approval)=={"provider","archive_sha256","inventory_sha256","public_data_blob_sha"} and artifact_approval["archive_sha256"]==expected["artifact_sha256"] and artifact_approval["inventory_sha256"]==expected_inventory_sha and artifact_approval["public_data_blob_sha"]==fresh["public_data_blob_sha"],"production_upload_approval_mismatch")
        a=artifact_approval["provider"]
        p.require(a["candidate_sha"]==fresh["candidate_sha"] and a["plan_sha256"]==fresh["plan_sha256"],"production_upload_pin_mismatch")
        # Does not upload a second artifact or start a second workflow.
        return self.provider.publish_pages(a,write_token,read_token,oidc_token)

    def observe(self,deployment,read_token,approved_inventory,expected_inventory_sha,version):
        p.require(approved_inventory.get("scope")==SCOPE and p.hash_bytes(p.canonical(approved_inventory))==expected_inventory_sha,"production_inventory_pin_mismatch")
        # .nojekyll is a build directive, not a guaranteed served HTTP path.
        served={**approved_inventory,"files":[x for x in approved_inventory["files"] if x["path"]!=".nojekyll"]}
        p.require(all(allowed(x["path"]) for x in served["files"]),"nonpublic_live_probe")
        return self.provider.verify_pages(deployment,read_token,served,version,public_path=allowed)
