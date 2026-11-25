import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'edge-offline-'));
const read=name=>readFileSync('supabase/functions/'+name+'/index.ts','utf8');
let handle,client,fetchCalls=0;
globalThis.Deno={env:{get:k=>k==='SUPABASE_URL'?'https://fixture.invalid':k==='SUPABASE_SERVICE_ROLE_KEY'?'synthetic-test-only':undefined},serve:f=>{handle=f}};
globalThis.__fixtureClient=()=>client;
globalThis.fetch=async()=>{fetchCalls++;throw Error('network forbidden')};
async function load(name){const source=read(name).replace(/^import\s*\{\s*createClient\s*\}\s*from\s*["']https:\/\/esm\.sh\/[^"']+["'];/m,'const createClient=globalThis.__fixtureClient;');const file=join(dir,name+'.mts');writeFileSync(file,source);await import(pathToFileURL(file).href);return handle;}
const request=(body,token,origin='https://baeguindex.com')=>new Request('https://fixture.invalid',{method:'POST',headers:{origin,'content-type':'application/json',...(token?{'X-Beagu-Session':token}:{})},body:JSON.stringify(body)});
try{
let calls=[],session={access_level:1,expires_at:new Date(Date.now()+60000).toISOString()};
client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:session,error:null})})})}),rpc:async(name,args)=>{calls.push({name,args});return {data:{rising:[{school_id:'1234567',school_name:'fixture',region:'부산',visitors:9,growth:4,private:'not exposed'}]},error:null}}};
let h=await load('beagu-school-interest-v1'),r=await h(request({}));assert.equal(r.status,200);assert.deepEqual((await r.json()).rising,[{school_id:'1234567',school_name:'fixture',region:'부산'}]);assert.equal(calls[0].name,'beagu_school_interest_rankings_v2');
r=await h(request({},'a'.repeat(64)));assert.deepEqual((await r.json()).rising,[{school_id:'1234567',school_name:'fixture',region:'부산',visitors:9,growth:4}]);
assert.equal((await h(request({},'invalid'))).status,401);session.expires_at='2000-01-01';assert.equal((await h(request({},'a'.repeat(64)))).status,403);
calls=[];let published=false;client={from:()=>{throw Error('private snapshot read forbidden')},rpc:async(name,args)=>{calls.push({name,args});if(name==='beagu_2026_level_released_school_ids')return {data:published?['1234567']:[],error:null};if(name==='beagu_2026_simple_report')return {data:'fixture-request',error:null};throw Error('unexpected RPC')}};
h=await load('beagu-2026-civic');r=await h(request({action:'status',school_id:'1234567'}));assert.equal(r.status,200);assert.deepEqual(await r.json(),{participation_confirmed:false});assert.equal(calls[0].args.p_level,0);published=true;r=await h(request({action:'status',school_id:'1234567'}));assert.deepEqual(await r.json(),{participation_confirmed:true});r=await h(request({action:'simple_report',school_id:'1234567',detail:'synthetic report for testing only'}));assert.equal(r.status,202);assert.equal(calls.at(-1).name,'beagu_2026_simple_report');assert.equal((await h(request({action:'simple_report',school_id:'1234567',detail:'bad'}))).status,400);
const g=read('arcade-leaderboard');assert.match(g,/async function recommendSchool/);assert.match(g,/if\(params.has\("recommend"\)\)/);assert(!g.includes('MATCH_BONUS_ENABLED'));assert(!g.includes('ARCHIVE_ENABLED'));assert(!g.includes('matchRule:"deuce_v1"'));assert.match(g,/const matchEnded=\(player===25\|\|cpu===25\)/);
assert.equal(fetchCalls,0);
console.log('PASS isolated actual Edge handlers: public rising names only, authenticated metrics, expired session, withheld participation, simple report; legacy arcade scoring retained');
}finally{rmSync(dir,{recursive:true,force:true})}
