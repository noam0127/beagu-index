"""Actual loopback TLS, two independent Ed25519 keys, artifact and live observation.
Provider effects are private in-memory fixture storage; no remote provider calls.
"""
import base64
import copy
import datetime
import hashlib
import http.server
import importlib.util
import ipaddress
import json
import os
import pathlib
import ssl
import sys
import tempfile
import threading
import unittest
import io
import tarfile
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import ed25519,rsa
from cryptography.x509.oid import NameOID

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts/release-manager"))
import integrated_remote as remote
import integrated_backup as b
import integrated_runner as r
spec=importlib.util.spec_from_file_location("runner_fixture",ROOT/"tests/integrated-release-runner.py")
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

class Gateway:
    def __init__(self,root):
        self.keys={role:ed25519.Ed25519PrivateKey.generate() for role in ("executor","observer")}
        self.storage={};self.calls=[];self.bad=None;self.last=None
        key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        subject=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,"127.0.0.1")])
        now=datetime.datetime.now(datetime.timezone.utc)
        cert=(x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(minutes=1))
            .not_valid_after(now+datetime.timedelta(hours=1))
            .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),False)
            .add_extension(x509.BasicConstraints(ca=True,path_length=None),True)
            .sign(key,hashes.SHA256()))
        cert_pem=cert.public_bytes(serialization.Encoding.PEM)
        certfile=root/"cert.pem";certfile.write_bytes(cert_pem)
        keyfile=root/"tls-key.pem";keyfile.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()));keyfile.chmod(0o600)
        owner=self
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                assert self.path=="/integrated-fixture/v1"
                q=json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                role=remote.OPS[q["operation"]]
                owner.calls.append(q["operation"])
                op=q["operation"]
                if role=="executor":
                    raw=base64.b64decode(q["artifact_base64"],validate=True)
                    owner.storage["edge" if op=="deploy_edge" else "pages"]=(raw,q["expected"]["inventory_sha256"])
                    observed={"artifact_sha256":remote.hash_bytes(raw),"inventory_sha256":q["expected"]["inventory_sha256"]}
                elif op=="verify_backend":
                    raw,pin=owner.storage["edge"]
                    observed={"database_fingerprint_sha256":owner.database_fingerprint,
                        "edge_account_artifact_sha256":remote.hash_bytes(raw),"edge_account_inventory_sha256":pin}
                else:
                    raw,pin=owner.storage["pages"]
                    with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
                        files=[{"path":m.name,"sha256":remote.hash_bytes(tar.extractfile(m).read())} for m in tar.getmembers()]
                    observed={"artifact_sha256":remote.hash_bytes(raw),"inventory_sha256":pin,"served_file_set_sha256":remote.digest(files)}
                receipt={"schema":1,"scope":r.SCOPE,"target":q["target"],"role":role,"operation":op,
                    "request_sha256":remote.digest(q),"status":"applied" if role=="executor" else "verified",
                    "observed":observed,"provider_id":"fixture-"+str(len(owner.calls))}
                if owner.bad=="observed":receipt["observed"]={"wrong":"0"*64}
                if owner.bad=="status":receipt["status"]="pending"
                sign_role=("observer" if role=="executor" else "executor") if owner.bad=="signer" else role
                envelope={"receipt":receipt,"signature":base64.b64encode(owner.keys[sign_role].sign(remote.canonical(receipt))).decode()}
                if owner.bad=="replay":envelope=owner.last
                else:owner.last=envelope
                data=remote.canonical(envelope)
                self.send_response(200);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(data)));self.end_headers();self.wfile.write(data)
        self.server=http.server.ThreadingHTTPServer(("127.0.0.1",0),Handler)
        ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(certfile,keyfile)
        self.server.socket=ctx.wrap_socket(self.server.socket,server_side=True)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.transport=remote.LoopbackTLS("127.0.0.1",self.server.server_port,cert_pem.decode(),cert.fingerprint(hashes.SHA256()).hex())
        self.public={role:k.public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw) for role,k in self.keys.items()}
    def close(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
    def bridge(self,directory):
        return remote.Bridge({"executor":self.transport,"observer":self.transport},self.public,directory,"fixture-baegu")

class Remote(g.Runner):
    # Inherit fixture construction, not its existing tests (explicit suite below).
    def gateway(self):
        d=pathlib.Path(self.tmp.name)/"tls";d.mkdir(mode=0o700)
        gw=Gateway(d);self.addCleanup(gw.close)
        proofs=pathlib.Path(self.tmp.name)/"proofs";proofs.mkdir(mode=0o700)
        return gw,gw.bridge(proofs),proofs
    def test_transport_and_signed_failure_modes(self):
        gw,bridge,proofs=self.gateway()
        verified=self.verified
        claim={"idx":2,"lease":"a"*32,"task":self.recipe["tasks"][2]}
        expected={"artifact_sha256":remote.hash_bytes(b"fixture archive"),"inventory_sha256":"c"*64}
        for mode,msg in [("signer","remote_receipt_signature_invalid"),("observed","remote_effect_not_verified"),("status","remote_effect_not_verified")]:
            gw.bad=mode
            with self.assertRaisesRegex(ValueError,msg):
                bridge.invoke(self.job,claim,verified,expected,b"fixture archive")
            self.assertEqual(list(proofs.iterdir()),[])
        gw.bad=None
        proof=bridge.invoke(self.job,claim,verified,expected,b"fixture archive")
        self.assertTrue(proof["ok"]);self.assertFalse(proof["execution_enabled"])
        gw.bad="replay"
        with self.assertRaisesRegex(ValueError,"remote_receipt_pin_mismatch"):
            bridge.invoke(self.job,{**claim,"idx":3},verified,expected,b"fixture archive")
        self.assertEqual(len(list(proofs.iterdir())),1)
        with self.assertRaisesRegex(ValueError,"remote_endpoint_not_fixture"):
            remote.LoopbackTLS("192.0.2.1",443,"","a"*64)
        with self.assertRaisesRegex(ValueError,"nonindependent_receipt_keys"):
            remote.Bridge({"executor":gw.transport,"observer":gw.transport},{"executor":gw.public["executor"],"observer":gw.public["executor"]},proofs,"fixture-baegu")
    def test_runner_remote_sequence_and_independent_live_proof(self):
        gw,bridge,proofs=self.gateway()
        # Fixture observer fingerprint is measured from the real isolated DB after SQL.
        with b.FixtureCluster() as cluster:
            cluster.sql("fixture_source","CREATE TABLE public.existing(id integer PRIMARY KEY); INSERT INTO public.existing VALUES (1),(2);")
            local=g.Adapter(self.base,cluster,self.objects,self.git)
            local.package_pins=self.package_pins
            # Independently reviewed expected schema/data shape, with measured fixture query.
            expected=remote.hash_bytes(b"fixture_added:2")
            pins={"edge:account":self.package_pins["deploy_edge"],"pages":self.package_pins["publish_pages"]}
            adapter=remote.RemoteFixtureAdapter(local,bridge,self.git,self.objects,pins,expected)
            for task in self.recipe["tasks"]:
                if task["op"]=="verify_backend":
                    name=cluster.sql("fixture_source","SELECT to_regclass('public.fixture_added');").strip()
                    count=cluster.sql("fixture_source","SELECT count(*) FROM public.existing;").strip()
                    gw.database_fingerprint=remote.hash_bytes(name+b":"+count)
                runner=r.FixtureRunner(r.Ledger(self.store),self.git,self.envelope,self.registry,adapter)
                self.assertTrue(runner.once(self.job))
            self.assertEqual(self.ledger.snapshot(self.job)["status"],"completed")
            self.assertEqual(gw.calls,["deploy_edge","verify_backend","publish_pages","verify_live"])
            self.assertEqual(len(list(proofs.iterdir())),4)
            self.assertTrue(all(p.stat().st_mode&0o777==0o600 for p in proofs.iterdir()))
            self.assertFalse(runner.once(self.job))

if __name__=="__main__":
    suite=unittest.TestSuite(Remote(name) for name in ("test_transport_and_signed_failure_modes","test_runner_remote_sequence_and_independent_live_proof"))
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(not result.wasSuccessful())
