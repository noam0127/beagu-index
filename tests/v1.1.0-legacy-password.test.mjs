import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const getSource = path => readFileSync(path, 'utf8');
const existingPassword = 'old7!'; // synthetic fixture, NEVER a real account credential
const signupPassword = 'NewStrongP10!';

function element(id) {
  const listeners = new Map();
  return {
    id, value:'', checked:false, hidden:false, disabled:false,
    textContent:'', placeholder:'', autocomplete:'',
    minLength:0, dataset:{}, style:{},
    isConnected:true, getClientRects:()=>[{}],
    classList:{add(){},remove(){},toggle(){}},
    addEventListener(type,fn){listeners.set(type,fn)},
    listener(type){return listeners.get(type)},
    focus(){},
    setAttribute(){}, getAttribute(){return null},
    querySelectorAll(){return []},
  };
}
function harness(filename,{level=false}={}){
  const ids=new Map();
  const byId=id=>{
    if(!ids.has(id)){
      const e=element(id);
      if(id==='beaguLevelState')e.dataset.level=level?'2':'0';
      if(id==='challengeMemberOverlay')e.hidden=true;
      ids.set(id,e);
    }
    return ids.get(id);
  };
  const listeners=new Map();
  const calls={signIn:[],signUp:[],fetch:0};
  const auth={
    async signInWithPassword(args){ calls.signIn.push(args); return {error:null} },
    async signUp(args){ calls.signUp.push(args);return {error:null} },
    async getSession(){return {data:{session:null},error:null}},
    async getUser(){return {data:{user:null},error:null}},
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},
    async signOut(){return {error:null}}
  };
  const document={
    getElementById:byId,
    body:{classList:{add(){},remove(){}}},
    activeElement:element('active'),
    addEventListener(type,fn){listeners.set('document:'+type,fn)},
    querySelectorAll(){return [...ids.values()].filter(e=>e.id.endsWith('Submit'))},
  };
  const window={
    addEventListener(type,fn){listeners.set(type,fn)},
    dispatchEvent(){},
    BEAGU_AUTH_RETURN:{resolve:(name)=>'https://baeguindex.com/'+name+'.html'}
  };
  const scope={
    document,window,supabaseClient:{auth},URL,URLSearchParams,
    sessionStorage:{getItem(){return level?'a'.repeat(64):null}},
    localStorage:{getItem(){return null}},
    crypto:{},CustomEvent:class {constructor(type,init){this.type=type;this.detail=init?.detail}},
    Event:class{constructor(type){this.type=type}},queueMicrotask,
    fetch:async()=>{calls.fetch++;return {ok:true,status:200,async json(){return {level:2}}}}
  };
  vm.runInNewContext(getSource(filename),scope,{timeout:1500});
  return {byId,auth,calls,listeners,window};
}
const submit=async fn=>{
  assert.equal(typeof fn,'function','submit event should be registered');
  await fn({preventDefault(){}});
};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('challenge: existing 5-character password reaches Supabase signIn unchanged',async()=>{
  const h=harness('js/challenge-member-auth-v1.js',{level:true});
  h.listeners.get('beagu:challenge-account-open')({detail:{mode:'signin'}});
  await flush();
  assert.equal(h.byId('challengeMemberPassword').minLength,1);
  assert.equal(h.byId('challengeMemberPassword').autocomplete,'current-password');
  h.byId('challengeMemberEmail').value='user@example.test';
  h.byId('challengeMemberPassword').value=existingPassword;
  await submit(h.byId('challengeMemberForm').listener('submit'));
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.signIn)),[{email:'user@example.test',password:existingPassword}]);
  assert.equal(h.calls.signUp.length,0);
});

test('challenge: new signup still rejects short passwords, accepts 10+ only',async()=>{
  const h=harness('js/challenge-member-auth-v1.js',{level:true});
  h.listeners.get('beagu:challenge-account-open')({detail:{mode:'signup'}});
  await flush();
  assert.equal(h.byId('challengeMemberPassword').minLength,10);
  assert.equal(h.byId('challengeMemberPassword').autocomplete,'new-password');
  h.byId('challengeMemberEmail').value='user@example.test';
  h.byId('challengeMemberPassword').value=existingPassword;
  await submit(h.byId('challengeMemberForm').listener('submit'));
  assert.equal(h.calls.signUp.length,0);
  assert.match(h.byId('challengeMemberMessage').textContent,/10자 이상/);
  h.byId('challengeMemberPassword').value=signupPassword;
  await submit(h.byId('challengeMemberForm').listener('submit'));
  assert.equal(h.calls.signUp.length,1);
  assert.equal(h.calls.signUp[0].password,signupPassword);
  assert.equal(h.calls.signIn.length,0);
});

test('postit: existing short password is passed to Supabase Auth',async()=>{
  const h=harness('js/postit-account-v1.js',{level:false});
  await flush(); // finish initial account status refresh before user input
  h.byId('postitAccountEmail').value='user@example.test';
  h.byId('postitAccountPassword').value=existingPassword;
  await submit(h.byId('postitAccountForm').listener('submit'));
  await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.signIn)),[{email:'user@example.test',password:existingPassword}]);
  assert.equal(h.calls.signUp.length,0);
});

test('postit: signup rejects legacy-short passwords and permits 10+ password',async()=>{
  const h=harness('js/postit-account-v1.js');
  await flush(); // prevent initial UI render from overwriting validation feedback
  h.byId('postitAccountEmail').value='user@example.test';
  h.byId('postitAccountPassword').value=existingPassword;
  await h.byId('postitAccountSignup').listener('click')();
  await flush();
  assert.equal(h.calls.signUp.length,0);
  assert.match(h.byId('postitAccountStatus').textContent,/10자 이상의 새 비밀번호/);
  h.byId('postitAccountPassword').value=signupPassword;
  await h.byId('postitAccountSignup').listener('click')();
  await flush();
  assert.equal(h.calls.signUp.length,1);
  assert.equal(h.calls.signUp[0].password,signupPassword);
  assert.equal(h.calls.signIn.length,0);
});

test('admin enrollment: legacy-short login has no new-signup policy check',async()=>{
  const h=harness('js/beagu-admin-enroll-v1.js');
  await flush(); // await initial restore() message before submitting login
  h.byId('enrollLoginEmail').value='owner@example.test';
  h.byId('enrollLoginPassword').value=existingPassword;
  await submit(h.byId('enrollLoginForm').listener('submit'));
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.signIn)),[
    {email:'owner@example.test',password:existingPassword}
  ]);
});

test('admin enrollment: new signup retains its independent 16-character policy',async()=>{
  const h=harness('js/beagu-admin-enroll-v1.js');
  await flush(); // await initial restore() message before signup validation
  h.byId('enrollRegisterEmail').value='owner@example.test';
  h.byId('enrollRegisterPassword').value=signupPassword;
  h.byId('enrollRegisterConfirm').value=signupPassword;
  await submit(h.byId('enrollRegisterForm').listener('submit'));
  assert.equal(h.calls.signUp.length,0);
  assert.match(h.byId('enrollStatus').textContent,/16자 이상/);
});

test('HTML browser validation cannot pre-block existing 10-char-or-less passwords',()=>{
  for(const [file,id] of [['challenge.html','challengeMemberPassword'],
                           ['postit.html','postitAccountPassword'],
                           ['admin-enroll.html','enrollLoginPassword'],
                           ['admin.html','adminPassword']]){
    const html=getSource(file);
    const tag=html.match(new RegExp('<input\\b[^>]*id="'+id+'"[^>]*>', 's'))?.[0];
    assert.ok(tag, id);
    assert.doesNotMatch(tag,/minlength="(?:10|16)"/);
    assert.match(tag,/autocomplete="current-password"/);
    assert.match(tag,/required/);
  }
  const challenge=getSource('js/challenge-member-auth-v1.js');
  assert.match(challenge,/password\.minLength=mode==='signup'\?10:1/);
  assert.doesNotMatch(challenge,/secret\.length<10\)\s*\{/);
  const postit=getSource('js/postit-account-v1.js');
  assert.match(postit,/action==='signup'&&password\.length<10/);
  const admin=getSource('admin-enroll.html');
  assert.match(admin,/id="enrollRegisterPassword"[^>]*minlength="16"/);
  assert.match(getSource('admin.html'),/id="adminNewPassword"[^>]*minlength="16"/);
  assert.match(getSource('js/beagu-admin-access-v1.js'),/auth\.signInWithPassword\(\{email,password\}\)/);
});

test('empty passwords are still blocked in user signup/login flows',async()=>{
  for(const [file,pwdId,emailId,formId] of [
    ['js/challenge-member-auth-v1.js','challengeMemberPassword','challengeMemberEmail','challengeMemberForm'],
    ['js/postit-account-v1.js','postitAccountPassword','postitAccountEmail','postitAccountForm']
  ]){
    const h=harness(file,{level:true});
    if(file.includes('challenge')){h.listeners.get('beagu:challenge-account-open')({detail:{mode:'signin'}});await flush();}
    h.byId(emailId).value='user@example.test';
    h.byId(pwdId).value='';
    await submit(h.byId(formId).listener('submit'));
    await flush();
    assert.equal(h.calls.signIn.length,0,file);
    assert.equal(h.calls.signUp.length,0,file);
  }
});
