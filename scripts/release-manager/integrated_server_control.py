"""Server-side PostgreSQL fixture ledger for the same integrated runner interface.
Only a newly created FixtureCluster is used. No remote URLs, production credentials,
or external API dispatch. Separate control DB prevents backup fingerprint drift.
"""
import json
import integrated_runner as runner
import integrated_verify as verify
import integrated_backup as backup

DB="beagu_integrated_control_fixture"

def install(cluster,root,base,candidate):
    runner.require(type(cluster) is backup.FixtureCluster and cluster.container is not None,"isolated_cluster_required")
    cluster.exec("createdb","-U","postgres",DB)
    # Source files are the trusted controller checkout, not candidate Git contents.
    for path in ("supabase/migrations/20261121_site_release_manager.sql","supabase/migrations/20261121_site_release_directory_overlay.sql","supabase/release-transition-v2.sql","supabase/integrated-release-control-fixture-v1.sql"):
        execute(cluster,(root/path).read_bytes())
    runner.require(verify.sha(base) and verify.sha(candidate),"invalid_fixture_sha")
    execute(cluster,("UPDATE public.beagu_site_release_state_v1 SET production_sha='"+base+"',draft_sha='"+candidate+"',draft_version='fixture',draft_summary='fixture' WHERE id=1;").encode())

def execute(cluster,data,role="postgres"):
    runner.require(type(cluster) is backup.FixtureCluster and cluster.container is not None,"isolated_cluster_required")
    runner.require(role in ("postgres","service_role","anon","authenticated"),"invalid_fixture_role")
    prefix=("SET ROLE "+role+";\n").encode() if role!="postgres" else b""
    return cluster.exec("psql","-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",DB,data=prefix+data)

class PostgresLedger:
    def __init__(self,cluster):
        self.cluster=cluster

    def rpc(self,action,payload):
        runner.require(action in ("create","claim","finish","status"),"invalid_control_action")
        # Hex encoded UTF-8 JSON is data, not SQL syntax.
        raw=json.dumps({"scope":runner.SCOPE,**payload},ensure_ascii=False,separators=(",",":")).encode().hex()
        sql="SELECT public.beagu_integrated_fixture_transition_v1('"+action+"',convert_from(decode('"+raw+"','hex'),'UTF8')::jsonb);"
        value=json.loads(execute(self.cluster,sql.encode(),"service_role"))
        if value.get("error"):raise ValueError(value["error"])
        return value

    def create(self,verified,registry,approval):
        verify.validate_recipe(verified,registry)
        recipe=next(r for r in registry["recipes"] if r["plan_sha256"]==verified["plan_sha256"])
        pins={k:verified[k] for k in ("base_sha","candidate_sha","plan_sha256")}
        recipe_sha=runner.digest(recipe)
        runner.require(approval=={"scope":runner.SCOPE,**pins,"recipe_sha256":recipe_sha,"confirmed":True},"approval_pin_mismatch")
        return self.rpc("create",{**pins,"recipe_sha256":recipe_sha,"approval_sha256":runner.digest(approval),"confirmed":True,"tasks":recipe["tasks"]})["id"]

    def claim(self,job,verified,registry,observed_base):
        verify.validate_recipe(verified,registry)
        recipe=next(r for r in registry["recipes"] if r["plan_sha256"]==verified["plan_sha256"])
        runner.require(observed_base==verified["base_sha"],"stale_or_changed_plan")
        value=self.rpc("claim",{"job_id":job,"observed_base":observed_base,"candidate_sha":verified["candidate_sha"],"plan_sha256":verified["plan_sha256"],"recipe_sha256":runner.digest(recipe)})
        if value.get("completed"):return None
        runner.require(value["task"]==recipe["tasks"][value["idx"]],"stored_task_mismatch")
        return value

    def finish(self,job,claim,evidence=None):
        self.rpc("finish",{"job_id":job,**claim,"evidence":evidence})

    def snapshot(self,job):
        return self.rpc("status",{"job_id":job})
