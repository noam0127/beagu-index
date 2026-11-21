import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(path,'utf8');
const ERRORS=read('js/beagu-auth-errors-v1.js');
const pages=[
 ['challenge.html','js/challenge-member-auth-v1.js'],
 ['postit.html','js/postit-account-v1.js']
];
function errors(){
 const window={};
 vm.runInNewContext(ERRORS,{window},{timeout:1000});
 return window.BeaguAuthErrorUI;
}
function el(id){
 const handlers=new Map();
 return {id, value:'', checked:false, hidden:false, disabled:false,
  minLength:0, autocomplete:'', placeholder:'', textContent:'',style:{},
  dataset:{}, classList:{add(){},remove(){}},isConnected:true,
  addEventListener(k,fn){handlers.set(k,fn);},
  handler:k=>handlers.get(k),focus(){},
  setAttribute(k,v){this[k]=v;},
  getClientRects(){return [1]},querySelectorAll(){return []}
 };
}
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function browser(path,{error={code:'invalid_credentials',message:'secret=DO_NOT_LOG'},
  level=true, mode='signin', defer=false}={}){
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id)){
   const item=el(id);
   if(id==='challengeMemberOverlay')item.hidden=true;
   if(id==='beaguLevelState')item.dataset.level=level?'2':'0';
   elements.set(id,item);
  }
  return elements.get(id);
 };
 const listeners=new Map();
 const calls={signIn:0,signUp:0,level:0};
 let pendingResolve;
 const auth={
  async getSession(){return {data:{session:null},error:null}},
  async getUser(){return {data:{user:null},error:null}},
  onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
  async signInWithPassword(){
   calls.signIn++;
   if(defer)return new Promise(r=>{pendingResolve=r});
   return {error};
  },
  async signUp(){
   calls.signUp++;
   if(defer)return new Promise(r=>{pendingResolve=r});
   return {error};
  },
  async signOut(){return {error:null}}
 };
 const window={
  BEAGU_AUTH_RETURN:{resolve:page=>'https://baeguindex.com/'+page+'.html'},
  addEventListener(k,fn){listeners.set(k,fn)},
  dispatchEvent(){},
 };
 const context={
  window,document:{getElementById:get,
   body:{classList:{add(){},remove(){}}},
   activeElement:el('active'),addEventListener(k,fn){listeners.set('document:'+k,fn)}},
  supabaseClient:{auth},
  sessionStorage:{getItem(){return level?'a'.repeat(64):null}},
  localStorage:{getItem(){return 'b'.repeat(64)}},
  URL,URLSearchParams,queueMicrotask,CustomEvent:class{constructor(type,args){this.type=type;this.detail=args?.detail}},
  fetch:async(url)=>{
   if(String(url).includes('beagu-level-api')){calls.level++;return {ok:true,async json(){return {level:2}}}}
   return {ok:true,async json(){return {linked:false}}};
  }
 };
 for(const file of ['js/beagu-account-mode-v1.js','js/beagu-account-status-v1.js',
  'js/beagu-auth-errors-v1.js','js/beagu-session-restore-v1.js',
   'js/beagu-sms-consent-v1.js','js/beagu-sms-account-settings-v2.js',path]){
  vm.runInNewContext(read(file),context,{timeout:1500});
 }
 return {get,window,listeners,calls,auth,
  async openChallenge(){listeners.get('beagu:challenge-account-open')({detail:{mode}});await flush();},
  async submit(formId){
   const handler=get(formId).handler('submit');
   assert.equal(typeof handler,'function');
   await handler({preventDefault(){}});
   await flush();
  },
  resolve(){assert.ok(pendingResolve);pendingResolve({error});}
 };
}
function node(){return {dataset:{},textContent:'',innerHTML:'unchanged'}}
const LEAK='email=teacher@example.test; bearer=SENSITIVE_ACCESS_TOKEN';
test('all server errors map to authored safe strings, never raw messages',()=>{
 const api=errors();
 const codes=['invalid_credentials','email_exists','user_already_exists',
 'user_banned','email_not_confirmed','session_not_found','unknown_vendor_code'];
 for(const code of codes){
  const n=node();
  const state=api.fromError(n,{code,status:400,message:LEAK},'signin');
  assert.equal(state,'signin-failed');
  assert.doesNotMatch(n.textContent,/SENSITIVE|teacher@example|email_exists|user_banned/);
  assert.equal(n.innerHTML,'unchanged');
 }
});
test('signup duplicate, disabled signup, nonexistent user remain indistinguishable',()=>{
 const api=errors(),all=[];
 for(const code of ['email_exists','user_already_exists','signup_disabled','user_not_found']){
  const n=node();api.fromError(n,{code,message:LEAK},'signup');all.push(n.textContent);
  assert.equal(n.dataset.state,'signup-failed');
 }
 assert.equal(new Set(all).size,1);
});
test('structured rate limiting is actionable without parsing error.message',()=>{
 const api=errors();
 for(const sample of [{status:429,message:LEAK},{code:'over_request_rate_limit'},
                      {code:'over_email_send_rate_limit'},{code:'over_sms_send_rate_limit'}]){
  const n=node();api.fromError(n,sample,'signup');
  assert.equal(n.dataset.state,'rate-limit');
  assert.match(n.textContent,/몇 분 뒤/);
  assert.doesNotMatch(n.textContent,/SENSITIVE/);
 }
});
test('network and known weak-password errors have safe category-specific messages',()=>{
 const api=errors();
 for(const sample of [{name:'TypeError',message:LEAK},{name:'AuthRetryableFetchError'}]){
  const n=node();api.fromError(n,sample,'signin');
  assert.equal(n.dataset.state,'network');
 }
 let n=node();api.fromError(n,{code:'weak_password',message:LEAK},'signup');
 assert.equal(n.dataset.state,'weak-password');
 assert.match(n.textContent,/새 비밀번호/);
 n=node();api.fromError(n,{code:'weak_password',message:LEAK},'signin');
 assert.equal(n.dataset.state,'signin-failed');
});
test('backend 5xx and OAuth failures do not expose Auth internals',()=>{
 const api=errors();
 let n=node();api.fromError(n,{status:503,message:LEAK},'signup');
 assert.equal(n.dataset.state,'provider-unavailable');
 n=node();api.fromError(n,{code:'provider_disabled',message:LEAK},'oauth');
 assert.equal(n.dataset.state,'oauth-failed');
});
test('invalid error state names fail closed and never write HTML',()=>{
 const api=errors(),n=node();
 assert.equal(api.show(n,'<img onerror=evil()>'),'signin-failed');
 assert.equal(n.innerHTML,'unchanged');
 assert.throws(()=>api.show(null,'signin-failed'),/AUTH_ERROR_STATUS_REQUIRED/);
 assert.doesNotMatch(ERRORS,/console\.log|console\.error|localStorage|sessionStorage|innerHTML\s*=/);
});
test('sign-in UI on Challenge uses safe error after real mocked Auth invocation',async()=>{
 const h=browser('js/challenge-member-auth-v1.js');
 await h.openChallenge();
 h.get('challengeMemberEmail').value='teacher@example.test';
 h.get('challengeMemberPassword').value='old7!';
 await h.submit('challengeMemberForm');
 const n=h.get('challengeMemberMessage');
 assert.equal(h.calls.signIn,1);
 assert.equal(n.dataset.state,'signin-failed');
 assert.doesNotMatch(n.textContent,/SENSITIVE_ACCESS_TOKEN|teacher@example/);
 assert.equal(h.get('challengeMemberSubmit').disabled,false);
 assert.equal(h.get('challengeMemberSwitch').disabled,false);
 assert.equal(h.get('challengeMemberForm').dataset.busy,'false');
});
test('signup UI on Challenge treats duplicate account as generic failure',async()=>{
 const h=browser('js/challenge-member-auth-v1.js',{
  error:{code:'email_exists',message:LEAK},mode:'signup'
 });
 await h.openChallenge();
 h.get('challengeMemberEmail').value='teacher@example.test';
 h.get('challengeMemberPassword').value='long-password-1234';
 await h.submit('challengeMemberForm');
 assert.equal(h.calls.signUp,1);
 assert.equal(h.get('challengeMemberMessage').dataset.state,'signup-failed');
 assert.doesNotMatch(h.get('challengeMemberMessage').textContent,/teacher@example|SENSITIVE/);
});
test('Post-it prevents overlapping duplicate submissions while Auth request is pending',async()=>{
 const h=browser('js/postit-account-v1.js',{defer:true});
 await flush();
 h.get('postitAccountEmail').value='teacher@example.test';
 h.get('postitAccountPassword').value='old7!';
 const form=h.get('postitAccountForm');
 const onSubmit=form.handler('submit');
 onSubmit({preventDefault(){}});
 await flush();
 assert.equal(h.calls.signIn,1);
 assert.equal(form.dataset.busy,'true');
 assert.equal(h.get('postitAccountLogin').disabled,true);
 assert.equal(h.get('postitAccountSignup').disabled,true);
 onSubmit({preventDefault(){}});
 await flush();
 assert.equal(h.calls.signIn,1);
 h.resolve();
 await flush();
 assert.equal(h.get('postitAccountStatus').dataset.state,'signin-failed');
 assert.equal(form.dataset.busy,'false');
 assert.equal(h.get('postitAccountLogin').disabled,false);
 assert.equal(h.get('postitAccountSignup').disabled,false);
});
test('Post-it rate limit message does not show server error details',async()=>{
 const h=browser('js/postit-account-v1.js',{
  error:{code:'over_request_rate_limit',status:429,message:LEAK}
 });
 await flush();
 h.get('postitAccountEmail').value='teacher@example.test';
 h.get('postitAccountPassword').value='old7!';
 await h.submit('postitAccountForm');
 assert.equal(h.calls.signIn,1);
 assert.equal(h.get('postitAccountStatus').dataset.state,'rate-limit');
 assert.doesNotMatch(h.get('postitAccountStatus').textContent,/teacher@example|SENSITIVE/);
});
test('account pages load error component before credential handlers and keep live feedback',()=>{
 for(const [page,script] of pages){
  const html=read(page);
  assert.ok(html.indexOf('js/beagu-auth-errors-v1.js')>=0);
  assert.ok(html.indexOf('js/beagu-auth-errors-v1.js')<html.indexOf(script));
  assert.match(html,/role="status" aria-live="polite" aria-atomic="true"/);
 }
});
test('admin auth and Lv2 permissions stay outside client-side error presentation',()=>{
 assert.doesNotMatch(ERRORS,/supabaseClient|signInWithPassword|signUp|link_member|writer_status|level\s*[:=]\s*3/);
 const challenge=read('js/challenge-member-auth-v1.js');
 const postit=read('js/postit-account-v1.js');
 assert.match(challenge,/restored\.level\(\)/);
 assert.match(postit,/restored\.level\(\)/);
 assert.match(read('js/beagu-admin-access-v1.js'),/auth\.mfa\./);
});
