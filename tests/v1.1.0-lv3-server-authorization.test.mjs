import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261122002000_beagu_lv3_server_authorization_v1.sql');
const edge=read('supabase/functions/beagu-lv3-member-api-v1/index.ts');
const clientSource=read('js/beagu-lv3-session-v1.js');
const existing=read('supabase/functions/beagu-level-api/index.ts');

function harness({auth=true,lv2=true,verify=true,issue=true}={}){
 const activity=[];
 let authChange;
 let verified=verify;
 const user={
  auth:{
   async getSession(){
    activity.push({type:'getSession'});
    return {data:{session:auth?{access_token:'fake-verifiable-jwt'}:null},error:null};
   },
   onAuthStateChange(fn){authChange=fn;return {data:{subscription:{unsubscribe(){}}}}}
  }
 };
 const window={};
 vm.runInNewContext(clientSource,{window,sessionStorage:{getItem(){return null}},fetch(){
  throw Error('Injected request expected');
 }},{timeout:1000});
 const api=window.BeaguLv3Session.create({
  client:user,levelToken:()=>lv2?'a'.repeat(64):'',
  async request(url,options){
   const body=JSON.parse(options.body);
   activity.push({type:body.action,url,options,body});
   if(body.action==='issue')return {
    ok:issue,async json(){return issue?{
     ok:true,level:3,token:'c'.repeat(64),
     expiresAt:'2026-11-22T02:00:00Z'
    }:{ok:false,error:'LV3_NOT_RELEASED'}}
   };
   if(body.action==='verify')return {
    ok:verified,async json(){return verified?{ok:true,level:3,verified:true}:
      {ok:false,error:'LV3_NOT_VERIFIED'}}
   };
   if(body.action==='logout')return {ok:true,async json(){
    return {ok:true,revoked:true};
   }};
   throw Error('Unexpected action');
  }
 });
 return {api,activity,authChange:()=>authChange,setVerified:x=>verified=x};
}
test('Lv3 issuing requires Auth and separate server Lv2; code alone cannot elevate',async()=>{
 const missingAuth=harness({auth:false});
 assert.equal(await missingAuth.api.issue(),false);
 assert.equal(missingAuth.activity.filter(x=>x.type==='issue').length,0);
 const missingLv2=harness({lv2:false});
 assert.equal(await missingLv2.api.issue(),false);
 assert.equal(missingLv2.activity.filter(x=>x.type==='issue').length,0);
});
test('successful issue demands a second server verification, not merely a token',async()=>{
 const x=harness();
 assert.equal(await x.api.issue(),true);
 assert.equal(x.api.getState().level,3);
 assert.deepEqual(x.activity.filter(q=>q.type!=='getSession').map(q=>q.body.action),[
  'issue','verify']);
 for(const call of x.activity.filter(q=>q.type!=='getSession')){
  assert.match(call.options.headers.Authorization,/^Bearer /);
  assert.equal(call.options.headers['X-Beagu-Level-Session'],'a'.repeat(64));
  assert.equal(call.options.cache,'no-store');
  assert.equal(call.options.referrerPolicy,'no-referrer');
 }
 assert.equal(x.activity.some(q=>q.body.code==='c'.repeat(64)),false);
});
test('issue fails closed when server release switch is disabled',async()=>{
 const x=harness({issue:false});
 assert.equal(await x.api.issue(),false);
 assert.equal(x.api.getState().verified,false);
 assert.equal(x.activity.filter(q=>q.type==='verify').length,0);
});
test('issued token without successful verify never becomes level 3',async()=>{
 const x=harness({verify:false});
 assert.equal(await x.api.issue(),false);
 assert.equal(x.api.getState().level,null);
 assert.equal(await x.api.verify(),false);
});
test('server revocation, expiration and Auth logout immediately remove local Lv3 UI state',async()=>{
 const x=harness();
 assert.equal(await x.api.issue(),true);
 x.setVerified(false);
 assert.equal(await x.api.verify(),false);
 assert.equal(x.api.getState().verified,false);
 assert.equal(await x.api.issue(),false);
 x.setVerified(true);
 assert.equal(await x.api.issue(),true);
 x.authChange()('SIGNED_OUT');
 assert.equal(x.api.getState().verified,false);
 assert.equal(x.api.getState().level,null);
});
test('logout clears bearer in memory before the network request',async()=>{
 const x=harness();
 assert.equal(await x.api.issue(),true);
 await x.api.logout();
 assert.equal(x.api.getState().verified,false);
 assert.equal(x.api.getState().level,null);
 assert.equal(x.activity.filter(q=>q.type==='logout').length,1);
});
test('SQL migration is disabled by default and cannot be enabled via service-role API',()=>{
 assert.match(migration,/enabled boolean not null default false/);
 assert.match(migration,/values\(true,false\) on conflict\(singleton\) do nothing/);
 assert.match(migration,/not enabled or \(approved_at is not null/);
 assert.match(migration,/grant select on beagu_private\.lv3_release_control_v1 to service_role/);
 assert.doesNotMatch(migration,/grant update on beagu_private\.lv3_release_control_v1 to service_role/i);
 assert.match(migration,/enable row level security/g);
 assert.match(migration,/revoke all on function public\.beagu_lv3_verify_session_v1[\s\S]*?from public,anon,authenticated/);
 assert.match(migration,/grant execute on function public\.beagu_lv3_issue_session_v1[\s\S]*?to service_role/);
});
test('Lv3 token is short-lived, server-hashed and account/Auth-session bound',()=>{
 for(const value of ['token_sha256 text primary key',
   'auth_user_id uuid not null references auth.users',
   'auth_session_id uuid not null',
   "interval '30 minutes'",
   'revoked_at timestamptz',
   'beagu_member_live_session_v1(p_user,p_auth_session)',
   'beagu_lv3_link_status_v1(',
   's.expires_at>now()',
   "s.auth_session_id=p_auth_session",
   "s.auth_user_id=p_user",
   "s.visitor_id=p_visitor"])
   assert.ok(migration.includes(value),value);
 assert.match(migration,/where s\.issued_at>v_now-interval '1 hour'/);
 assert.match(migration,/revoked_at=v_now/);
 assert.doesNotMatch(migration,/\bupdate\s+public\.beagu_level_codes\b/i);
 assert.doesNotMatch(migration,/\bdelete\s+from\s+auth\.users\b/i);
});
test('Edge verifies real Supabase JWT, current Auth session and independent issued Lv2 claim',()=>{
 for(const value of [
  'db.auth.getUser(match[1])',
  'beagu_member_live_session_v1',
  'beagu_level_sessions',
  'beagu_2026_verified_visitor_level_v1',
  "data.identity_campaign!==\"2026\"",
  'beagu_lv3_issue_session_v1',
  'beagu_lv3_verify_session_v1',
  'beagu_lv3_revoke_session_v1',
  'crypto.getRandomValues(new Uint8Array(32))',
  'Referrer-Policy','Cache-Control'
 ]) assert.ok(edge.includes(value),value);
 assert.doesNotMatch(edge,/localStorage|sessionStorage|user_metadata|console\.log|console\.error|auth\.admin\.updateUserById/);
 assert.doesNotMatch(edge,/Access-Control-Allow-Origin":\s*"\*"/);
});
test('existing Lv0/Lv1/Lv2 API still has no code-only level 3',()=>{
 assert.match(existing,/!\[1,2\]\.includes\(level\)/);
 assert.doesNotMatch(existing,/access_level\s*:\s*3\b/);
 const badge=read('js/beagu-level-state-v1.js');
 assert.match(badge,/const tier=\/\^\[012\]\$\//);
 assert.ok(!badge.includes('BeaguLv3Session'), 'Stage20 handles status integration');
 assert.ok(!read('challenge.html').includes('js/beagu-lv3-session-v1.js'));
});
