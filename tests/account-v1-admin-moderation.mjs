// Actual admin handler with a synthetic RPC transport. No production credentials or requests.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const admin='10000000-0000-4000-8000-000000000001',target='20000000-0000-4000-8000-000000000002',caseId='30000000-0000-4000-8000-000000000003';
let handler,role='owner',active=true,enabled=true,verified=true,decisionAllowed=true,calls=[];
globalThis.Deno={env:{get:()=> 'fixture'},serve:fn=>{handler=fn}};
globalThis.__fixtureAdmin=()=>({
 auth:{getUser:async()=>({data:{user:verified?{id:admin}:null},error:null})},
 from(table){assert.equal(table,'beagu_admin_accounts');const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{enabled,role},error:null})};return q;},
 rpc:async(name,p)=>{calls.push({name,p});
  if(name==='beagu_admin_active_mfa_session')return {data:active,error:null};
  if(name==='beagu_account_admin_counts_v1')return {data:{members:2,lv2:1,suspended:0,visitor_id:'private-marker'},error:null};
  if(name==='beagu_postit_report_queue_v1')return {data:[{target_type:'post',target_id:target,body:'synthetic text',status:'published',reports:2,case_id:null,decision:null,expires_at:null,author_uid:'private-marker',account_id:'private-marker',email:'private-marker'}],error:null};
  if(name==='beagu_postit_report_decide_v1')return {data:decisionAllowed?{ok:true,case_id:caseId,author_uid:'private-marker'}:null,error:null};
  throw Error('unexpected fixture RPC');
 }
});
const temp=await mkdtemp(join(tmpdir(),'beagu-admin-'));
try{
 const raw=await readFile('supabase/functions/beagu-admin-members-v1/index.ts','utf8');
 const src=raw.replace(/^import \{ createClient \} from "[^"]+";/m,()=> 'const createClient=globalThis.__fixtureAdmin;');assert.notEqual(raw,src);
 const file=join(temp,'admin.mts');await writeFile(file,src);
 await import(pathToFileURL(file).href);
 const token=aal=>'fixture.'+Buffer.from(JSON.stringify({sub:admin,aal,session_id:'fixture-session'})).toString('base64url')+'.signature';
 async function send(body,status,auth=token('aal2')){
  const r=await handler(new Request('https://invalid.example/admin',{method:'POST',headers:{Origin:'https://baeguindex.com','Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)}));
  assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');const out=await r.json();assert.doesNotMatch(JSON.stringify(out),/private-marker|author_uid|visitor_id|account_id|email/);return out;
 }
 await send({action:'report_queue'},401,'');await send({action:'report_queue'},403,token('aal1'));
 active=false;await send({action:'report_queue'},401);active=true;
 enabled=false;await send({action:'report_queue'},403);enabled=true;
 verified=false;await send({action:'report_queue'},401);verified=true;
 assert.equal(calls.filter(c=>c.name==='beagu_postit_report_queue_v1').length,0);
 const queue=await send({action:'report_queue'},200);assert.equal(queue.data.rows[0].reports,2);
 const summary=await send({action:'summary'},200);assert.deepEqual(summary.data,{members:2,lv2:1,suspended:0});
 const body={action:'report_decide',target_type:'post',target_id:target,decision:'restrict_24h',reason:'synthetic review reason',p_admin:'forged-admin',author_uid:'forged-author'};
 role='viewer';await send(body,403);role='owner';
 await send({...body,target_id:'bad-id'},400);await send({...body,decision:'permanent'},400);await send({...body,reason:'short'},400);
 assert.equal(calls.filter(c=>c.name==='beagu_postit_report_decide_v1').length,0);
 decisionAllowed=false;await send(body,409);decisionAllowed=true;
 const accepted=await send(body,200);assert.deepEqual(accepted.data,{ok:true,case_id:caseId});
 assert.deepEqual(calls.at(-1).p,{p_type:'post',p_target:target,p_decision:'restrict_24h',p_reason:'synthetic review reason',p_admin:admin});
 await send({...body,decision:'restore'},200);
 for(const action of ['list','detail','moderate'])await send({action},400);
 console.log('PASS admin handler: MFA, active session, owner only, no personal directory, report projection and forged actor denial');
}finally{await rm(temp,{recursive:true,force:true});delete globalThis.Deno;delete globalThis.__fixtureAdmin;}
