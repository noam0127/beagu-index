// Browser controller contract: real DOM event wiring via isolated minimal DOM, no live fetch.
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),crypto=require("node:crypto");
const html=fs.readFileSync("admin-updates.html","utf8"),src=fs.readFileSync("js/beagu-admin-updates-v1.js","utf8");
class Node{
 constructor(){this.textContent="";this.value="";this.hidden=false;this.disabled=false;this.dataset={};this.children=[];this.listeners={};this.classList={toggle(){}};}
 replaceChildren(){this.children=[];} append(...nodes){this.children.push(...nodes);} addEventListener(name,fn){this.listeners[name]=fn;} querySelectorAll(){return [];}
}
const nodes={};for(const m of html.matchAll(/id="([^"]+)"/g))nodes[m[1]]=new Node();
const el=id=>{assert.ok(nodes[id],id);return nodes[id]};
const base="a".repeat(40),candidate="b".repeat(40),uuid="00000000-0000-0000-0000-000000000001";
const state={production_sha:base,draft_sha:candidate,draft_version:"v1.10.1",draft_summary:"fixture",production_version:"old"};
const plan={schema:1,policy:"integrated-review-v1",base_sha:base,candidate_sha:candidate,version:state.draft_version,summary:state.draft_summary,backend_required:true,execution_enabled:false,inventory:[{path:"supabase/fixture.sql",status:"added",review_kinds:["db_review"],backend:true}],required_checks:["backup_review"],requires_manual_review:false};
const review={plan,plan_sha256:crypto.createHash("sha256").update(JSON.stringify(plan)).digest("hex"),approved:false,execution_enabled:false};
review.solo_preparation={schema:1,mode:"solo_operator",base_sha:base,candidate_sha:candidate,plan_sha256:review.plan_sha256,recipe_sha256:null,owner_mfa_verified:true,approval_recorded:false,automatic_backup_connected:false,execution_enabled:false,blockers:["trusted_recipe_missing","production_backup_connection_unverified","automatic_restore_unverified","single_approval_integration_unverified","waterway_baseline_unverified","production_execution_locked"]};
let status={state,direct_release_v1:true,direct_candidate_ready:false,direct_candidate_reason:"backend_integrated_required"},preview=review,job=null,wait=null,delivered=false;
const calls=[];
const response=(obj,code=200)=>new Response(JSON.stringify(obj),{status:code});
const context={document:{getElementById:el,createElement:()=>new Node(),activeElement:null,hidden:false},window:{confirm:()=>{throw Error("no approval in review")},addEventListener(){}},supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:"fixture"}}})}},SUPABASE_URL:"https://fixture.invalid",SUPABASE_PUBLISHABLE_KEY:"fixture",crypto:crypto.webcrypto,TextEncoder,Uint8Array,AbortSignal,Date,Response,console,setInterval:()=>1,clearInterval(){},fetch:async(url,options)=>{
 if(String(url).startsWith("/release-info.json"))return response({environment:"production",commit:base,version:"old"});
 const p=JSON.parse(options.body);calls.push(p);
 if(p.action==="verify")return response({permitted:true,mfa_verified:true,role:"owner"});
 if(p.action==="status")return response(status);
 if(p.action==="inspect_integrated_plan"){if(wait){await wait;delivered=true;}return response(preview);}
 if(p.action==="integrated_fixture_status")return job?response(job):response({error:"integrated_fixture_disabled"},409);
 throw Error("unexpected action "+p.action);
}};
vm.runInNewContext(src,context);
// WebCrypto executes asynchronously in a worker pool. A fixed number of event
// loop turns is not a completion guarantee on a busy CI runner.
const until=async(predicate,label)=>{
 const deadline=Date.now()+5000;
 while(!predicate()){
  if(Date.now()>=deadline)throw Error("Timed out: "+label);
  await new Promise(resolve=>setTimeout(resolve,5));
 }
};
(async()=>{
 await until(()=>el("integratedCandidate").textContent===candidate&&!el("integratedInspect").disabled,"initial dashboard");
 assert.equal(el("integratedApply").disabled,true);assert.equal(el("integratedInspect").disabled,false);
 // Server draft must remain in its own status panel, not the new registration form.
 const fields=["releaseCandidateSha","releaseVersionInput","releaseSummaryInput"];
 assert.ok(fields.every(id=>el(id).value===""));
 const entered=["c".repeat(40),"v1.11.4","새 후보 설명"];
 fields.forEach((id,i)=>el(id).value=entered[i]);
 el("releaseRefresh").listeners.click();
 await until(()=>!el("releaseRefresh").disabled,"manual refresh");
 await new Promise(r=>setImmediate(r));
 assert.deepEqual(fields.map(id=>el(id).value),entered);

 el("integratedInspect").listeners.click();await until(()=>!el("integratedReview").hidden&&!el("integratedInspect").disabled,"review digest completion");
 assert.equal(el("integratedReview").hidden,false);assert.equal(el("integratedDigest").textContent,review.plan_sha256);
 assert.equal(el("integratedFiles").children.length,1);assert.equal(el("integratedSteps").children[0].dataset.state,"planned");
 assert.equal(el("releaseProdApply").disabled,true);
 el("integratedJobId").value=uuid;el("integratedJobForm").listeners.submit({preventDefault(){}});await until(()=>el("integratedNotice").textContent.includes("조회 불가")&&!el("integratedJobLookup").disabled,"disabled fixture response");
 assert.match(el("integratedNotice").textContent,/조회 불가/);
 job={scope:"isolated_fixture_only",execution_enabled:false,id:uuid,base_sha:base,candidate_sha:candidate,plan_sha:review.plan_sha256,status:"blocked",task_count:3,steps:[{idx:0,task:{op:"backup"},status:"done",evidence:"c".repeat(64)},{idx:1,task:{op:"apply_sql"},status:"blocked"},{idx:2,task:{op:"verify_live"},status:"pending"}],recovery:[]};
 el("integratedJobForm").listeners.submit({preventDefault(){}});await until(()=>el("integratedProgress").textContent.includes("중단")&&!el("integratedJobLookup").disabled,"blocked fixture response");
 assert.match(el("integratedProgress").textContent,/중단/);assert.match(el("integratedRecovery").textContent,/자동 재시도 금지/);
 assert.equal(el("integratedSteps").children[1].dataset.state,"blocked");assert.equal(el("integratedRecoveryApply").disabled,true);
 preview={...review,plan_sha256:"0".repeat(64)};
 el("integratedInspect").listeners.click();await until(()=>el("integratedNotice").textContent.includes("명세 조회 실패")&&!el("integratedInspect").disabled,"wrong digest rejected");assert.equal(el("integratedReview").hidden,true);
 preview=review;let resolveWait;wait=new Promise(r=>resolveWait=r);
 const previousRequests=calls.filter(c=>c.action==="inspect_integrated_plan").length;
 el("integratedInspect").listeners.click();await until(()=>calls.filter(c=>c.action==="inspect_integrated_plan").length===previousRequests+1,"delayed request started");
 status={...status,state:{...state,draft_sha:"d".repeat(40)}};
 el("releaseRefresh").listeners.click();await until(()=>el("integratedCandidate").textContent==="d".repeat(40),"new candidate loaded");resolveWait();await until(()=>delivered,"delayed response delivered");
 // Allow the already delivered response body promise to settle; stale path must not start a digest.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(el("integratedReview").hidden,true);assert.equal(el("integratedCandidate").textContent,"d".repeat(40));
 assert.equal(el("integratedApply").disabled,true);assert.equal(el("integratedRecoveryApply").disabled,true);
 assert.ok(calls.every(x=>["verify","status","inspect_integrated_plan","integrated_fixture_status"].includes(x.action)));
 assert.deepEqual(fields.map(id=>el(id).value),entered,"new server draft cannot overwrite typed candidate");

 console.log("PASS: integrated review digest, stale result invalidation, read-only fixture status and locked actions");
})().catch(e=>{console.error(e);process.exitCode=1});
