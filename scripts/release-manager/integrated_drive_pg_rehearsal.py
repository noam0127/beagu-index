"""PG17 synthetic-only remote checkpoint rehearsal. No production effect path.

Only a fresh networkless local fixture cluster, internally seeded SQL, ephemeral
key, one bounded multipart create, and restore of remote readback are accepted.
No database URL, existing container, arbitrary dump, production key, or recipe.
Public CI supplies simulated Drive transport; local explicit CLI only for live.
"""
import argparse
import json
import os
import pathlib
import subprocess
import tempfile
import integrated_backup as backup
import integrated_drive_rehearsal as fixture
import integrated_drive_setup as setup
import integrated_drive_checkpoint as drive
import integrated_vault as vault

PINS=fixture.PINS
KEY_ID=fixture.KEY_ID
SQL="""
CREATE SCHEMA beagu_private;
CREATE TABLE public.fixture(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, label text NOT NULL);
CREATE TABLE beagu_private.fixture_child(id bigint PRIMARY KEY REFERENCES public.fixture(id), value integer NOT NULL);
ALTER TABLE public.fixture ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON public.fixture FOR SELECT USING (true);
INSERT INTO public.fixture(label) VALUES ('synthetic-a'),('synthetic-b'),('synthetic-c');
INSERT INTO beagu_private.fixture_child VALUES (1,7),(2,12),(3,0);
SELECT nextval(pg_get_serial_sequence('public.fixture','id'));
"""
def check_pg(cluster,db):
    backup.require(cluster.sql(db,"SELECT current_setting('server_version_num')::int / 10000;").strip()==b"17","fixture_pg_version_mismatch")
    backup.require(cluster.sql(db,"SELECT count(*) FROM public.fixture;").strip()==b"3","fixture_pg_rows_mismatch")
    backup.require(cluster.sql(db,"SELECT count(*) FROM beagu_private.fixture_child;").strip()==b"3","fixture_pg_rows_mismatch")
    backup.require(cluster.sql(db,"SELECT relrowsecurity FROM pg_class WHERE oid='public.fixture'::regclass;").strip()==b"t","fixture_pg_rls_mismatch")

def rehearsal(parent,c,transport_factory=fixture.FixtureTransport,refresh_transport=None,*,state=None):
    state={} if state is None else state
    state["phase"]="local_pg_fixture"
    setup.validate_config(c)
    parent=setup.private_parent(pathlib.Path(parent)/"placeholder").parent
    with tempfile.TemporaryDirectory(prefix="pg-drive-fixture-",dir=parent) as tmp, backup.FixtureCluster(17) as cluster:
        root=pathlib.Path(tmp)
        cluster.sql("fixture_source",SQL)
        check_pg(cluster,"fixture_source")
        key=os.urandom(32)
        send=root/"send";send.mkdir(mode=0o700)
        pin=backup.encrypted_checkpoint(cluster,send,key,KEY_ID,*PINS)
        encrypted=vault.read_private(send,pin["checkpoint_id"]+".vault")
        backup.require(len(encrypted)<=fixture.MAX_FIXTURE,"fixture_too_large")
        state["phase"]="oauth_refresh"
        token=setup.refresh_access(c,refresh_transport or setup.SetupHTTPS(c["folder_id"]))
        transport=transport_factory(c["folder_id"],encrypted)
        adapter=drive.DriveCheckpoint(c["folder_id"],c["owner_permission_id"],transport)
        state["phase"]="drive_transfer"
        fixture.transfer_small_fixture(adapter,send,key,pin,token,state)
        state["phase"]="remote_pg_restore"
        remote=transport.downloaded
        backup.require(isinstance(remote,bytes) and vault.digest(remote)==pin["object_sha256"],"fixture_remote_bytes_missing")
        receive=root/"receive";receive.mkdir(mode=0o700)
        vault.write_exclusive(receive,pin["checkpoint_id"]+".vault",remote)
        proof=backup.rehearse_encrypted_restore(cluster,receive,key,KEY_ID,pin,*PINS)
        check_pg(cluster,"fixture_restore")
        result={"scope":"synthetic_postgresql17_only","postgresql_major":17,"fixture_object_sha256":pin["object_sha256"],"encrypted_upload_verified":True,"download_verified":True,"fixture_restore_verified":proof["restore_verified"],"schema_rows_sequences_verified":True,"rls_verified":True,"fixture_rows":6,"production_backup_executed":False,"production_backup_proof":False,"independent_observer_verified":False,"execution_enabled":False}
    return result

def main():
    p=argparse.ArgumentParser(description="Only fresh isolated PG17 synthetic data, never an operating backup")
    p.add_argument("--oauth-file",required=True)
    p.add_argument("--key-file",required=True)
    p.add_argument("--confirm-pg-fixture-upload",action="store_true",required=True)
    a=p.parse_args()
    state={"phase":"local_credentials"}
    try:
        setup.key_file(a.key_file)
        c=setup.read_config(a.oauth_file)
        print(json.dumps(rehearsal(pathlib.Path(a.oauth_file).absolute().parent,c,state=state),sort_keys=True))
    except (ValueError,OSError,KeyError,TypeError,RuntimeError,subprocess.SubprocessError) as exc:
        reason=fixture.error_code(exc)
        if isinstance(exc,RuntimeError) or isinstance(exc,subprocess.SubprocessError):reason="isolated_postgres_command_failed"
        print(json.dumps({"fixture_verified":False,"phase":state["phase"],"reason":reason,"remote_object_may_exist":bool(state.get("upload_may_be_attempted")),"execution_enabled":False}))
        raise SystemExit(1) from None
if __name__=="__main__":main()
