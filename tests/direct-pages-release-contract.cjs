// Direct release integration harness. All GitHub, Supabase and OIDC calls are isolated mocks.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const BASE='a'.repeat(40),DRAFT='b'.repeat(40),OTHER='c'.repeat(40),BLOB='d'.repeat(40);
const version='v1.2.0',summary='정돈 · UI 개선',repo='noam0127/beagu-index';
const src=fs.readFileSync('supabase/functions/beagu-release-manager-v1/index.ts','utf8');
const state={id:1,production_sha:BASE,production_version:'old',draft_sha:OTHER,draft_version:'old-draft',draft_summary:'old draft',staging_sha:OTHER,public_data_blob_sha:BLOB};
const jobs=[],audit=[];let allowMfa=true,allowCI=true,stale=false,handler;
function query(table){
 let operation='select',value=null,filters=[];
 const rows=()=>table==='beagu_site_release_state_v1'?[state]:table==='beagu_site_release_jobs_v1'?jobs:table==='beagu_admin_accounts'?[{user_id:'owner',role:'owner',enabled:true}]:[];
 const matches=r=>filters.every(f=>f(r));
 const execute=()=>{let found=rows().filter(matches);
  if(operation==='insert'){if(table==='beagu_site_release_jobs_v1'){const j={id:'00000000-0000-0000-0000-000000000001',status:'queued',...value};jobs.push(j);found=[j]}else if(table==='beagu_admin_audit_events'){audit.push(value);found=[value]}}
  if(operation==='update')found.forEach(r=>Object.assign(r,value));
  return {data:found,error:null};
 };
 const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>r[k]==v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},neq(k,v){filters.push(r=>r[k]!==v);return q},lt(){return q},order(){return q},limit(){return q},insert(v){operation='insert';value=v;return q},update(v){operation='update';value=v;return q},async single(){const r=execute();return {...r,data:r.data[0]||null}},async maybeSingle(){return q.single()},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}};
 return q;
}
const db={from:query,auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:async(name,args)=>{if(name!=="beagu_release_transition_v2")return {data:allowMfa,error:null};const p=args.p_payload;let data;if(args.p_action==="register"){if(state.production_sha!==p.base||state.draft_sha!==p.expected_draft)data={error:"direct_draft_conflict"};else{Object.assign(state,{draft_sha:p.sha,draft_version:p.version,draft_summary:p.summary});data={draft_sha:p.sha}}}else if(args.p_action==="enqueue"){if(jobs.some(j=>["queued","running"].includes(j.status)))data={error:"release_in_progress"};else if(state.production_sha!==p.from_sha||state.draft_sha!==p.to_sha)data={error:"direct_draft_conflict"};else{const j={id:"00000000-0000-0000-0000-000000000001",status:"queued",...p};jobs.push(j);data={id:j.id}}}else if(args.p_action==="complete"){const j=jobs.find(j=>j.id===p.job_id);if(!j||j.status!=="running"||state.production_sha!==j.from_sha)data={error:"stale_production_base"};else{state.production_sha=j.to_sha;state.production_version=j.version;j.status="deployed";data={ok:true,version:j.version}}}return {data,error:null}}};
const mockFetch=async(url)=>{const p=String(url);
 let data;
 if(p.includes('/compare/'))data={status:stale?'diverged':'ahead',merge_base_commit:{sha:BASE},files:[{filename:'index.html'}]};
 else if(p.includes('/contents/release-candidate.json'))data={content:Buffer.from(JSON.stringify({version,summary})).toString('base64')};
 else if(p.includes('/actions/runs?'))data={workflow_runs:allowCI?[{head_sha:DRAFT,status:'completed',conclusion:'success',path:'.github/workflows/clean-release-validation.yml',head_repository:{full_name:repo}}]:[]};
 else throw Error('unexpected network '+p);
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
const context={createClient:()=>db,createRemoteJWKSet:()=>({}),jwtVerify:async()=>({payload:{repository:repo,ref:'refs/heads/main',workflow_ref:repo+'/.github/workflows/beagu-release-controller.yml@refs/heads/main',event_name:'workflow_dispatch'}}),Deno:{env:{get:()=>''},serve:fn=>handler=fn},URL,Request,Response,TextDecoder,Uint8Array,AbortSignal,atob,fetch:mockFetch,console};
vm.runInNewContext(stripTypeScriptTypes(src.replace(/^import .*;$/gm,''),{mode:'strip'}),context);
const jwt='stub.'+Buffer.from(JSON.stringify({sub:'owner',aal:'aal2',session_id:'session'})).toString('base64url')+'.stub';
async function call(action,fields={},token=jwt){const headers={'Content-Type':'application/json',Origin:'https://baeguindex.com'};if(token)headers.Authorization='Bearer '+token;const res=await handler(new Request('https://example.test',{method:'POST',headers,body:JSON.stringify({action,...fields})}));return {status:res.status,body:await res.json()}}
(async()=>{
 assert.equal((await call('status',{},null)).status,401);
 allowMfa=false;assert.equal((await call('register_direct',{candidate_sha:DRAFT,version})).body.error,'admin_mfa_required');allowMfa=true;
 for(const action of ['register','stage_apply','stage_rollback','prod_apply'])assert.equal((await call(action)).body.error,'direct_route_required');
 allowCI=false;assert.equal((await call('register_direct',{candidate_sha:DRAFT,version})).body.error,'direct_ci_required');allowCI=true;
 stale=true;assert.equal((await call('register_direct',{candidate_sha:DRAFT,version})).body.error,'direct_candidate_stale');stale=false;
 assert.equal((await call('register_direct',{candidate_sha:DRAFT,version})).body.error,'direct_draft_conflict');
 assert.equal((await call('register_direct',{candidate_sha:DRAFT,version,replace_draft_sha:OTHER})).body.draft_sha,DRAFT);
 assert.equal(state.production_sha,BASE);assert.equal(jobs.length,0);
 assert.equal((await call('status',{check_latest:true})).body.direct_candidate_ready,true);
 assert.equal((await call('prod_direct_apply',{candidate_sha:DRAFT,expected_production_sha:OTHER,confirmed_direct:true})).body.error,'direct_confirmation_required');
 assert.equal((await call('prod_direct_apply',{candidate_sha:DRAFT,expected_production_sha:BASE})).body.error,'direct_confirmation_required');
 assert.equal((await call('prod_direct_apply',{candidate_sha:DRAFT,expected_production_sha:BASE,confirmed_direct:true})).status,202);
 assert.equal(jobs.length,1);assert.equal((await call('wake_approved_job',{job_id:jobs[0].id,candidate_sha:DRAFT})).body.dispatch,'scheduled_only');assert.equal((await call('wake_approved_job',{job_id:jobs[0].id,candidate_sha:OTHER})).status,409);assert.equal(jobs.length,1);assert.equal(jobs[0].action,'prod_apply');assert.equal(jobs[0].to_sha,DRAFT);assert.equal(state.production_sha,BASE);
 const plan=(await call('worker_next',{head_sha:OTHER,data_blob_sha:BLOB},'worker.stub.token')).body;
 assert.equal(plan.production_sha,DRAFT);assert.equal(plan.staging_sha,null);assert.equal(state.production_sha,BASE);
 assert.equal((await call('worker_complete',{job_id:jobs[0].id},'worker.stub.token')).status,200);assert.equal(state.production_sha,DRAFT);assert.equal(jobs[0].status,'deployed');assert.equal((await call('worker_complete',{job_id:jobs[0].id},'worker.stub.token')).status,200);
 jobs.splice(0);jobs.push({id:'00000000-0000-0000-0000-000000000002',action:'stage_apply',target:'staging',to_sha:OTHER,status:'queued'});
 const retired=(await call('worker_next',{head_sha:OTHER,data_blob_sha:BLOB},'worker.stub.token')).body;assert.equal(retired.has_job,false);assert.equal(jobs[0].status,'failed');
 const ui=fs.readFileSync('js/beagu-admin-updates-v1.js','utf8');new vm.Script(ui);assert.match(ui,/request\("prod_direct_apply"/);assert.match(ui,/readyKey===key/);assert.match(ui,/\|\|!ready\|\|/);assert.match(ui,/confirmed_direct:true/);
 console.log('PASS: owner MFA, legacy rejection, exact CI and SHA, draft conflict, registration without publication, confirmed queue, staging retirement, UI fail-closed contract');
})().catch(e=>{console.error(e);process.exitCode=1});
