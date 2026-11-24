// Actual Post-it Edge handler, synthetic tables/RPCs, no network access.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex');
const tokens={lv1:'a'.repeat(64),legacy:'b'.repeat(64),member:'c'.repeat(64),revoked:'d'.repeat(64)};
const visitor='10000000-0000-4000-8000-000000000001',actor='20000000-0000-4000-8000-000000000002',other='30000000-0000-4000-8000-000000000003',id='40000000-0000-4000-8000-000000000004',oldId='50000000-0000-4000-8000-000000000005';
const nick='Il|ǀ❘ı∣│Il',current=new Date().toISOString(),old=new Date(Date.now()-14*86400000).toISOString(),privateMarker='synthetic-private-rpc-error';
const posts=[{id,body:'fixture current',created_at:current,author_uid:actor,subject_type:'game',game_slug:'teacher-volleyball',account_id:'private-account'},{id:oldId,body:'fixture old',created_at:old,author_uid:other,subject_type:'game',game_slug:'teacher-volleyball'}];
let handler,forceError=false,unexpectedError=false,mutations=[],log=[];
const client={from(table){
 const filters={};let update=false;
 const run=()=>{
  if(table==='beagu_level_sessions'){const entry=Object.entries(tokens).find(([,t])=>hash(t)===filters.token_sha256);return {data:entry?{access_level:entry[0]==='lv1'?1:2,identity_campaign:'2026',identity_visitor_id:visitor}:null,error:null};}
  if(table==='beagu_postit_settings')return {data:{minimum_write_level:2,max_daily_posts:3,max_daily_comments:5},error:null};
  if(table==='beagu_postit_reactions'||table==='beagu_postit_comments')return {data:[],error:null};
  if(table==='beagu_postit_posts'){if(forceError)return {data:null,error:new Error(privateMarker)};if(update){mutations.push({table,filters});return {data:null,error:null};}return {data:filters.id?{...posts.find(p=>p.id===filters.id),status:'published'}:posts,error:null};}
  throw Error('Unexpected fixture table '+table);
 };
 const q={select(){return q},eq(k,v){filters[k]=v;return q},gt(){return q},in(){return q},order(){return q},limit(){return q},update(){update=true;return q},maybeSingle:async()=>run(),single:async()=>run(),then(resolve,reject){return Promise.resolve().then(run).then(resolve,reject)}};
 return q;
},rpc:async(name,p)=>{
 if(name==='beagu_account_level_session_allowed_v1')return {data:p.p_token_sha!==hash(tokens.revoked),error:null};
 if(name==='beagu_has_earned_challenge_visitor')return {data:true,error:null};
 if(name==='beagu_account_postit_writer_v1')return {data:p.p_token_sha===hash(tokens.member)?actor:null,error:null};
 if(name==='beagu_account_postit_current_aliases_v1')return {data:[{item_id:id,nickname:nick,author_uid:actor,visitor_id:visitor,account_id:'private-account'}],error:null};
 if(name==='beagu_postit_create_post_v2'){mutations.push({name,p});return {data:unexpectedError?{error:privateMarker}:{id,replayed:false},error:null};}
 throw Error('Unexpected fixture RPC '+name);
}};
const temp=await mkdtemp(join(tmpdir(),'beagu-postit-'));
const originalError=console.error;
globalThis.Deno={env:{get:()=> 'fixture'},serve:fn=>{handler=fn}};
globalThis.__fixturePostit=()=>client;
console.error=(...args)=>log.push(args.join(' '));
try{
 const raw=await readFile('supabase/functions/beagu-postit-api-v1/index.ts','utf8');
 const src=raw.replace(/^import \{ createClient \} from "[^"]+";/,()=> 'const createClient=globalThis.__fixturePostit;');
 assert.notEqual(src,raw);const file=join(temp,'postit.mts');await writeFile(file,src);await import(pathToFileURL(file).href);
 const send=async(action,token,status,body)=>{const r=await handler(new Request('https://invalid.example/postit?action='+action,{method:body?'POST':'GET',headers:{Origin:'https://baeguindex.com','Content-Type':'application/json','X-Beagu-Level-Session':token||'',Authorization:'Bearer forged-token'},...(body?{body:JSON.stringify(body)}:{})}));assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');const out=await r.json(),serialized=JSON.stringify(out);for(const v of [visitor,actor,other,'private-account',privateMarker])assert.ok(!serialized.includes(v));assert.doesNotMatch(serialized,/author_uid|visitor_id|account_id|recovery_hash/);return out;};
 await send('posts','',403);await send('posts',tokens.lv1,403);
 assert.deepEqual(await send('writer_status',tokens.legacy,200),{linked:false});
 await send('writer_status',tokens.revoked,403);await send('posts',tokens.revoked,403);
 assert.deepEqual(await send('writer_status',tokens.member,200),{linked:true});
 const list=await send('posts',tokens.legacy,200);assert.equal(list.posts[0].nickname,nick);assert.equal(list.posts[1].nickname,'익명');assert.equal(list.posts[0].mine,false);
 const own=await send('posts',tokens.member,200);assert.equal(own.posts[0].mine,true);assert.equal(own.posts[1].mine,false);
 const create={action:'create_post',subject_type:'game',game_slug:'teacher-volleyball',text:'fixture',author_uid:other,visitor_id:visitor,level:3};
 await send('create_post',tokens.legacy,403,create);await send('create_post',tokens.revoked,403,create);assert.equal(mutations.length,0);
 await send('create_post',tokens.member,201,create);assert.equal(mutations.at(-1).p.p_actor,actor);
 await send('remove',tokens.member,403,{action:'remove',target_type:'post',target_id:oldId,author_uid:other});assert.equal(mutations.length,1);
 unexpectedError=true;await send('create_post',tokens.member,500,create);
 forceError=true;await send('posts',tokens.member,500);assert.ok(log.length>0);assert.ok(log.every(v=>!v.includes(privateMarker)));
 console.log('PASS actual Post-it handler: no fixed member ID or old alias, Lv2 read-only code cannot write, forged actor rejected, other-owner delete denied, redacted errors');
}finally{console.error=originalError;await rm(temp,{recursive:true,force:true});delete globalThis.Deno;delete globalThis.__fixturePostit;}
