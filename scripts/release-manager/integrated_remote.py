"""Stage 4 remote connection contract; isolated TLS rehearsal only.
The production gateway and provider credentials do not exist in this module.
Never interpret a candidate URL, shell command, or unsigned success as evidence.
"""
import base64
import hashlib
import http.client
import ipaddress
import json
import pathlib
import re
import ssl
import uuid
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
import integrated_backup as backup
import integrated_package as package
import integrated_verify as verify
import integrated_runner as runner

SCOPE=runner.SCOPE
MAX_RESPONSE=2*1024*1024
MAX_UPLOAD=20*1024*1024
HEX=re.compile(r"[0-9a-f]{64}")
ID=re.compile(r"[0-9a-f-]{32,36}")
PROVIDER_ID=re.compile(r"[A-Za-z0-9_.:-]{1,120}")
OPS={"deploy_edge":"executor","publish_pages":"executor","verify_backend":"observer","verify_live":"observer"}

def require(ok,code):runner.require(ok,code)
def hash_bytes(data):return hashlib.sha256(data).hexdigest()
def canonical(value):return runner.canonical(value).encode("utf8")
def digest(value):return hash_bytes(canonical(value))
def valid_digest(value):return isinstance(value,str) and HEX.fullmatch(value) is not None

class LoopbackTLS:
    """Real TLS transport, explicitly limited to loopback during independent development.
    No redirect, proxy, DNS resolution, automatic retry, or production endpoint.
    Certificate trust and its SHA256 pin are provisioned by the trusted harness.
    """
    def __init__(self,host,port,ca_pem,cert_sha256):
        require(isinstance(host,str) and ipaddress.ip_address(host).is_loopback,"remote_endpoint_not_fixture")
        require(type(port) is int and 1<=port<=65535 and valid_digest(cert_sha256),"invalid_transport_pins")
        self.host,self.port,self.cert_sha256=host,port,cert_sha256
        self.context=ssl.create_default_context(cadata=ca_pem)
        self.context.minimum_version=ssl.TLSVersion.TLSv1_2
    def exchange(self,body):
        raw=canonical(body)
        require(len(raw)<=MAX_UPLOAD*2,"remote_request_too_large")
        conn=http.client.HTTPSConnection(self.host,self.port,context=self.context,timeout=15)
        try:
            conn.connect()
            require(hash_bytes(conn.sock.getpeercert(binary_form=True))==self.cert_sha256,"remote_certificate_pin_mismatch")
            conn.request("POST","/integrated-fixture/v1",body=raw,headers={"Content-Type":"application/json","Accept":"application/json"})
            res=conn.getresponse()
            require(res.status==200,"remote_effect_uncertain")
            require(res.getheader("Content-Type","").split(";")[0]=="application/json","invalid_remote_content_type")
            data=res.read(MAX_RESPONSE+1)
            require(0<len(data)<=MAX_RESPONSE,"remote_response_size")
            return verify.read_json(data)
        finally:conn.close()

class Bridge:
    """Only accepts receipts from separately provisioned executor and observer keys.
    The control plane must bind job, lease, plan and candidate before each call.
    Signed evidence is stored privately before returning completion to the runner.
    """
    def __init__(self,transports,public_keys,receipt_dir,target):
        require(set(transports)==set(public_keys)=={"executor","observer"},"missing_independent_roles")
        require(all(type(t) is LoopbackTLS for t in transports.values()),"untrusted_remote_transport")
        require(all(isinstance(k,bytes) and len(k)==32 for k in public_keys.values()) and public_keys["executor"]!=public_keys["observer"],"nonindependent_receipt_keys")
        require(isinstance(target,str) and re.fullmatch(r"fixture-[a-z0-9-]{1,60}",target),"non_fixture_target")
        self.transports=transports
        self.keys={r:Ed25519PublicKey.from_public_bytes(k) for r,k in public_keys.items()}
        self.directory=pathlib.Path(receipt_dir)
        backup.safe_dir(self.directory)
        self.target=target
    def invoke(self,job,claim,verified,expected,artifact=None):
        op=claim["task"]["op"]
        require(op in OPS,"unsupported_remote_operation")
        require(isinstance(job,str) and ID.fullmatch(job) and isinstance(claim["lease"],str) and ID.fullmatch(claim["lease"]) and type(claim["idx"]) is int and 0<=claim["idx"]<100,"invalid_remote_claim")
        require(verify.sha(verified["base_sha"]) and verify.sha(verified["candidate_sha"]) and valid_digest(verified["plan_sha256"]),"invalid_remote_plan")
        role=OPS[op]
        require(isinstance(expected,dict) and expected and all(isinstance(k,str) and valid_digest(v) for k,v in expected.items()),"invalid_expected_evidence")
        if role=="executor":
            require(isinstance(artifact,bytes) and 0<len(artifact)<=MAX_UPLOAD and expected.get("artifact_sha256")==hash_bytes(artifact),"remote_artifact_pin_mismatch")
        else:require(artifact is None,"observer_cannot_deploy")
        request={"schema":1,"scope":SCOPE,"target":self.target,"job_id":job,"idx":claim["idx"],
            "lease":claim["lease"],"nonce":uuid.uuid4().hex,"operation":op,
            "base_sha":verified["base_sha"],"candidate_sha":verified["candidate_sha"],
            "plan_sha256":verified["plan_sha256"],"task_sha256":digest(claim["task"]),
            "expected":expected,"artifact_base64":base64.b64encode(artifact).decode("ascii") if artifact is not None else None}
        # No retries after a network error: the remote side might already have applied an effect.
        envelope=self.transports[role].exchange(request)
        require(isinstance(envelope,dict) and set(envelope)=={"receipt","signature"},"unsigned_remote_receipt")
        receipt=envelope["receipt"]
        require(isinstance(receipt,dict) and set(receipt)=={"schema","scope","target","role","operation","request_sha256","status","observed","provider_id"},"invalid_remote_receipt")
        try:
            signature=base64.b64decode(envelope["signature"],validate=True)
            self.keys[role].verify(signature,canonical(receipt))
        except (InvalidSignature,ValueError,TypeError):
            raise ValueError("remote_receipt_signature_invalid") from None
        require(receipt["schema"]==1 and receipt["scope"]==SCOPE and receipt["target"]==self.target
            and receipt["role"]==role and receipt["operation"]==op and receipt["request_sha256"]==digest(request),"remote_receipt_pin_mismatch")
        require(receipt["status"]==("applied" if role=="executor" else "verified") and receipt["observed"]==expected
            and isinstance(receipt["provider_id"],str) and PROVIDER_ID.fullmatch(receipt["provider_id"]),"remote_effect_not_verified")
        # Keep full signed proof private. No archive bytes, keys, or leases in public status.
        proof={"request_sha256":digest(request),"receipt":receipt,"signature":envelope["signature"]}
        name=job+"-"+str(claim["idx"])+".receipt.json"
        backup.private_write(self.directory/name,canonical(proof))
        return {"scope":SCOPE,"ok":True,"operation":op,"plan_sha256":verified["plan_sha256"],
            "remote_receipt_sha256":digest(proof),"provider_id":receipt["provider_id"],"execution_enabled":False}

class RemoteFixtureAdapter:
    """Integrates real transport and independent observations into the existing runner.
    The local adapter remains responsible for encrypted backup and fixed synthetic SQL.
    A trusted harness supplies all package pins and expected backend fingerprint.
    """
    scope=SCOPE
    def __init__(self,local,bridge,root,artifact_dir,package_pins,backend_fingerprint):
        require(getattr(local,"scope",None)==SCOPE and type(bridge) is Bridge,"non_fixture_adapter")
        require(valid_digest(backend_fingerprint),"missing_backend_fingerprint")
        self.local,self.bridge,self.root=local,bridge,root
        self.directory=pathlib.Path(artifact_dir);backup.safe_dir(self.directory)
        self.pins=package_pins;self.backend_fingerprint=backend_fingerprint
        self.claim=None;self.job=None
    def bind_claim(self,job,claim):
        self.job,self.claim=job,claim
    def observed_base(self):return self.local.observed_base()
    def backup(self,t,f,p):return self.local.backup(t,f,p)
    def apply_sql(self,t,f,p):return self.local.apply_sql(t,f,p)
    def apply_scheduler(self,t,f,p):return self.local.apply_scheduler(t,f,p)
    def package_key(self,t):
        return "edge:"+t["edge_function"] if t["op"]=="deploy_edge" else "pages"
    def build_and_send(self,t,p):
        require(self.claim and self.claim["task"]==t,"missing_remote_claim")
        key=self.package_key(t)
        inventory,pin=self.pins[key]
        require(inventory["operation"]==t["op"] and inventory["edge_function"]==t["edge_function"],"remote_package_scope_mismatch")
        dest=self.directory/(key.replace(":","-")+".tar")
        receipt=package.build(self.root,p,inventory,pin,dest)
        package.verify_artifact(dest,inventory,receipt)
        raw=backup.private_read(dest,MAX_UPLOAD)
        return self.bridge.invoke(self.job,self.claim,p,{"artifact_sha256":receipt["artifact_sha256"],"inventory_sha256":pin},raw)
    def deploy_edge(self,t,f,p):return self.build_and_send(t,p)
    def publish_pages(self,t,f,p):return self.build_and_send(t,p)
    def verify_backend(self,t,f,p):
        require(self.claim and self.claim["task"]==t,"missing_remote_claim")
        # Independent observer must measure DB and deployed Edge package inventory,
        # not simply return an executor's success flag.
        expected={"database_fingerprint_sha256":self.backend_fingerprint}
        for edge in p["edge_functions"]:
            inventory,pin=self.pins["edge:"+edge]
            dest=self.directory/("edge-"+edge+".tar")
            expected["edge_"+edge+"_artifact_sha256"]=hash_bytes(backup.private_read(dest,MAX_UPLOAD))
            expected["edge_"+edge+"_inventory_sha256"]=pin
        return self.bridge.invoke(self.job,self.claim,p,expected)
    def verify_live(self,t,f,p):
        require(self.claim and self.claim["task"]==t,"missing_remote_claim")
        inventory,pin=self.pins["pages"]
        raw=backup.private_read(self.directory/"pages.tar",MAX_UPLOAD)
        # Observer must independently hash served bytes for every approved public path.
        # Fixture only: actual provider rollout, cache, release stamp, and domain are not claimed.
        expected={"artifact_sha256":hash_bytes(raw),"inventory_sha256":pin,
            "served_file_set_sha256":digest(inventory["files"])}
        return self.bridge.invoke(self.job,self.claim,p,expected)
