import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const html=read('challenge.html');
const code=read('js/challenge-access-v1.js');
const journey=read('styles/beagu-auth-journey-v1.css');
const shared=read('styles/beagu-auth-unified-v1.css');
const local=read('styles/challenge-access-v1.css');
assert.doesNotThrow(()=>new Script(code));
assert.match(html,/styles\/beagu-auth-unified-v1\.css/);
assert.match(html,/styles\/beagu-auth-journey-v1\.css/);
assert.match(html,/styles\/challenge-access-v1\.css/);
assert.ok(html.indexOf('styles/beagu-auth-unified-v1.css')<html.indexOf('styles/beagu-auth-journey-v1.css'));
assert.ok(html.indexOf('styles/beagu-auth-journey-v1.css')<html.indexOf('styles/challenge-access-v1.css'));
for(const name of ['beagu-auth-card','beagu-auth-heading','beagu-auth-badge',
  'beagu-auth-form','beagu-auth-field','beagu-auth-label','beagu-auth-input-wrap',
  'beagu-auth-toggle','beagu-auth-submit','beagu-auth-message','beagu-auth-help']){
  assert.ok(html.includes(name),'Challenge uses common authentication class '+name);
  assert.ok(shared.includes(name)||journey.includes(name),'Shared CSS owns '+name);
}
assert.match(html,/<h1 id="challengeAccessTitle">참여코드 입력<\/h1>/);
assert.match(html,/id="challengeAccessForm" class="beagu-auth-form"[^>]*hidden/);
assert.match(html,/id="challengeProtected" hidden/);
assert.match(html,/id="challengeAccessToggle"[^>]*type="button"[^>]*aria-pressed="false"/);
assert.match(html,/href="https:\/\/forms\.gle\/TPyCakK6Sj2zchRy7"/);
assert.ok(!local.includes('background:#2563eb'),'The challenge does not duplicate the common button theme');
assert.match(code,/api\('verify',\{\},token\)/,'Session verification remains server-side');
assert.match(code,/Number\.isInteger\(level\)&&level>=1/,'Lv0 stays locked');

const required=['challengeAccessPanel','challengeAccessForm','challengeAccessCode',
 'challengeAccessSubmit','challengeAccessFeedback','challengeProtected',
 'challengeLogout','challengeAccessBadge','challengeAccessToggle'];
const elems=Object.fromEntries(required.map(id=>[id,{
  hidden:id==='challengeProtected'||id==='challengeAccessForm',
  value:'',type:id==='challengeAccessCode'?'password':'',disabled:false,textContent:'',
  attrs:{},dataset:{},listeners:{},classes:new Set(),
  classList:{toggle(name,on){if(on)this.owner.classes.add(name);else this.owner.classes.delete(name);}},
  addEventListener(event,handler){this.listeners[event]=handler;},
  setAttribute(name,value){this.attrs[name]=value;}
}]));
for(const el of Object.values(elems))el.classList.owner=el;
let level=0;
let token='';const storage=new Map();
const eventNames=[];
const calls=[];
const win={addEventListener(){},dispatchEvent(event){eventNames.push(event.type);}};
const fakeFetch=async(_url,options)=>{
  const payload=JSON.parse(options.body);
  calls.push(payload.action);
  return {ok:true,status:200,json:async()=>payload.action==='login'
    ? {level,token:'b'.repeat(64)}:{level}};
};
runInNewContext(code,{
  SUPABASE_URL:'https://sample.supabase.co',window:win,
  document:{getElementById:id=>elems[id]},
  Event:class{constructor(type){this.type=type;}},
  sessionStorage:{
    getItem(key){return key==='beagu-level-session-v1'?token:storage.get(key)||null;},
    setItem(key,value){if(key==='beagu-level-session-v1')token=value;else storage.set(key,value);},
    removeItem(key){if(key==='beagu-level-session-v1')token='';else storage.delete(key);}
  },
  fetch:fakeFetch
});
assert.equal(elems.challengeAccessForm.hidden,false);
assert.equal(elems.challengeProtected.hidden,true);
assert.equal(elems.challengeAccessBadge.textContent,'Lv.0 · 미인증');
assert.equal(elems.challengeAccessPanel.attrs['data-auth-level'],'0');
elems.challengeAccessCode.value='testcode';
elems.challengeAccessToggle.listeners.click();
assert.equal(elems.challengeAccessCode.type,'text');
assert.equal(elems.challengeAccessToggle.attrs['aria-pressed'],'true');
elems.challengeAccessToggle.listeners.click();
assert.equal(elems.challengeAccessCode.type,'password');
assert.equal(elems.challengeAccessToggle.attrs['aria-pressed'],'false');
await elems.challengeAccessForm.listeners.submit({preventDefault(){}});
assert.equal(token,'','Lv0 cannot obtain persisted session');
assert.equal(elems.challengeProtected.hidden,true,'Lv0 cannot view certificate');
level=1;
elems.challengeAccessCode.value='testcode';
await elems.challengeAccessForm.listeners.submit({preventDefault(){}});
assert.equal(token,'b'.repeat(64));
assert.deepEqual(JSON.parse(storage.get('beagu-login-code-mask-v1')),{token,mask:'te******'});
assert.equal(elems.challengeProtected.hidden,false);
assert.equal(elems.challengeAccessForm.hidden,true);
assert.equal(elems.challengeAccessBadge.textContent,'Lv.1 인증 완료');
assert.ok(elems.challengeAccessBadge.classes.has('is-authenticated'));
assert.equal(elems.challengeAccessPanel.attrs['data-auth-level'],'1');
assert.equal(elems.challengeLogout.hidden,false);
assert.equal(elems.challengeAccessCode.value,'');
assert.equal(elems.challengeAccessCode.type,'password');
assert.ok(eventNames.includes('beagu:challenge-access-granted'));
await elems.challengeLogout.listeners.click();
assert.equal(token,'');
assert.equal(storage.has('beagu-login-code-mask-v1'),false);
assert.equal(elems.challengeProtected.hidden,true);
assert.equal(elems.challengeAccessForm.hidden,false);
assert.equal(elems.challengeAccessBadge.textContent,'Lv.0 · 미인증');
assert.equal(elems.challengeLogout.hidden,true);
assert.ok(eventNames.includes('beagu:challenge-access-revoked'));
assert.deepEqual(calls.filter(a=>a==='login'),['login','login']);
assert.ok(calls.includes('logout'));
console.log('PASS: challenge shares search/compare Lv1 auth UI; Lv0 gate, toggle, Lv1 unlock and logout all work');
