import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(p,'utf8');
const script=read('js/beagu-account-mode-v1.js');
function field(value=''){
 return {
  value,checked:false,hidden:false,dataset:{},
  minLength:0,autocomplete:'',placeholder:'',
  textContent:''
 };
}
function create(options={}){
 const window={};
 vm.runInNewContext(script,{window},{timeout:1500});
 const elements={
  form:field(),title:field(),description:field(),
  password:field('old-password'),submit:field(),
  switchButton:field(),smsFields:field(),
  smsPhone:field('01012345678'),smsConsent:field(),smsCollectionConsent:field(),
  forgot:field(),google:field()
 };
 elements.smsConsent.checked=true;
 elements.smsCollectionConsent.checked=true;
 const ui=window.BeaguAccountMode.create({...elements,...options});
 return {window,elements,ui};
}

test('sign-in is initially one consistent screen and does not demand a new password minimum',()=>{
 const {elements:e,ui}=create();
 assert.equal(ui.setMode('signin'),'signin');
 assert.equal(ui.mode(),'signin');
 assert.equal(e.form.dataset.mode,'signin');
 assert.equal(e.title.textContent,'Lv2 로그인');
 assert.equal(e.submit.textContent,'로그인하기');
 assert.equal(e.switchButton.textContent,'계정이 없어요 · 회원가입');
 assert.equal(e.password.autocomplete,'current-password');
 assert.equal(e.password.minLength,1);
 assert.equal(e.password.placeholder,'기존 비밀번호');
 assert.equal(e.smsFields.hidden,true);
 assert.equal(e.smsConsent.checked,false);
 assert.equal(e.smsCollectionConsent.checked,false);
 assert.equal(e.smsPhone.disabled,true);
 assert.equal(e.smsPhone.value,'');
 assert.equal(e.forgot.hidden,false);
 assert.equal(e.google.hidden,false);
});

test('signup uses the same form, a 10-char minimum and exposes optional unchecked SMS',()=>{
 const {elements:e,ui}=create();
 ui.setMode('signin');
 e.password.value='old-user-secret';
 e.smsConsent.checked=true;
 e.smsCollectionConsent.checked=true;
 e.smsPhone.value='01012345678';
 assert.equal(ui.toggle(),'signup');
 assert.equal(ui.mode(),'signup');
 assert.equal(e.form.dataset.mode,'signup');
 assert.equal(e.title.textContent,'Lv2 회원가입');
 assert.match(e.description.textContent,/인증 메일/);
 assert.equal(e.submit.textContent,'회원가입');
 assert.equal(e.switchButton.textContent,'이미 계정이 있어요 · 로그인하기');
 assert.equal(e.password.autocomplete,'new-password');
 assert.equal(e.password.minLength,10);
 assert.equal(e.password.value,'');
 assert.equal(e.smsPhone.value,'');
 assert.equal(e.smsConsent.checked,false);
 assert.equal(e.smsCollectionConsent.checked,false);
 assert.equal(e.smsPhone.disabled,true);
 assert.equal(e.smsFields.hidden,false);
 assert.equal(e.forgot.hidden,true);
 assert.equal(e.google.hidden,true);
});

test('returning to sign-in clears signup password, phone and marketing opt-in',()=>{
 const {elements:e,ui}=create();
 ui.setMode('signup');
 e.password.value='my-very-long-signup-secret';
 e.smsConsent.checked=true;
 e.smsCollectionConsent.checked=true;
 e.smsPhone.value='01012345678';
 assert.equal(ui.toggle(),'signin');
 assert.equal(e.password.value,'');
 assert.equal(e.smsPhone.value,'');
 assert.equal(e.smsConsent.checked,false);
 assert.equal(e.smsCollectionConsent.checked,false);
 assert.equal(e.smsPhone.disabled,true);
 assert.equal(e.smsFields.hidden,true);
 assert.equal(e.password.minLength,1);
 assert.equal(e.google.hidden,false);
});

test('mode controller fails closed if required account fields are missing',()=>{
 const window={};
 vm.runInNewContext(script,{window},{timeout:1000});
 assert.throws(()=>window.BeaguAccountMode.create({}),/ACCOUNT_UI_MISSING_ELEMENT/);
});

test('unsupported or attacker-controlled mode strings are never treated as signup',()=>{
 const {elements:e,ui}=create();
 assert.equal(ui.setMode('__proto__'),'signin');
 assert.equal(ui.setMode('signup?admin=true'),'signin');
 assert.equal(ui.setMode('signup'),'signup');
 assert.equal(ui.setMode('lv3'),'signin');
 assert.equal(e.form.dataset.mode,'signin');
});

test('Challenge and Post-it load shared controller before either account script',()=>{
 for(const [page,scriptName] of [
   ['challenge.html','js/challenge-member-auth-v1.js'],
   ['postit.html','js/postit-account-v1.js']
 ]){
  const html=read(page);
  assert.ok(html.indexOf('js/beagu-account-mode-v1.js')>0);
  assert.ok(html.indexOf('js/beagu-account-mode-v1.js')<
    html.indexOf(scriptName),page);
  assert.match(html,/styles\/beagu-account-mode-v1\.css/);
  assert.match(html,/class="[^"]*beagu-account-unified-form/);
 }
});

test('Post-it uses one submit action and a mode switch without auto signup from click',()=>{
 const html=read('postit.html');
 assert.match(html,/id="postitAccountHeading">Lv2 로그인/);
 assert.match(html,/id="postitAccountDescription"/);
 assert.match(html,/id="postitSmsFields"[^>]*hidden/);
 assert.match(html,/id="postitAccountLogin">로그인하기/);
 assert.match(html,/type="button" id="postitAccountSignup">계정이 없어요/);
 const code=read('js/postit-account-v1.js');
 assert.match(code,/accountMode\.toggle\(\)/);
 assert.match(code,/executeAuth\(accountMode\.mode\(\)\)/);
 assert.doesNotMatch(code,/postitAccountSignup'\)\.addEventListener\('click',\(\)=>void executeAuth\('signup'\)/);
 assert.match(code,/signInWithPassword\(\{email,password\}\)/);
 assert.match(code,/signUp\(\{email,password,options:/);
});

test('Challenge modal still requires server-verified Lv2 before opening membership',()=>{
 const js=read('js/challenge-member-auth-v1.js');
 assert.match(js,/window\.BeaguAccountMode\.create\(/);
 assert.match(js,/accountMode\.setMode\(next\)/);
 assert.match(js,/if\(!tier2\)return/);
 assert.match(js,/if\(!await serverLevel\(\)\)throw Error\('LEVEL_REQUIRED'\)/);
 assert.match(js,/client\.auth\.signInWithPassword\(/);
 assert.match(js,/client\.auth\.signUp\(/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|SUPABASE_SERVICE_ROLE_KEY/);
});

test('admin login is a separate approval and MFA path, not part of the Lv2 switch',()=>{
 const html=read('admin.html'),script=read('js/beagu-admin-access-v1.js');
 assert.ok(!html.includes('beagu-account-mode-v1.js'));
 assert.match(html,/id="adminMfaForm"/);
 assert.match(script,/auth\.mfa\./);
 assert.ok(!script.includes('BeaguAccountMode'));
});
