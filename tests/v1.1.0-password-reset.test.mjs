import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync('js/beagu-password-reset-v1.js','utf8');
const APP='https://baeguindex.com';
const fields=[
  'beaguRecoveryRequestForm','beaguRecoveryResetForm','beaguRecoveryEmail',
  'beaguRecoveryPassword','beaguRecoveryConfirm','beaguRecoveryStatus',
  'beaguRecoveryExpiry','beaguRecoveryRestart','beaguRecoveryRequestButton',
  'beaguRecoveryUpdateButton'
];
const wait=async()=>{for(let i=0;i<4;i++) await new Promise(r=>setImmediate(r));};
function element(id){
 const handlers=new Map();
 return {
  id,hidden:id==='beaguRecoveryResetForm'||id==='beaguRecoveryExpiry'||id==='beaguRecoveryStatus',
  disabled:false,value:'',textContent:'',dataset:{},
  addEventListener(type,fn){handlers.set(type,fn);},
  listener(type){return handlers.get(type);},
  focus(){},
 };
}
function mock(href,{session=null,user=null,resetError=null,updateError=null}={}){
 const url=new URL(href);
 const nodes=new Map(fields.map(id=>[id,element(id)]));
 const calls={send:[],exchanges:[],getSession:0,getUser:0,updates:[],signOut:0,history:[]};
 let onAuthChange;
 const auth={
  onAuthStateChange(fn){onAuthChange=fn;return {data:{subscription:{unsubscribe(){}}}};},
  async getSession(){calls.getSession++;return {data:{session},error:null};},
  async exchangeCodeForSession(code){calls.exchanges.push(code);return {data:{session:{access_token:'valid-auth-from-code'}},error:null};},
  async getUser(){calls.getUser++;return {data:{user:user||{id:'u',email_confirmed_at:'2026-11-20T00:00:00Z',is_anonymous:false}},error:null};},
  async resetPasswordForEmail(email,options){calls.send.push({email,options});return {error:resetError};},
  async updateUser(args){calls.updates.push(args);return {error:updateError};},
  async signOut(){calls.signOut++;return {error:null};}
 };
 const w={
  location:{origin:url.origin,pathname:url.pathname,href:url.href,search:url.search,hash:url.hash},
  history:{state:null,replaceState(_s,_t,target){calls.history.push(target);}},
  BEAGU_AUTH_RETURN:{resolve(name){
    if(name!=='passwordReset')throw Error('bad-route');
    return APP+(url.pathname.startsWith('/_preview/')?'/_preview/':'/')+'password-reset.html';
  }}
 };
 const ctx={
  document:{getElementById(id){return nodes.get(id)||null;}},
  window:w,supabaseClient:{auth},queueMicrotask,URL,URLSearchParams
 };
 vm.runInNewContext(code,ctx,{timeout:3000});
 return {
  calls,nodes,auth,
  field:id=>nodes.get(id),
  emitRecovery(){onAuthChange?.('PASSWORD_RECOVERY');},
  async submit(id){const fn=nodes.get(id).listener('submit');assert.ok(fn);await fn({preventDefault(){}});await wait();},
  async restart(){nodes.get('beaguRecoveryRestart').listener('click')();await wait();}
 };
}
const status=h=>h.field('beaguRecoveryStatus');
const reset=h=>h.field('beaguRecoveryResetForm');
const request=h=>h.field('beaguRecoveryRequestForm');

test('normal page sends generic reset request to an exact production URL',async()=>{
 const h=mock(APP+'/password-reset.html');
 assert.equal(request(h).hidden,false);
 assert.equal(reset(h).hidden,true);
 h.field('beaguRecoveryEmail').value=' User@Example.test ';
 await h.submit('beaguRecoveryRequestForm');
 assert.equal(h.calls.send.length,1);
 assert.equal(h.calls.send[0].email,'User@Example.test');
 assert.equal(h.calls.send[0].options.redirectTo,APP+'/password-reset.html');
 assert.equal(status(h).dataset.state,'success');
 assert.doesNotMatch(status(h).textContent,/가입된|미가입/);
 assert.deepEqual(h.calls.updates,[]);
});

test('staging recovery emails return only to preview and invalid email is blocked',async()=>{
 const h=mock(APP+'/_preview/password-reset.html');
 h.field('beaguRecoveryEmail').value='not-an-address';
 await h.submit('beaguRecoveryRequestForm');
 assert.equal(h.calls.send.length,0);
 assert.equal(status(h).dataset.state,'error');
 h.field('beaguRecoveryEmail').value='teacher@example.test';
 await h.submit('beaguRecoveryRequestForm');
 assert.equal(h.calls.send[0].options.redirectTo,APP+'/_preview/password-reset.html');
});

test('missing account and email provider errors give no account enumeration',async()=>{
 const h=mock(APP+'/password-reset.html',{resetError:{message:'User not found'}});
 h.field('beaguRecoveryEmail').value='missing@example.test';
 await h.submit('beaguRecoveryRequestForm');
 assert.equal(h.calls.send.length,1);
 assert.equal(status(h).dataset.state,'success');
 assert.doesNotMatch(status(h).textContent,/User not found|missing@example/);
});

test('expired or refused recovery callback hides update form and scrubs link',async()=>{
 const h=mock(APP+'/password-reset.html?error=access_denied&error_code=otp_expired&error_description=secret');
 assert.equal(status(h).dataset.state,'error');
 assert.equal(reset(h).hidden,true);
 assert.equal(h.field('beaguRecoveryExpiry').hidden,false);
 assert.deepEqual(h.calls.history,['/password-reset.html']);
 assert.equal(h.calls.getSession,0);
 assert.equal(h.calls.updates.length,0);
 await h.restart();
 assert.equal(request(h).hidden,false);
});

test('token_hash-only template is rejected without an Auth session',async()=>{
 const h=mock(APP+'/password-reset.html?token_hash=danger&type=recovery');
 assert.equal(status(h).dataset.state,'error');
 assert.equal(h.calls.getUser,0);
 assert.deepEqual(h.calls.history,['/password-reset.html']);
});

test('PKCE recovery exchanges code, verifies user, updates password and signs out',async()=>{
 const h=mock(APP+'/_preview/password-reset.html?code=fake-pkce-code&type=recovery');
 await wait();
 assert.equal(h.calls.exchanges[0],'fake-pkce-code');
 assert.equal(h.calls.getUser,1);
 assert.equal(reset(h).hidden,false);
 assert.equal(h.calls.updates.length,0);
 assert.deepEqual(h.calls.history,['/_preview/password-reset.html']);
 h.field('beaguRecoveryPassword').value='fresh-strong-password';
 h.field('beaguRecoveryConfirm').value='fresh-strong-password';
 await h.submit('beaguRecoveryResetForm');
 assert.equal(h.calls.updates.length,1);
 assert.equal(h.calls.updates[0].password,'fresh-strong-password');
 assert.equal(h.calls.signOut,1);
 assert.equal(reset(h).hidden,true);
 assert.equal(h.field('beaguRecoveryPassword').value,'');
 assert.equal(status(h).dataset.state,'success');
});

test('implicitly authorized recovery fragment is scrubbed and validated server-side',async()=>{
 const h=mock(APP+'/password-reset.html#access_token=secret&refresh_token=secret2&type=recovery',
  {session:{access_token:'valid'}});
 await wait();
 assert.equal(h.calls.exchanges.length,0);
 assert.equal(h.calls.getUser,1);
 assert.equal(reset(h).hidden,false);
 assert.deepEqual(h.calls.history,['/password-reset.html']);
});

test('ordinary logged-in visit cannot reset password without recovery',async()=>{
 const h=mock(APP+'/password-reset.html',{session:{access_token:'already-signed-in'}});
 assert.equal(reset(h).hidden,true);
 assert.equal(request(h).hidden,false);
 assert.equal(h.calls.getSession,0);
 h.field('beaguRecoveryPassword').value='new-password';
 await h.submit('beaguRecoveryResetForm');
 assert.equal(h.calls.updates.length,0);
});

test('unverified email and anonymous user are not allowed to change password',async()=>{
 for(const user of [
  {id:'test',email_confirmed_at:null,is_anonymous:false},
  {id:'test',email_confirmed_at:'2026-11-21',is_anonymous:true}
 ]){
  const h=mock(APP+'/password-reset.html?code=dummy',{user,session:{access_token:'valid'}});
  await wait();
  assert.equal(reset(h).hidden,true);
  assert.equal(status(h).dataset.state,'error');
  assert.equal(h.calls.updates.length,0);
 }
});

test('short password and unequal confirmation rejected before Supabase updateUser',async()=>{
 const h=mock(APP+'/password-reset.html?code=dummy',{session:{access_token:'valid'}});
 await wait();
 h.field('beaguRecoveryPassword').value='short';
 h.field('beaguRecoveryConfirm').value='short';
 await h.submit('beaguRecoveryResetForm');
 assert.equal(h.calls.updates.length,0);
 h.field('beaguRecoveryPassword').value='long-enough-123';
 h.field('beaguRecoveryConfirm').value='something-else';
 await h.submit('beaguRecoveryResetForm');
 assert.equal(h.calls.updates.length,0);
});

test('auth server rejection never claims a successful password update',async()=>{
 const h=mock(APP+'/password-reset.html?code=dummy',{session:{access_token:'valid'},updateError:{message:'WeakPasswordError'}});
 await wait();
 h.field('beaguRecoveryPassword').value='long-enough-123';
 h.field('beaguRecoveryConfirm').value='long-enough-123';
 await h.submit('beaguRecoveryResetForm');
 assert.equal(status(h).dataset.state,'error');
 assert.equal(h.calls.signOut,0);
 assert.equal(h.field('beaguRecoveryPassword').value,'');
});

test('a PASSWORD_RECOVERY event can enable secure update after client initialization',async()=>{
 const h=mock(APP+'/password-reset.html',{session:{access_token:'valid'}});
 h.emitRecovery();
 await wait();
 assert.equal(h.calls.getUser,1);
 assert.equal(reset(h).hidden,false);
});

test('unknown origin cannot issue reset, read session or update credentials',async()=>{
 const h=mock('https://attacker.example/password-reset.html?code=xyz');
 assert.equal(h.field('beaguRecoveryExpiry').hidden,false);
 assert.equal(h.calls.getSession,0);
 assert.equal(h.calls.updates.length,0);
});

test('callback flows never use DOM HTML injection or change membership permissions',()=>{
 assert.doesNotMatch(code,/\.innerHTML\s*=/);
 assert.doesNotMatch(code,/localStorage/);
 assert.doesNotMatch(code,/level\s*[:=]\s*3|beagu-postit-api|service_role/i);
 for(const filename of ['challenge.html','postit.html','admin-enroll.html','admin.html']){
  assert.match(fs.readFileSync(filename,'utf8'),/href="password-reset\.html"/);
 }
 const page=fs.readFileSync('password-reset.html','utf8');
 assert.match(page,/name="referrer" content="no-referrer"/);
 assert.match(page,/id="beaguRecoveryResetForm"[^>]*hidden/);
 assert.match(page,/minlength="10"/);
 assert.ok(page.indexOf('js/supabase-config.js')<page.indexOf('js/beagu-password-reset-v1.js'));
});
