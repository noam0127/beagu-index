import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(path,'utf8');
const html=read('challenge.html');
const ui=read('js/beagu-participation-auth-v2.js');
const member=read('js/challenge-member-auth-v1.js');
const css=read('styles/challenge-member-auth-v1.css');
assert.doesNotThrow(()=>new vm.Script(member));
assert.doesNotThrow(()=>new vm.Script(ui));
for(const id of ['challengeMemberOverlay',
  'challengeMemberDialog','challengeMemberTitle','challengeMemberDescription','challengeMemberForm',
  'challengeMemberEmail','challengeMemberPassword','challengeMemberSubmit','challengeMemberSwitch',
  'challengeMemberClose','challengeMemberMessage','challengeMemberLink','challengeMemberSignOut',
  'challengeMemberSmsFields','challengeMemberSmsPhone','challengeMemberSmsConsent','challengeMemberSmsCollectionConsent','challengeMemberSmsUnsubscribe','challengeMemberSmsSave','challengeMemberSmsStatus'])
 assert.ok(html.includes('id="'+id+'"'),'Missing actual account UI element '+id);
assert.ok(!html.includes('id="challengeMemberSignupSection"'),'Removed signup card must not remain');
assert.ok(!html.includes('Lv2 달성 · 정식 계정으로 기능 확장'));
assert.ok(!html.includes('id="challengeMemberSignup"'));
assert.ok(html.includes('data-html2canvas-ignore="true"'),'Private member controls outside certificate capture');
assert.match(html,/id="challengeMemberOverlay"[^>]*hidden/);
assert.match(html,/js\/challenge-member-auth-v1\.js\?v=/);
assert.match(html,/styles\/challenge-member-auth-v1\.css\?v=/);
assert.match(ui,/host\.id==='challengeAccessPanel'&&level>=2/);
assert.match(ui,/state\.textContent=challengeLogin\?'로그인하기':text/);
assert.match(ui,/new CustomEvent\('beagu:challenge-account-open'/);
assert.ok(ui.includes("if(lastLevel>=2)"));
assert.match(ui,/else open\(\);/);
assert.match(member,/client\.auth\.signUp\(/);
assert.match(member,/client\.auth\.signInWithPassword\(/);
assert.match(read('js/beagu-session-restore-v1.js'),/client\.auth\.getUser\(\)/);
assert.match(member,/writer_status/);
assert.match(member,/action:'link_member',deviceSecret:original/);
assert.match(member,/await serverLevel\(\)/);
assert.ok(!member.includes('signupSection'),'Signup card script references removed');
assert.match(member,/badge\?\.dataset\.level==='2'/);
assert.ok(!member.includes('localStorage.setItem(DEVICE_KEY'),'Never mint a new device credential');
assert.match(css,/\[hidden\]\{display:none!important\}/);
assert.match(css,/@media\(max-width:440px\)/);

class Fake {
 constructor(id){
  this.id=id;this.dataset={};this.hidden=true;this.disabled=false;
  this.textContent='';this.value='';this.checked=false;this.listeners={};this.isConnected=true;
  this.classList={add:()=>{},remove:()=>{}};
  this.focusCount=0;
 }
 addEventListener(type,fn){this.listeners[type]=fn}
 async fire(type,payload={}){return this.listeners[type]?.(payload)}
 focus(){this.focusCount++}
 getClientRects(){return [1]}
 querySelectorAll(){return []}
 closest(){return null}
}
const ids=['challengeIdentityPanel',
 'challengeMemberOverlay','challengeMemberDialog','challengeMemberTitle',
 'challengeMemberDescription','challengeMemberForm','challengeMemberEmail',
 'challengeMemberPassword','challengeMemberSubmit','challengeMemberSwitch',
 'challengeMemberClose','challengeMemberMessage','challengeMemberLink',
 'challengeMemberSignOut','challengeMemberSmsFields','challengeMemberSmsPhone',
 'challengeMemberSmsConsent','challengeMemberSmsCollectionConsent','challengeMemberSmsUnsubscribe','challengeMemberSmsSave','challengeMemberSmsStatus',
 'challengePrivacyPanel','challengePrivacySummary','challengePrivacyStatus',
 'challengePrivacyAccess','challengePrivacyCancelAccess',
 'challengePrivacyRequestDeletion','challengePrivacyCancelDeletion',
 'challengePrivacyConfirmEmail','challengePrivacyConfirmPhrase','beaguLevelState'];
const elements=Object.fromEntries(ids.map(id=>[id,new Fake(id)]));
elements.beaguLevelState.dataset.level='1';
const events={},localEvents={};
const token='a'.repeat(64),device='b'.repeat(64);
const levelStore={getItem:key=>key==='beagu-level-session-v1'?token:null};
const localStore={getItem:key=>key==='beagu-referral-device-secret-v1'?device:null};
let auth=false,signups=0,signins=0,links=0,logouts=0,lastSignup=null;
const client={auth:{
 async getSession(){return {data:{session:auth?{access_token:'bearer-test'}:null},error:null}},
 async getUser(){return {data:{user:auth?{id:'user',email_confirmed_at:'2026-11-21'}:null},error:null}},
 async signUp(payload){signups++;lastSignup=payload;return {error:null}},
 async signInWithPassword(){signins++;auth=true;return {error:null}},
 async signOut(){logouts++;auth=false;return {error:null}},
 onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
}};
const browser={
 window:{supabaseClient:client,BEAGU_AUTH_RETURN:{resolve:page=>`https://baeguindex.com/${page}.html`},
  addEventListener:(name,fn)=>{events[name]=fn},dispatchEvent:e=>events[e.type]?.(e)},
 document:{getElementById:id=>elements[id]||null,activeElement:elements.challengeIdentityPanel,
  body:{classList:{add(){},remove(){}}},
  addEventListener:(name,fn)=>{localEvents[name]=fn}},
 sessionStorage:levelStore,localStorage:localStore,
 location:{href:'https://baeguindex.com/challenge.html'},
 URL,queueMicrotask,console,
 CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
 fetch:async(url,options)=>{
  const request=String(url);
  if(request.includes('beagu-level-api'))return {ok:true,json:async()=>({level:2})};
  if(request.includes('writer_status'))return {ok:true,json:async()=>({linked:false})};
  if(request.includes('beagu-postit-api-v1')){links++;return {ok:true,json:async()=>({linked:true})}}
  throw Error('Unknown request '+request);
 }
};
vm.runInNewContext(read('js/beagu-account-mode-v1.js'),browser);
vm.runInNewContext(read('js/beagu-account-status-v1.js'),browser);
vm.runInNewContext(read('js/beagu-session-restore-v1.js'),browser);
vm.runInNewContext(read('js/beagu-auth-errors-v1.js'),browser);
vm.runInNewContext(read('js/beagu-sms-consent-v1.js'),browser);
vm.runInNewContext(read('js/beagu-sms-account-settings-v2.js'),browser);
vm.runInNewContext(read('js/beagu-account-privacy-v1.js'),browser);
vm.runInNewContext(member,browser);
assert.equal(elements.challengeMemberOverlay.hidden,true,'Lv1 starts with modal hidden');
elements.beaguLevelState.dataset.level='2';
events['beagu:level-state-updated']?.({detail:{level:2}});
events['beagu:challenge-account-open']?.({detail:{mode:'signup'}});
assert.equal(elements.challengeMemberOverlay.hidden,false,'Existing account event must open actual modal');
assert.equal(elements.challengeMemberTitle.textContent,'Lv2 회원가입');
elements.challengeMemberEmail.value='teacher@example.com';
elements.challengeMemberPassword.value='safe-password-test';
await Promise.resolve();await Promise.resolve();await Promise.resolve();
await elements.challengeMemberForm.fire('submit',{preventDefault(){}});
assert.equal(signups,1,'Signup uses Supabase Auth instead of fake success');
assert.equal(lastSignup.options.data,undefined,'Signup never sends personal phone data or consent via mutable Auth metadata');
assert.equal(elements.challengeMemberSmsConsent.checked,false,'Consent must default unchecked');
assert.equal(elements.challengeMemberSmsCollectionConsent.checked,false,'Collection consent also defaults unchecked');
elements.challengeMemberPassword.value='safe-password-test';
elements.challengeMemberSmsCollectionConsent.checked=true;
elements.challengeMemberSmsConsent.checked=true;
elements.challengeMemberSmsPhone.value='010-1234-5678';
await elements.challengeMemberForm.fire('submit',{preventDefault(){}});
assert.equal(signups,2,'Signup remains independent of SMS consent controls');
assert.equal(lastSignup.options.data,undefined,'Unverified signup may not persist phone or consent in Auth metadata');
assert.match(elements.challengeMemberMessage.textContent,/이메일 인증/);
await elements.challengeMemberClose.fire('click');
assert.equal(elements.challengeMemberOverlay.hidden,true);
events['beagu:challenge-account-open']?.({detail:{mode:'signin'}});
assert.equal(elements.challengeMemberOverlay.hidden,false,'Login action opens actual modal');
assert.equal(elements.challengeMemberTitle.textContent,'Lv2 로그인');
elements.challengeMemberEmail.value='teacher@example.com';
elements.challengeMemberPassword.value='safe-password-test';
await Promise.resolve();await Promise.resolve();await Promise.resolve();
await elements.challengeMemberForm.fire('submit',{preventDefault(){}});
assert.equal(signins,1,'Login uses actual Supabase Auth');
assert.equal(elements.challengeMemberLink.hidden,false,'Original-device account linking available');
await elements.challengeMemberLink.fire('click');
assert.equal(links,1);
assert.equal(elements.challengeMemberLink.hidden,true);
assert.match(elements.challengeMemberMessage.textContent,/연결 완료/);
await elements.challengeMemberSignOut.fire('click');
assert.equal(logouts,1);
elements.beaguLevelState.dataset.level='0';
events['beagu:level-state-updated']?.({detail:{level:0}});
assert.equal(elements.challengeMemberOverlay.hidden,true,'Revoked level closes login dialog');
console.log('PASS: signup CTA removed; Lv2 account modal/Auth calls and original-device linking preserved');