"""Verified local package construction only. No external upload, candidate execution or deployment.
Full Edge source tree (including _shared) and an independently reviewed Pages file set.
A trusted package inventory must be pinned separately before any future remote adapter.
"""
import hashlib
import io
import json
import pathlib
import re
import tarfile
import integrated_verify as v
import integrated_backup as backup

SCOPE="isolated_fixture_only"
MAX_FILES=10000
MAX_TOTAL=100*1024*1024

def require(ok,code):
    if not ok:raise ValueError(code)

def hash_bytes(data):return hashlib.sha256(data).hexdigest()
def canonical(obj):return json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()

def tree_paths(root,sha,prefixes):
    require(v.sha(sha),"invalid_package_sha")
    raw=v.git(root,"ls-tree","-r","-z",sha,"--",*prefixes)
    entries=[]
    for line in raw.split(b"\0"):
        if not line:continue
        meta,p=line.split(b"\t",1)
        mode,typ,oid=meta.decode("ascii").split()
        path=p.decode("utf8")
        require(v.valid_path(path) and mode in ("100644","100755") and typ=="blob" and v.sha(oid),"non_regular_package_entry")
        entries.append(path)
    require(0<len(entries)<=MAX_FILES and len(set(entries))==len(entries),"invalid_package_paths")
    return sorted(entries)

def public_path(path):
    # Conservative static file categories; inclusion still needs explicit trusted per-file pins.
    if not v.valid_path(path) or any(p.startswith(".") for p in path.split("/")):
        return False
    if path in ("CNAME","robots.txt","sitemap.xml","release-info.json"):
        return True
    if len(path.split("/"))==1:
        return bool(re.fullmatch(r"[A-Za-z0-9_-]+\.html",path)) and not path.startswith(("admin-","private-"))
    return bool(re.fullmatch(r"(?:js|styles|css|images|assets|fonts)/[A-Za-z0-9_./-]+\.(?:js|mjs|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|mp3|ogg|wav|webm|mp4)",path,re.I)) and not re.search(r"(?:secret|credential|private|backup|token|\.env)",path,re.I)

def inspect(root,verified,operation,edge=None,pages_paths=None):
    sha=verified["candidate_sha"]
    require(v.sha(sha) and v.DIGEST.fullmatch(verified["plan_sha256"]),"invalid_package_pins")
    if operation=="deploy_edge":
        require(isinstance(edge,str) and edge in verified["edge_functions"] and re.fullmatch(r"[a-z0-9][a-z0-9-]*",edge) and pages_paths is None,"invalid_edge_package")
        paths=tree_paths(root,sha,["supabase/functions/"+edge+"/","supabase/functions/_shared/"])
        require("supabase/functions/"+edge+"/index.ts" in paths,"missing_edge_entry")
    elif operation=="publish_pages":
        require(edge is None and isinstance(pages_paths,list) and 0<len(pages_paths)<=MAX_FILES and
            all(public_path(p) for p in pages_paths) and len(set(pages_paths))==len(pages_paths) and "index.html" in pages_paths,"invalid_public_file_set")
        paths=sorted(pages_paths)
    else:raise ValueError("invalid_package_operation")
    pins=[];total=0
    for path in paths:
        _,digest,data=v.tree_blob(root,sha,path)
        total+=len(data)
        require(total<=MAX_TOTAL,"package_size_limit")
        pins.append({"path":path,"sha256":digest})
    return {"schema":1,"scope":SCOPE,"operation":operation,"edge_function":edge,"candidate_sha":sha,
            "plan_sha256":verified["plan_sha256"],"files":pins,"execution_enabled":False}

def build(root,verified,approved_inventory,expected_inventory_sha256,destination):
    require(isinstance(expected_inventory_sha256,str) and v.DIGEST.fullmatch(expected_inventory_sha256)
            and hash_bytes(canonical(approved_inventory))==expected_inventory_sha256,"package_inventory_pin_mismatch")
    op=approved_inventory.get("operation")
    paths=[f["path"] for f in approved_inventory.get("files",[])]
    fresh=inspect(root,verified,op,approved_inventory.get("edge_function"),paths if op=="publish_pages" else None)
    require(fresh==approved_inventory,"package_inventory_changed")
    out=io.BytesIO()
    with tarfile.open(fileobj=out,mode="w",format=tarfile.USTAR_FORMAT) as tar:
        for pin in fresh["files"]:
            _,digest,data=v.tree_blob(root,fresh["candidate_sha"],pin["path"])
            require(digest==pin["sha256"],"package_blob_changed")
            item=tarfile.TarInfo(pin["path"])
            item.size=len(data);item.mode=0o644;item.mtime=0;item.uid=item.gid=0
            tar.addfile(item,io.BytesIO(data))
    raw=out.getvalue()
    require(len(raw)<=MAX_TOTAL+MAX_FILES*1024+10240,"package_archive_limit")
    backup.safe_dir(pathlib.Path(destination).parent)
    backup.private_write(pathlib.Path(destination),raw)
    return {"scope":SCOPE,"operation":op,"plan_sha256":fresh["plan_sha256"],"candidate_sha":fresh["candidate_sha"],
            "inventory_sha256":expected_inventory_sha256,"artifact_sha256":hash_bytes(raw),"execution_enabled":False}

def verify_artifact(destination,inventory,receipt):
    raw=backup.private_read(pathlib.Path(destination),MAX_TOTAL+MAX_FILES*1024+10240)
    require(hash_bytes(raw)==receipt["artifact_sha256"] and hash_bytes(canonical(inventory))==receipt["inventory_sha256"],"package_artifact_mismatch")
    require(receipt["scope"]==SCOPE and receipt["operation"]==inventory["operation"] and receipt["candidate_sha"]==inventory["candidate_sha"] and receipt["plan_sha256"]==inventory["plan_sha256"],"package_receipt_mismatch")
    with tarfile.open(fileobj=io.BytesIO(raw),mode="r:") as tar:
        members=tar.getmembers()
        require([m.name for m in members]==[f["path"] for f in inventory["files"]],"package_members_mismatch")
        for m,pin in zip(members,inventory["files"]):
            require(m.isfile() and hash_bytes(tar.extractfile(m).read())==pin["sha256"],"package_content_mismatch")
    return True
