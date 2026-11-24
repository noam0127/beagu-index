"""Stage 2 read-only Git verification. Never executes a candidate or deploys anything."""
import hashlib
import json
import pathlib
import re
import subprocess

SHA = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"[0-9a-f]{64}")
REPOSITORY = "noam0127/beagu-index"
MAX_BLOB = 25 * 1024 * 1024
MAX_TOTAL = 100 * 1024 * 1024
REGISTRY = pathlib.Path(__file__).with_name("integrated_execution_allowlist.json")


def require(ok, code):
    if not ok:
        raise ValueError(code)


def unique_object(pairs):
    obj = {}
    for key, value in pairs:
        require(key not in obj, "duplicate_json_key")
        obj[key] = value
    return obj


def read_json(raw):
    return json.loads(raw, object_pairs_hook=unique_object)


def digest(obj):
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def sha(value):
    return isinstance(value, str) and SHA.fullmatch(value) is not None


def valid_path(path):
    return (isinstance(path, str) and 0 < len(path) <= 1024
            and not re.search(r"[\x00-\x1f\x7f\\]", path)
            and all(part not in ("", ".", "..") for part in path.split("/")))


def kind(path):
    if re.fullmatch(r"supabase/(?:[^/]*cron[^/]*\.sql|[^/]*scheduler[^/]*\.sql)", path):
        return "scheduler_review"
    if re.fullmatch(r"supabase/(?:migrations/[^/]+\.sql|[^/]+\.sql)", path):
        return "db_review"
    if path.startswith("supabase/functions/_shared/"):
        return "edge_shared_review"
    if re.fullmatch(r"supabase/functions/[a-z0-9][a-z0-9-]*/.+", path):
        return "edge_review"
    if path == "supabase/config.toml":
        return "server_config_review"
    if path.startswith("scripts/release-manager/") or re.fullmatch(r"\.github/workflows/(?:beagu-release-controller|deploy-github-pages-direct)\.ya?ml", path):
        return "controller_review"
    if path.startswith("supabase/"):
        return "manual_review"
    return "ci_review" if path.startswith(".github/workflows/") else "web_review"


def git(root, *args):
    return subprocess.check_output(["git", "--no-replace-objects", "--literal-pathspecs", "-C", str(root), *args], timeout=60, stderr=subprocess.PIPE)


def tree_blob(root, ref, path):
    require(sha(ref) and valid_path(path), "invalid_tree_locator")
    entries = git(root, "ls-tree", "-z", ref, "--", path).split(b"\0")
    require(len(entries) == 2 and entries[-1] == b"", "missing_or_ambiguous_tree_entry")
    meta, name = entries[0].split(b"\t", 1)
    mode, typ, oid = meta.decode("ascii").split()
    require(name.decode("utf-8") == path and mode in ("100644", "100755") and typ == "blob" and sha(oid), "non_regular_git_file")
    size = int(git(root, "cat-file", "-s", oid))
    require(0 <= size <= MAX_BLOB, "blob_size_limit")
    data = git(root, "cat-file", "blob", oid)
    require(len(data) == size, "blob_size_mismatch")
    # Check the actual object bytes, not just ls-tree metadata.
    actual = hashlib.sha1(b"blob " + str(size).encode("ascii") + b"\0" + data).hexdigest()
    require(actual == oid, "git_blob_integrity_failure")
    return oid, hashlib.sha256(data).hexdigest(), data


def diff_paths(root, base, candidate):
    fields = git(root, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-status", "-z", base, candidate, "--").split(b"\0")
    require(fields[-1] == b"" and (len(fields)-1) % 2 == 0, "invalid_git_delta")
    result = {}
    for i in range(0, len(fields)-1, 2):
        status, path = fields[i].decode("ascii"), fields[i+1].decode("utf-8")
        require(status in ("A", "M", "D") and valid_path(path) and path not in result, "unsupported_git_delta")
        result[path] = status
    return result


def verify_manifest(root, envelope):
    require(isinstance(envelope, dict) and set(envelope) == {"plan", "plan_sha256", "approved", "execution_enabled"}
            and envelope["approved"] is False and envelope["execution_enabled"] is False, "not_review_envelope")
    plan, claimed = envelope["plan"], envelope["plan_sha256"]
    require(isinstance(plan, dict) and set(plan) == {"schema","policy","repository","base_sha","candidate_sha","version","summary","backend_required","execution_enabled","inventory","edge_functions","requires_shared_dependency_review","requires_manual_review","required_checks"}, "invalid_plan_shape")
    require(isinstance(claimed, str) and DIGEST.fullmatch(claimed) and digest(plan) == claimed, "plan_digest_mismatch")
    require(plan["schema"] == 1 and plan["policy"] == "integrated-review-v1" and plan["repository"] == REPOSITORY and plan["execution_enabled"] is False, "invalid_plan_policy")
    base, candidate = plan["base_sha"], plan["candidate_sha"]
    require(sha(base) and sha(candidate) and base != candidate, "invalid_plan_sha")
    require(git(root, "cat-file", "-t", base).strip() == b"commit" and git(root, "cat-file", "-t", candidate).strip() == b"commit", "not_commit")
    require(git(root, "merge-base", base, candidate).strip().decode() == base, "stale_base")
    delta = diff_paths(root, base, candidate)
    inventory = plan["inventory"]
    require(isinstance(inventory, list) and 0 < len(inventory) < 300, "invalid_inventory")
    # Also check immutable candidate's actual version metadata.
    _, _, meta_bytes = tree_blob(root, candidate, "release-candidate.json")
    meta = read_json(meta_bytes)
    require(isinstance(meta.get("version"), str) and isinstance(meta.get("summary"), str)
            and meta["version"].strip() == plan["version"] and meta["summary"].strip() == plan["summary"], "manifest_metadata_mismatch")
    covered, seen, files, total = {}, set(), [], 0
    backend_kinds = {"db_review","scheduler_review","edge_review","edge_shared_review","server_config_review","controller_review","manual_review"}
    manual_kinds = {"manual_review","controller_review","edge_shared_review","server_config_review"}
    edge_names = set()
    for row in inventory:
        require(isinstance(row, dict) and set(row) == {"path","status","blob_sha","blob_ref","previous_path","review_kinds","backend","manual_review_required"}, "invalid_inventory_row")
        path, status, previous = row["path"], row["status"], row["previous_path"]
        require(valid_path(path) and path not in seen and sha(row["blob_sha"]), "invalid_inventory_path_or_blob")
        seen.add(path)
        require(status in ("added","modified","removed","renamed","copied"), "unsupported_inventory_status")
        require((valid_path(previous) and previous != path) if status in ("renamed","copied") else previous is None, "invalid_previous_path")
        expected = {path: {"added":"A","modified":"M","removed":"D","renamed":"A","copied":"A"}[status]}
        if status == "renamed":
            expected[previous] = "D"
        if status == "copied":
            require(previous not in delta, "ambiguous_copy_source")
        for p, s in expected.items():
            require(p not in covered and delta.get(p) == s, "git_delta_mismatch")
            covered[p] = s
        ref = base if status == "removed" else candidate
        require(row["blob_ref"] == ("base" if status == "removed" else "candidate"), "wrong_blob_ref")
        oid, sha256, data = tree_blob(root, ref, path)
        require(oid == row["blob_sha"], "inventory_blob_mismatch")
        total += len(data)
        if status in ("modified","renamed","copied"):
            _, prior_digest, prior_data = tree_blob(root, base, previous or path)
            total += len(prior_data)
            if status == "copied":
                require(prior_digest == sha256, "unverified_copy")
        else:
            prior_digest = None
        require(total <= MAX_TOTAL, "total_blob_size_limit")
        kinds = sorted({kind(p) for p in (path, previous) if p})
        backend = bool(set(kinds) & backend_kinds)
        manual = backend and (status in ("removed","renamed","copied") or bool(set(kinds)&manual_kinds))
        require(row["review_kinds"] == kinds and row["backend"] is backend and row["manual_review_required"] is manual, "inventory_classification_mismatch")
        for p in (path,previous):
            match = re.match(r"supabase/functions/([a-z0-9][a-z0-9-]*)/", p or "")
            if match:
                edge_names.add(match[1])
        files.append({"path":path,"status":status,"sha256":sha256,"previous_sha256":prior_digest,"backend":backend,"kinds":kinds,"manual":manual})
    require(covered == delta, "incomplete_git_inventory")
    require([f["path"] for f in files] == sorted(seen), "noncanonical_inventory")
    backend = any(f["backend"] for f in files)
    checks = ["backup_review","database_review","edge_review","server_verification","pages_verification","post_release_verification"] if backend else ["pages_verification","post_release_verification"]
    require(plan["backend_required"] is backend and plan["edge_functions"] == sorted(edge_names)
            and plan["required_checks"] == checks
            and plan["requires_shared_dependency_review"] is any("edge_shared_review" in f["kinds"] for f in files)
            and plan["requires_manual_review"] is any(f["manual"] for f in files), "plan_classification_mismatch")
    return {"base_sha":base,"candidate_sha":candidate,"plan_sha256":claimed,"files":files,"edge_functions":sorted(edge_names),"execution_enabled":False}


# Only trusted controller code can map these fixed identifiers to handlers later.
# No shell strings, URLs, SQL text, environment, or candidate-provided registry.
ORDER = {"backup":0,"apply_sql":1,"apply_scheduler":2,"deploy_edge":3,"verify_backend":4,"publish_pages":5,"verify_live":6}


def validate_recipe(verified, registry):
    require(isinstance(registry, dict) and set(registry)=={"schema","recipes"} and registry["schema"]==1 and isinstance(registry["recipes"],list), "invalid_trusted_registry")
    matches = [r for r in registry["recipes"] if isinstance(r,dict) and r.get("plan_sha256")==verified["plan_sha256"]]
    require(len(matches)==1, "no_unique_trusted_recipe")
    recipe=matches[0]
    require(set(recipe)=={"plan_sha256","base_sha","candidate_sha","tasks"} and all(recipe[k]==verified[k] for k in ("plan_sha256","base_sha","candidate_sha")), "trusted_recipe_pin_mismatch")
    tasks=recipe["tasks"]
    require(isinstance(tasks,list) and 0<len(tasks)<=100, "invalid_trusted_tasks")
    expected={f["path"]:f for f in verified["files"] if f["backend"]}
    require(all(not f["manual"] and f["status"] in ("added","modified") for f in expected.values()), "manual_backend_review_required")
    consumed=set()
    edge_seen=set()
    stages=[]
    for task in tasks:
        require(isinstance(task,dict) and set(task)=={"op","files","edge_function"} and task["op"] in ORDER and isinstance(task["files"],list), "unknown_or_invalid_operation")
        op=task["op"]
        stages.append(op)
        if op in ("apply_sql","apply_scheduler","deploy_edge"):
            require(bool(task["files"]), "empty_operation_files")
            if op=="deploy_edge":
                name=task["edge_function"]
                require(isinstance(name,str) and name in verified["edge_functions"] and name not in edge_seen, "edge_not_allowlisted")
                edge_seen.add(name)
            else:
                require(task["edge_function"] is None and len(task["files"])==1, "invalid_sql_operation")
            for pin in task["files"]:
                require(isinstance(pin,dict) and set(pin)=={"path","sha256"} and isinstance(pin["path"],str), "invalid_file_pin")
                path=pin["path"]
                f=expected.get(path)
                k={"apply_sql":"db_review","apply_scheduler":"scheduler_review","deploy_edge":"edge_review"}[op]
                require(f is not None and path not in consumed and f["kinds"]==[k] and f["sha256"]==pin["sha256"], "file_not_allowlisted")
                if op=="deploy_edge":
                    require(path.startswith("supabase/functions/"+task["edge_function"]+"/"), "wrong_edge_scope")
                consumed.add(path)
        else:
            require(not task["files"] and task["edge_function"] is None, "unexpected_operation_parameters")
    require(stages==sorted(stages,key=ORDER.get), "unsafe_operation_order")
    fixed=["backup","verify_backend","publish_pages","verify_live"] if expected else ["publish_pages","verify_live"]
    require([s for s in stages if s in ("backup","verify_backend","publish_pages","verify_live")]==fixed, "missing_or_duplicate_checkpoint")
    require(consumed==set(expected) and edge_seen==set(verified["edge_functions"]), "incomplete_trusted_recipe")
    return {"recipe_verified":True,"plan_sha256":verified["plan_sha256"],"execution_enabled":False}


def inspect_trusted_recipe(root, envelope):
    verified=verify_manifest(root,envelope)
    # Fixed sibling of trusted controller. Never read registry from candidate SHA.
    return validate_recipe(verified,read_json(REGISTRY.read_bytes()))
