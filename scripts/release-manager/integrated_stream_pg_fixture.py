"""Only internally generated PG17 fixture; streaming dump/restore, simulated remote."""
import hashlib
import os
import pathlib
import subprocess
import tempfile
import integrated_backup as b
import integrated_stream_fixture as s
import integrated_stream_drive_fixture as remote

PINS=("a"*64,"b"*40,"c"*40)
KEY_ID="synthetic-pg17-stream"
ROWS=192
SQL="""
CREATE SCHEMA beagu_private;
CREATE TABLE beagu_private.stream_fixture(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, body text NOT NULL);
ALTER TABLE beagu_private.stream_fixture ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON beagu_private.stream_fixture FOR SELECT USING (true);
INSERT INTO beagu_private.stream_fixture(body)
SELECT repeat(md5(i::text),32768) FROM generate_series(1,192) i;
SELECT nextval(pg_get_serial_sequence('beagu_private.stream_fixture','id'));
"""
def fingerprint(cluster,db,snapshot=None):
    prefix="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
    if snapshot:
        b.require(b.re.fullmatch(r"[0-9A-Fa-f-]{1,100}",snapshot),"invalid_snapshot")
        prefix+="SET TRANSACTION SNAPSHOT '"+snapshot+"';\n"
    data=cluster.sql(db,prefix+"""
SELECT id,octet_length(body),encode(sha256(convert_to(body,'UTF8')),'hex') FROM beagu_private.stream_fixture ORDER BY id;
SELECT last_value,is_called FROM beagu_private.stream_fixture_id_seq;
SELECT relrowsecurity FROM pg_class WHERE oid='beagu_private.stream_fixture'::regclass;
COMMIT;
""")
    rows=data.splitlines()
    b.require(len(rows)==ROWS+2 and rows[-1]==b"t","stream_pg_fingerprint_invalid")
    schema=cluster.dump(db,snapshot=snapshot,schema_only=True)
    schema=b"\n".join(l for l in schema.splitlines() if not l.startswith((b"\\restrict ",b"\\unrestrict ")))
    return hashlib.sha256(schema+b"\0"+data).hexdigest()

def dump_private(cluster,root,snapshot):
    # Known size is obtained from a synthetic-only private spool, not from a
    # production DB or a full in-memory buffer. Plaintext spool is disposable.
    name="fixture.dump"
    with s.fresh_output(root,name) as out:
        args=b.DOCKER+["exec","-i",cluster.container,"pg_dump","-U","postgres","-d","fixture_source","--format=custom","--compress=0","--snapshot="+snapshot]
        proc=subprocess.run(args,stdout=out,stderr=subprocess.DEVNULL,timeout=240)
        b.require(proc.returncode==0,"stream_pg_dump_failed")
    return name

def rehearsal(parent,transport_factory=None,*,transfer_generated=None):
    parent=s.root_check(parent)
    with tempfile.TemporaryDirectory(prefix="pg-stream-",dir=parent) as tmp,b.FixtureCluster(17) as cluster:
        root=pathlib.Path(tmp)
        dirs={x:root/x for x in ("plain","send","remote","receive","restore")}
        for d in dirs.values():d.mkdir(mode=0o700)
        b.require(cluster.sql("fixture_source","SELECT current_setting('server_version_num')::int / 10000;").strip()==b"17","stream_pg_version")
        cluster.sql("fixture_source",SQL)
        key=os.urandom(32)
        with cluster.snapshot() as snapshot:
            source=fingerprint(cluster,"fixture_source",snapshot)
            name=dump_private(cluster,dirs["plain"],snapshot)
            with s.input_object(dirs["plain"],name) as f:
                size=os.fstat(f.fileno()).st_size
                b.require(128*1024**2<size<=s.MAX,"stream_pg_fixture_size")
                pin=s.seal(dirs["send"],f,size,key,KEY_ID,*PINS)
            b.require(fingerprint(cluster,"fixture_source",snapshot)==source,"stream_pg_snapshot_drift")
        (dirs["plain"]/name).unlink()
        b.require(fingerprint(cluster,"fixture_source")==source,"stream_pg_source_changed")
        if transfer_generated is None:
            transport=transport_factory(dirs["remote"])
            receipt=remote.transfer(dirs["send"],dirs["receive"],pin,transport)
        else:
            receipt=transfer_generated(dirs["send"],dirs["receive"],pin)
        # Only independently read-back ciphertext is eligible for restore.
        verified=s.restore(dirs["receive"],dirs["restore"],key,KEY_ID,pin,*PINS)
        cluster.exec("createdb","-U","postgres","-T","template0","fixture_restore")
        with s.input_object(dirs["restore"],pin["checkpoint_id"]+".restored") as f:
            proc=subprocess.run(b.DOCKER+["exec","-i",cluster.container,"pg_restore","-U","postgres","-d","fixture_restore","--single-transaction","--exit-on-error"],stdin=f,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=240)
            b.require(proc.returncode==0,"stream_pg_restore_failed")
        b.require(source==fingerprint(cluster,"fixture_restore")==fingerprint(cluster,"fixture_source"),"stream_pg_fingerprint_mismatch")
        return {"scope":"synthetic_pg17_stream_simulated_remote_only", "fixture_object_sha256":pin["object_sha256"],"dump_bytes":size,"fixture_rows":ROWS,"stream_restore_verified":verified["restore_verified"],"remote_readback_verified":receipt["readback_verified"],"schema_rows_sequences_rls_verified":True,"actual_drive_transfer_verified":False,"production_backup_proof":False,"execution_enabled":False}
