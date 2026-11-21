import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync('js/beagu-account-privacy-v1.js','utf8');
const page=fs.readFileSync('js/beagu-account-privacy-page-v1.js','utf8');
const edge=fs.readFileSync('supabase/functions/beagu-member-privacy-api-v1/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20261121234500_beagu_member_privacy_requests_v1.sql','utf8');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
class Element{
 constructor(){
  this.hidden=false;this.disabled=false;this.textContent='';this.value='';
  this.listeners=new Map();this.dataset={};
 }
 addEventListener(n,f){this.listeners.set(n,f)}
 async click(){let f=this.listeners.get('click');assert.ok(f);await f();await flush();}
}
function fixture({fail=false}={}){
 const refs=new Map();
 const keys=['panel','summary','status','requestAccess','cancelAccess',
  'requestDeletion','cancelDeletion','confirmEmail','confirmPhrase'];
 for(const k of keys)refs.set(k,new Element());
 const requests=[],window={confirm:()=>true};
 const data={ok:true,profile:{
  email:'member@example.test',emailVerified:true,
  createdAt:'2026-01-01T00:00:00Z',lastSignInAt:'2026-11-21T00:00:00Z'
 },requests:{},sms:{consented:false,phoneVerified:false}};
 const client={functions:{async invoke(name,args){
  requests.push({name,body:args.body});
  if(fail)return {data:null,error:{message:'DO_NOT_LEAK_secret'}};
  const {action}=args.body;
  if(action==='status')return {data,error:null};
  if(action==='request_access'){
   data.requests.access={status:'pending'};
   return {data:{ok:true,status:'pending',deleted:false},error:null};
  }
  if(action==='cancel_access'){
   data.requests.access={status:'cancelled'};
   return {data:{ok:true,status:'cancelled',deleted:false},error:null};
  }
  if(action==='request_deletion'){
   data.requests.deletion={status:'pending'};
   return {data:{ok:true,status:'pending',deleted:false},error:null};
  }
  if(action==='cancel_deletion'){
   data.requests.deletion={status:'cancelled'};
   return {data:{ok:true,status:'cancelled',deleted:false},error:null};
  }
  throw Error('unexpected fake action');
 }}};
 vm.runInNewContext(src,{window},{timeout:1000});
 const ui=window.BeaguAccountPrivacy.create(Object.fromEntries([
  ['client',client],...keys.map(k=>[k,refs.get(k)])
 ]));
 return {ui,refs,requests,window,data,get:k=>refs.get(k)};
}
const person={token:'synthetic-only-token',user:{
 id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-11-21',
 is_anonymous:false
}};
test('initially hidden, clean, no request',()=>{
 const x=fixture();
 assert.equal(x.get('panel').hidden,true);
 assert.equal(x.get('summary').textContent,'');
 assert.equal(x.requests.length,0);
});
test('unverified, anonymous, or missing JWT identity cannot access member details',async()=>{
 const x=fixture();
 for(const p of [null,{user:person.user},
  {token:person.token,user:{...person.user,email_confirmed_at:null}},
  {token:person.token,user:{...person.user,is_anonymous:true}}]){
  await x.ui.showFor(p);
  assert.equal(x.get('panel').hidden,true);
  assert.equal(x.requests.length,0);
 }
});
test('verified session sees only its own account summary with no phone or secrets',async()=>{
 const x=fixture();
 await x.ui.showFor(person);
 assert.equal(x.get('panel').hidden,false);
 assert.equal(x.requests[0].name,'beagu-member-privacy-api-v1');
 assert.deepEqual(JSON.parse(JSON.stringify(x.requests[0].body)),{action:'status'});
 assert.match(x.get('summary').textContent,/member@example.test/);
 assert.doesNotMatch(x.get('summary').textContent,/synthetic-only-token|010\d{8}/);
 assert.match(x.get('status').textContent,/계정이 삭제되지/);
});
test('access request does not perform destructive delete',async()=>{
 const x=fixture();
 await x.ui.showFor(person);
 await x.get('requestAccess').click();
 assert.ok(x.requests.some(r=>r.body.action==='request_access'));
 assert.equal(x.get('cancelAccess').hidden,false);
 assert.equal(x.get('requestAccess').hidden,true);
 assert.ok(x.requests.every(r=>!['delete_user','delete','hard_delete'].includes(r.body.action)));
});
test('deletion request demands exact registered email, fixed Korean phrase and confirmation',async()=>{
 const x=fixture();await x.ui.showFor(person);
 x.get('confirmEmail').value='attacker@example.test';
 x.get('confirmPhrase').value='계정 탈퇴 요청';
 await x.get('requestDeletion').click();
 assert.equal(x.requests.filter(r=>r.body.action==='request_deletion').length,0);
 x.get('confirmEmail').value='member@example.test';
 x.get('confirmPhrase').value='잘못 입력';
 await x.get('requestDeletion').click();
 assert.equal(x.requests.filter(r=>r.body.action==='request_deletion').length,0);
 x.get('confirmPhrase').value='계정 탈퇴 요청';
 await x.get('requestDeletion').click();
 const payload=x.requests.find(r=>r.body.action==='request_deletion').body;
 assert.equal(payload.confirm,'계정 탈퇴 요청');
 assert.equal(payload.confirmEmail,'member@example.test');
 assert.equal(x.get('cancelDeletion').hidden,false);
 assert.equal(x.get('confirmEmail').value,'');
 assert.match(x.get('status').textContent,/아직 삭제되지/);
});
test('pending deletion request is cancellable without touching Auth user',async()=>{
 const x=fixture();await x.ui.showFor(person);
 x.get('confirmEmail').value='member@example.test';
 x.get('confirmPhrase').value='계정 탈퇴 요청';
 await x.get('requestDeletion').click();
 await x.get('cancelDeletion').click();
 assert.ok(x.requests.some(r=>r.body.action==='cancel_deletion'));
 assert.equal(x.get('cancelDeletion').hidden,true);
 assert.equal(x.get('requestDeletion').hidden,false);
});
test('API failure never claims success or leaks server error messages',async()=>{
 const x=fixture({fail:true});await x.ui.showFor(person);
 assert.match(x.get('status').textContent,/확인할 수 없습니다/);
 assert.equal(x.get('requestDeletion').hidden,true);
 assert.doesNotMatch(x.get('status').textContent,/DO_NOT_LEAK/);
});
test('logout immediately wipes displayed email, identity and typed deletion proof',async()=>{
 const x=fixture();await x.ui.showFor(person);
 x.get('confirmEmail').value='member@example.test';
 x.get('confirmPhrase').value='계정 탈퇴 요청';
 x.ui.hide();
 assert.equal(x.get('summary').textContent,'');
 assert.equal(x.get('status').textContent,'');
 assert.equal(x.get('confirmEmail').value,'');
 assert.equal(x.get('confirmPhrase').value,'');
 assert.equal(x.get('panel').hidden,true);
});
test('SQL safeguards private queue and never issues direct Auth deletion',()=>{
 for(const needle of ['beagu_private.member_privacy_requests_v1',
  'enable row level security','beagu_member_live_session_v1',
  'ADMIN_REVIEW_REQUIRED','member_privacy_active_one_v1',
  'request_id uuid primary key']){
  assert.ok(sql.includes(needle),needle);
 }
 assert.doesNotMatch(sql,/delete from auth\.users|drop table auth\.users|update auth\.users/i);
 assert.match(sql,/revoke all on function public\.beagu_member_privacy_request_v1/);
 assert.match(sql,/grant execute on function public\.beagu_member_privacy_cancel_v1/);
 assert.match(sql,/TOO_MANY_REQUESTS/);
});
test('Edge API validates a real user and an active JWT session before any private operation',()=>{
 assert.match(edge,/db\.auth\.getUser\(match\[1\]\)/);
 assert.match(edge,/jwtSession\(match\[1\]\)/);
 assert.match(edge,/beagu_member_live_session_v1/);
 assert.match(edge,/p_user:user\.id/);
 assert.match(edge,/user\.email_confirmed_at/);
 assert.match(edge,/request_deletion/);
 assert.match(edge,/CONFIRMATION_REQUIRED/);
 assert.match(edge,/deleted:false/);
 assert.doesNotMatch(edge,/auth\.admin\.deleteUser|deleteUser\(|delete from auth\.users/);
 assert.doesNotMatch(edge,/user_metadata|service_role\\s*=\\s*req\.|console\.log|console\.error/);
});
test('standalone privacy center is independent from Lv2 participation code',()=>{
 const html=fs.readFileSync('account-privacy.html','utf8');
 assert.match(html,/id="selfPrivacyPanel"/);
 assert.match(html,/id="selfLoginForm"/);
 assert.match(html,/id="selfSmsWithdraw"/);
 assert.match(html,/account-privacy-v1\.js/);
 assert.match(html,/beagu-account-privacy-page-v1\.js/);
 assert.match(page,/auth\.getUser\(\)/);
 assert.match(page,/signInWithPassword/);
 assert.match(page,/beagu-member-sms-api-v2/);
 assert.match(page,/BeaguAccountPrivacy\.create/);
 assert.doesNotMatch(page,/beagu-level-api|postit-api|levelToken|deviceSecret|localStorage|sessionStorage/);
});
test('both existing account pages carry self-service links and call privacy module',()=>{
 for(const [path,script,section] of [
  ['challenge.html','js/challenge-member-auth-v1.js','challengePrivacyPanel'],
  ['postit.html','js/postit-account-v1.js','postitPrivacyPanel']
 ]){
  const html=fs.readFileSync(path,'utf8'),js=fs.readFileSync(script,'utf8');
  assert.match(html,/href="account-privacy\.html"/);
  assert.match(html,/beagu-account-privacy-v1\.js/);
  assert.ok(html.includes('id="'+section+'"'));
  assert.match(js,/window\.BeaguAccountPrivacy\.create/);
  assert.match(js,/accountPrivacy\.hide\(\)/);
  assert.match(js,/accountPrivacy\.showFor\(identity|accountPrivacy\.showFor\(person/);
 }
});
