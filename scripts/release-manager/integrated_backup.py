"""Stage 3: real backup/restore rehearsal in a newly created, network-isolated PostgreSQL.
No production connection, credentials, existing container, or remote Docker host accepted.
Checkpoint evidence is private and is never a production restore authorization.
"""
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import tempfile
import time
import uuid

DOCKER = ["docker", "--host", "unix:///var/run/docker.sock"]
SHA = re.compile(r"[0-9a-f]{40}")
HASH = re.compile(r"[0-9a-f]{64}")
IDENT = re.compile(r"[a-z_][a-z0-9_]{0,62}")
MAX_BACKUP = 128 * 1024 * 1024
SCHEMAS = ("public", "beagu_private")


def require(ok, code):
    if not ok:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def hash_bytes(data):
    return hashlib.sha256(data).hexdigest()


def unique_json(pairs):
    result = {}
    for k, v in pairs:
        require(k not in result, "duplicate_manifest_key")
        result[k] = v
    return result


def ident(value):
    require(isinstance(value, str) and IDENT.fullmatch(value), "invalid_identifier")
    return '"' + value + '"'


def run(args, data=None, timeout=120):
    # Do not include command stderr or row contents in logs.
    proc = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if proc.returncode:
        raise RuntimeError("isolated_postgres_command_failed")
    return proc.stdout


class FixtureCluster:
    """Only owns the random, newly created local container; never accepts a connection string."""
    def __enter__(self):
        self.name = "beagu-backup-fixture-" + uuid.uuid4().hex
        self.container = None
        try:
            self.container = run(DOCKER + ["run", "-d", "--rm", "--network", "none",
                "--name", self.name, "--label", "beagu.release.fixture=backup-v1",
                "-e", "POSTGRES_PASSWORD=disposable-fixture-only", "postgres:16"]).decode().strip()
            require(re.fullmatch(r"[a-f0-9]{64}", self.container), "invalid_container_id")
            config = json.loads(run(DOCKER+["inspect",self.container]))[0]
            require(config["Name"] == "/"+self.name and config["HostConfig"]["NetworkMode"] == "none"
                    and not config["HostConfig"]["PortBindings"] and
                    config["Config"]["Labels"]["beagu.release.fixture"] == "backup-v1"
                    and all(m["Type"]=="volume" for m in config["Mounts"]), "fixture_isolation_failure")
            for _ in range(60):
                try:
                    self.exec("pg_isready","-U","postgres",timeout=5)
                    self.exec("createdb","-U","postgres","fixture_source")
                    return self
                except RuntimeError:
                    time.sleep(1)
            raise RuntimeError("fixture_start_timeout")
        except BaseException:
            self.__exit__(None,None,None)
            raise

    def __exit__(self,*_):
        if self.container and re.fullmatch(r"[a-f0-9]{64}",self.container):
            run(DOCKER+["rm","-f",self.container],timeout=30)
            self.container=None

    def exec(self,*args,data=None,timeout=120):
        require(self.container is not None, "fixture_not_running")
        return run(DOCKER+["exec","-i",self.container,*args],data,timeout)

    def sql(self,db,sql):
        require(db in ("fixture_source","fixture_restore"), "not_fixture_database")
        return self.exec("psql","-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",db,data=sql.encode())

    def dump(self,db,snapshot=None,schema_only=False):
        require(db in ("fixture_source","fixture_restore"), "not_fixture_database")
        args=["pg_dump","-U","postgres","-d",db]
        args+=["--schema-only"] if schema_only else ["--format=custom"]
        if snapshot is not None:
            require(re.fullmatch(r"[0-9A-Fa-f-]{1,100}",snapshot), "invalid_snapshot")
            args+=["--snapshot="+snapshot]
        out=self.exec(*args)
        require(0<len(out)<=MAX_BACKUP, "backup_size_limit")
        return out

    def restore(self,data):
        # createdb refuses an existing name. Never drop or overwrite a database.
        self.exec("createdb","-U","postgres","-T","template0","fixture_restore")
        self.exec("pg_restore","-U","postgres","-d","fixture_restore",
            "--single-transaction","--exit-on-error",data=data)

    def snapshot(self):
        return Snapshot(self)


class Snapshot:
    def __init__(self,cluster):
        self.cluster=cluster
        self.proc=None

    def __enter__(self):
        self.proc=subprocess.Popen(DOCKER+["exec","-i",self.cluster.container,"psql","-X","-qAt",
            "-v","ON_ERROR_STOP=1","-U","postgres","-d","fixture_source"],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        try:
            self.proc.stdin.write(b"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n")
            self.proc.stdin.flush()
            import select
            require(bool(select.select([self.proc.stdout],[],[],30)[0]),"snapshot_timeout")
            self.id=self.proc.stdout.readline().decode().strip()
            require(re.fullmatch(r"[0-9A-Fa-f-]{1,100}",self.id),"invalid_snapshot")
            return self.id
        except BaseException:
            self.__exit__(None,None,None)
            raise

    def __exit__(self,*_):
        if self.proc:
            try:
                self.proc.communicate(b"ROLLBACK;\n\\q\n",timeout=10)
            except (BrokenPipeError,subprocess.TimeoutExpired):
                self.proc.kill()
                self.proc.wait(timeout=10)


def fingerprint(cluster,db,snapshot=None):
    prefix="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
    if snapshot:
        require(re.fullmatch(r"[0-9A-Fa-f-]{1,100}",snapshot),"invalid_snapshot")
        prefix+="SET TRANSACTION SNAPSHOT '"+snapshot+"';\n"
    def q(sql):
        return cluster.sql(db,prefix+sql+"\nCOMMIT;\n")
    # Fail closed on an unexpected application schema or unsupported relation type.
    schemas=json.loads(q("SELECT coalesce(json_agg(nspname ORDER BY nspname),'[]') FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema';"))
    require(set(schemas)<=set(SCHEMAS),"unexpected_fixture_schema")
    relations=json.loads(q("SELECT coalesce(json_agg(json_build_array(n.nspname,c.relname,c.relkind) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','beagu_private') AND c.relkind IN ('r','p','f','m','S');"))
    rows,seqs={},{}
    for schema,table,typ in relations:
        name=ident(schema)+"."+ident(table)
        require(typ in ("r","S"),"unsupported_fixture_relation")
        if typ=="r":
            # COPY escapes embedded newline/tab/backslash; row order and duplicates preserved.
            data=q("COPY (SELECT to_jsonb(t)::text AS row FROM "+name+" t ORDER BY 1 COLLATE \"C\") TO STDOUT;")
            rows[schema+"."+table]={"count":data.count(b"\n"),"sha256":hash_bytes(data)}
        else:
            # Sequence state is non-MVCC. Recheck before/after checkpoint; production writer freeze is separate.
            seqs[schema+"."+table]=q("SELECT last_value::text || ':' || is_called::text FROM "+name+";").decode().strip()
    schema_dump=cluster.dump(db,snapshot=snapshot,schema_only=True)
    normalized=b"\n".join(l for l in schema_dump.splitlines() if not l.startswith((b"\\restrict ",b"\\unrestrict ")))
    return {"tables":rows,"sequences":seqs,"schema_sha256":hash_bytes(normalized)}


def private_write(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())


def private_read(path,limit):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,"rb") as f:
        st=os.fstat(f.fileno())
        require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o600 and 0<st.st_size<=limit,"unsafe_checkpoint_file")
        data=f.read(limit+1)
        require(len(data)==st.st_size<=limit,"checkpoint_size_mismatch")
        return data


def safe_dir(path):
    st=path.lstat()
    require(stat.S_ISDIR(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o700,"unsafe_checkpoint_directory")


def checkpoint(cluster,directory,plan_sha256,base_sha,candidate_sha):
    require(HASH.fullmatch(plan_sha256) and SHA.fullmatch(base_sha) and SHA.fullmatch(candidate_sha) and base_sha!=candidate_sha,"invalid_release_pins")
    directory=pathlib.Path(directory)
    safe_dir(directory)
    require(not list(directory.iterdir()),"checkpoint_directory_not_empty")
    with cluster.snapshot() as snapshot:
        source=fingerprint(cluster,"fixture_source",snapshot)
        data=cluster.dump("fixture_source",snapshot=snapshot)
        require(source==fingerprint(cluster,"fixture_source",snapshot),"snapshot_drift")
    require(source==fingerprint(cluster,"fixture_source"),"source_changed_after_snapshot")
    manifest={"schema":1,"scope":"isolated_fixture_only","checkpoint_id":uuid.uuid4().hex,
              "plan_sha256":plan_sha256,"base_sha":base_sha,"candidate_sha":candidate_sha,
              "dump_sha256":hash_bytes(data),"dump_size":len(data),"fingerprint":source}
    raw=canonical(manifest)
    private_write(directory/"checkpoint.dump",data)
    private_write(directory/"checkpoint.json",raw)
    dirfd=os.open(directory,os.O_DIRECTORY|os.O_RDONLY|os.O_NOFOLLOW)
    try:os.fsync(dirfd)
    finally:os.close(dirfd)
    # Caller must retain this digest separately. Reading a manifest cannot establish freshness.
    return hash_bytes(raw)


def verify_checkpoint(directory,expected_digest,plan_sha256,base_sha,candidate_sha):
    directory=pathlib.Path(directory)
    safe_dir(directory)
    require(isinstance(expected_digest,str) and HASH.fullmatch(expected_digest),"missing_checkpoint_pin")
    raw=private_read(directory/"checkpoint.json",4*1024*1024)
    require(hash_bytes(raw)==expected_digest,"stale_or_tampered_checkpoint")
    m=json.loads(raw,object_pairs_hook=unique_json)
    require(m["schema"]==1 and m["scope"]=="isolated_fixture_only" and
            (m["plan_sha256"],m["base_sha"],m["candidate_sha"])==(plan_sha256,base_sha,candidate_sha),"checkpoint_release_mismatch")
    data=private_read(directory/"checkpoint.dump",MAX_BACKUP)
    require(len(data)==m["dump_size"] and hash_bytes(data)==m["dump_sha256"],"backup_integrity_failure")
    return m,data


def rehearse_restore(cluster,directory,expected_digest,plan_sha256,base_sha,candidate_sha):
    manifest,data=verify_checkpoint(directory,expected_digest,plan_sha256,base_sha,candidate_sha)
    # Refuse stale source even if a historical dump is individually valid.
    require(fingerprint(cluster,"fixture_source")==manifest["fingerprint"],"stale_source_checkpoint")
    cluster.restore(data)
    restored=fingerprint(cluster,"fixture_restore")
    require(restored==manifest["fingerprint"],"restore_fingerprint_mismatch")
    require(fingerprint(cluster,"fixture_source")==manifest["fingerprint"],"source_changed_during_rehearsal")
    return {"checkpoint_sha256":expected_digest,"restore_verified":True,"scope":"isolated_fixture_only","execution_enabled":False}
