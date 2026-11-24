"""Solo-operator backup automation candidate, generated fixture only.
No live exporter, provider credentials, production database, or public artifacts.
Uses a durable private simulated store and a separately retained recovery key.
The production lock remains in the existing entry point; this module cannot deploy.
"""
import hashlib
import os
import pathlib
import stat
import tempfile
import re
import integrated_backup as pg
import integrated_stream_fixture as stream
import integrated_drive_setup as setup
import integrated_vault as v

SCOPE="solo_backup_automation_fixture_v1"
JOB=re.compile(r"[a-f0-9]{32}")
CHUNK=4*1024**2
SQL="""
CREATE SCHEMA beagu_private;
CREATE TABLE beagu_private.solo_fixture(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, body text NOT NULL);
ALTER TABLE beagu_private.solo_fixture ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON beagu_private.solo_fixture FOR SELECT USING (true);
INSERT INTO beagu_private.solo_fixture(body) VALUES ('fixture-a'),('fixture-b'),('fixture-c');
SELECT nextval(pg_get_serial_sequence('beagu_private.solo_fixture','id'));
"""
require=v.require

def locations(store,ledger,key_file):
    store,ledger=stream.root_check(store),stream.root_check(ledger)
    key_file=setup.private_parent(key_file)
    roots=(store,ledger,key_file.parent)
    require(len(set(roots))==3 and not any(a in b.parents for a in roots for b in roots if a!=b),"solo_backup_paths_overlap")
    return store,ledger,key_file

def read_key(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        require(stat.S_ISREG(os.fstat(fd).st_mode),"solo_backup_key_not_file")
        return v.key_from_fd(fd)
    finally:os.close(fd)

def marker(ledger,job,suffix,value):
    require(v.match(JOB,job),"solo_backup_job_invalid")
    try:v.write_exclusive(ledger,job+suffix,v.canonical(value))
    except FileExistsError:raise ValueError("solo_backup_already_attempted") from None

def copy_verified(source,dest,name,digest):
    # Local simulation of a remote object readback. No network or Drive write.
    h=hashlib.sha256()
    with stream.fresh_output(dest,name) as out:
        with stream.input_object(source,name) as f:
            while True:
                chunk=f.read(CHUNK)
                if not chunk:break
                h.update(chunk);out.write(chunk)
            require(h.hexdigest()==digest,"solo_backup_ciphertext_mismatch")

def recover_fixture(store,ledger,key_file,job,expected_manifest_sha,plan,base,candidate):
    """Reopen private checkpoint after restart; restore into a NEW isolated PG17."""
    store,ledger,key_file=locations(store,ledger,key_file)
    require(v.match(JOB,job) and v.match(v.HASH,expected_manifest_sha),"solo_backup_job_invalid")
    v.check_pins(plan,base,candidate)
    raw=v.read_private(ledger,job+".manifest.json")
    require(v.digest(raw)==expected_manifest_sha,"solo_backup_manifest_mismatch")
    m=v.parse(raw)
    require(isinstance(m,dict) and set(m)=={"scope","job","pin","source_fingerprint"} and m["scope"]==SCOPE and m["job"]==job,"solo_backup_manifest_invalid")
    pin=m["pin"]
    require(isinstance(pin,dict) and set(pin)==stream.PIN_KEYS and v.match(v.HEX32,pin["checkpoint_id"]),"solo_backup_manifest_invalid")
    key=read_key(key_file)
    name=pin["checkpoint_id"]+".stream"
    with tempfile.TemporaryDirectory(prefix="solo-recover-",dir=ledger) as tmp:
        root=pathlib.Path(tmp);received=root/"receive";restored=root/"restore"
        received.mkdir(mode=0o700);restored.mkdir(mode=0o700)
        copy_verified(store,received,name,pin["object_sha256"])
        stream.restore(received,restored,key,pin["key_id"],pin,plan,base,candidate)
        with stream.input_object(restored,pin["checkpoint_id"]+".restored") as f:
            data=f.read(pg.MAX_BACKUP+1)
            require(0<len(data)<=pg.MAX_BACKUP,"solo_fixture_restore_size")
        with pg.FixtureCluster(17) as target:
            target.restore(data)
            observed=pg.fingerprint(target,"fixture_restore")
            require(observed==m["source_fingerprint"],"solo_backup_restore_mismatch")
    return {"scope":SCOPE,"manifest_sha256":expected_manifest_sha,"checkpoint_sha256":pin["object_sha256"],"automatic_restore_verified":True,"remote_simulation_readback_verified":True,"separate_pg17_target_verified":True,"independent_observer_verified":False,"actual_drive_transfer_verified":False,"production_backup_proof":False,"execution_enabled":False}

def run_fixture(store,ledger,key_file,job,plan,base,candidate):
    """Generate only fixed synthetic data. Persist encrypted object and manifest.
    Failure after attempt marker is fail-closed; no automatic retry or deletion.
    """
    store,ledger,key_file=locations(store,ledger,key_file)
    require(v.match(JOB,job),"solo_backup_job_invalid")
    v.check_pins(plan,base,candidate)
    key=read_key(key_file)
    marker(ledger,job,".attempt.json",{"scope":SCOPE,"job":job,"plan_sha256":plan,"base_sha":base,"candidate_sha":candidate,"execution_enabled":False})
    with pg.FixtureCluster(17) as source, tempfile.TemporaryDirectory(prefix="solo-capture-",dir=ledger) as tmp:
        import io
        source.sql("fixture_source",SQL)
        manifest,data=pg.capture_checkpoint(source,plan,base,candidate)
        pin=stream.seal(pathlib.Path(tmp),io.BytesIO(data),len(data),key,"solo-fixture-retained-key",plan,base,candidate)
        del data
        copy_verified(pathlib.Path(tmp),store,pin["checkpoint_id"]+".stream",pin["object_sha256"])
        record={"scope":SCOPE,"job":job,"pin":pin,"source_fingerprint":manifest["fingerprint"]}
        digest=v.digest(v.canonical(record))
        marker(ledger,job,".manifest.json",record)
        proof=recover_fixture(store,ledger,key_file,job,digest,plan,base,candidate)
        require(pg.fingerprint(source,"fixture_source")==manifest["fingerprint"],"solo_backup_source_changed")
        proof={**proof,"source_unchanged":True}
        marker(ledger,job,".complete.json",proof)
        return proof
