// Actual protected Edge handlers in isolated Node; mocked database transport only.
// DB semantics (including legacy cutoff, first promotion, revocation) are tested
// independently against PostgreSQL. This suite detects missing gates in API routes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
const token='a'.repeat(64),visitor='10000000-0000-4000-8000-000000000001';
const temp=await mkdtemp(join(tmpdir(),'beagu-protected-'));
const origin='https://baeguindex.com';
let handler,allow=false,tier=2,account=false,calls=[];
const session=()=>({access_level:tier,expires_at:new Date(Date.now()+3600000).toISOString(),identity_campaign:'2026',identity_visitor_id:visitor});
const rpc=async(name,p)=>{
 calls.push(name);
 if(name==='beagu_account_level_session_allowed_v1'){assert.equal(p.p_token_sha,digest(token));return {data:allow,error:null};}
 if(name==='beagu_account_session_status_v1'){assert.equal(p.p_token_sha,digest(token));return {data:account?{level:2,lv2_active:true,account_id:'SYNTHETIC-ONE'}:null,error:null};}
 if(name==='beagu_has_earned_challenge_visitor')return {data:true,error:null};
 if(name==='beagu_school_interest_rankings')return {data:{rising:[]},error:null};
 throw Error('unexpected RPC '+name);
};
const client={rpc,from(table){assert.equal(table,'beagu_level_sessions');const q={select(){return q},eq(){return q},gt(){return q},maybeSingle:async()=>({data:session(),error:null})};return q;}};
const oldFetch=globalThis.fetch;
globalThis.__gateClient=()=>client;
globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-key',BEAGU_REFERRAL_LINK_ENABLED:'true',BEAGU_REFERRAL_HMAC_KEY:'fixture-only-secret-32-characters-long'})[k]||''},serve:fn=>{handler=fn;}};
globalThis.fetch=async (url,opts)=>{
 const u=new URL(url);assert.equal(u.origin,'https://fixture.invalid');
 if(u.pathname.endsWith('/beagu_level_sessions'))return Response.json([session()]);
 if(u.pathname.endsWith('/rpc/beagu_2026_level_school_published'))return Response.json(false);
 if(u.pathname.endsWith('/schools')||u.pathname.endsWith('/beagu_school_report_yearly')||u.pathname.endsWith('/beagu_verified_school_question_distributions_v1'))return Response.json([]);
 if(u.pathname.endsWith('/rpc/beagu_account_level_session_allowed_v1')){const r=await rpc('beagu_account_level_session_allowed_v1',JSON.parse(opts.body));return Response.json(r.data);}
 throw Error('unexpected fetch '+u.pathname);
};
const specs=[
 ['beagu-level-api',{action:'verify'},401,200],
 ['beagu-school-interest-v1',{},403,200],
 ['beagu-school-culture-v1',{},401,400],
 ['beagu-challenge-identity',{},401,400],
 ['beagu-referral-link-v1',{},401,400],
 ['class-diary-world-v1',{schoolId:'TEST001'},401,404],
 ['class-diary-story-signals-v1',{schoolId:'TEST001'},401,404],
 ['class-diary-guest-access-v1',{action:'verify-lv2',schoolId:'TEST001'},403,403]
];
async function load(name){
 const raw=await readFile('supabase/functions/'+name+'/index.ts','utf8');
 let src=raw.replace(/^import\s*\{\s*createClient\s*\}\s*from\s*['"][^'"]+['"];?/m,'const createClient=globalThis.__gateClient;');
 // These imported data projection functions are unreachable in our denial/verify requests.
 src=src.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/_shared\/[^'"]+['"];?/gm,(_,names)=>names.split(',').map(n=>'const '+n.trim()+'=()=>{throw Error("projection not expected")};').join('\n'));
 const file=join(temp,name+'.mts');await writeFile(file,src);
 handler=null;await import(pathToFileURL(file).href);assert.equal(typeof handler,'function');
}
async function invoke(body){
 const req=new Request('https://fixture.invalid/edge',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Beagu-Session':token,'X-Beagu-Level-Session':token},body:JSON.stringify(body)});
 const r=await handler(req);return {status:r.status,data:await r.json()};
}
try{
 for(const [name,body,denied,accepted] of specs){
  await load(name);allow=false;tier=2;account=false;calls=[];
  const result=await invoke(body);
  if(denied!==null)assert.equal(result.status,denied,name+' stale or forged Lv2 session');
  assert.ok(calls.includes('beagu_account_level_session_allowed_v1'),name+' must consult database gate');
  allow=true;calls=[];
  const valid=await invoke(body);
  if(accepted!==null)assert.equal(valid.status,accepted,name+' verified transition');
  if(name==='class-diary-guest-access-v1'){assert.equal(result.data.error,'LV2_REQUIRED');assert.equal(valid.data.error,'SCHOOL_NOT_ELIGIBLE');}
  assert.ok(calls.includes('beagu_account_level_session_allowed_v1'),name+' valid session check');
  if(name.startsWith('class-diary-')){
   tier=1;calls=[];const lower=await invoke(body);
   assert.ok(lower.status>=400,name+' account-only or referral-only access denied');
  }
  console.log('PASS protected Edge gate '+name);
 }
 // The civic correction gate is exercised directly from its actual function so
 // payload/rate-limit checks do not obscure the distinction between read/write.
 const raw=await readFile('supabase/functions/beagu-2026-civic/index.ts','utf8');
 const start=raw.indexOf('async function corrector('),end=raw.indexOf('async function adminSession',start);
 assert.ok(start>=0&&end>start);
 const code='const db=globalThis.__gateClient();const uuid=/^[0-9a-f-]{36}$/i;const hash=async(s:string)=>'+
 'Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,"0")).join("");\n'+raw.slice(start,end)+'\nexport {corrector};';
 const file=join(temp,'civic-gate.mts');await writeFile(file,code);const {corrector}=await import(pathToFileURL(file).href);
 const req=new Request('https://fixture.invalid/edge',{headers:{'X-Beagu-Session':token}});
 tier=2;account=false;assert.equal(await corrector(req),null,'legacy read-only cannot correct');
 account=true;assert.equal(await corrector(req),visitor,'authenticated earned member may correct');
 tier=1;assert.equal(await corrector(req),null,'account-only cannot correct');
 console.log('PASS civic correction gate; Post-it full handler covered by account-v1-postit-privacy.mjs');
}finally{globalThis.fetch=oldFetch;delete globalThis.Deno;delete globalThis.__gateClient;await rm(temp,{recursive:true,force:true});}
