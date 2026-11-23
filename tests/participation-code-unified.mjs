import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pages=['index.html','search.html','search-lv1.html','challenge.html',
 'statistics.html','postit.html','levels.html','school-report.html',
 'teacher-run.html','teacher-volleyball.html','arcade-history.html',
 'survey.html','release-policy.html'];
for(const page of pages){
 const html=read(page);
 assert.match(html,/id="beaguLevelState"/,'Shared status on '+page);
 assert.match(html,/js\/beagu-participation-auth-v2\.js/,'Shared code dialog on '+page);
 assert.match(html,/styles\/beagu-participation-auth-v2\.css/,'Shared styling on '+page);
}
const ui=read('js/beagu-participation-auth-v2.js');
assert.doesNotThrow(()=>new Script(ui),'Shared auth module parses');
for(const phrase of ['참여코드 입력','레벨1 인증',
 '발급받은 참여코드를 입력하면 이용 가능한 학교정보가 열립니다.',
 '참여코드를 입력하세요','Lv2 달성하기 — 챌린지',
 '✓ Lv1 · 설문 참여 완료','♛ Lv2 · 챌린지 달성']){
 assert.ok(ui.includes(phrase),'Shared copy: '+phrase);
}
assert.ok(ui.includes('beagu:participation-authenticated'));
assert.ok(ui.includes('beagu:participation-logged-out'));
assert.ok(ui.includes("action,payload={},token=''"));
assert.match(ui,/sessionStorage\.setItem\(KEY,result\.token\)/);
assert.match(ui,/const checked=await request\('verify',\{\},result\.token\)/);
assert.match(ui,/sessionStorage\.removeItem\(KEY\)/);
assert.doesNotMatch(ui,/Lv3 활성화|Lv3 승급|회원가입 유도/,'No Lv3 prompts or account registration UI');
const css=read('styles/beagu-participation-auth-v2.css');
assert.match(css,/@media\(max-width:760px\)/);
assert.match(css,/#beaguParticipationForm\[hidden\]\{display:none!important\}/);
assert.match(ui,/form\.hidden=level>=2/,'Lv1 keeps the upgrade code field visible');
assert.match(ui,/lastLevel===1&&level<2/,'Lv1 preserved on unearned code');
assert.match(css,/\.beagu-participation-host \.beagu-participation-legacy/);
assert.ok(!css.includes('display:contents'));
assert.ok(css.includes('#tierCodeForm.beagu-participation-legacy'), 'School report legacy form hidden behind the shared dialog');
assert.ok(!ui.includes('고유번호 인증')&&!ui.includes('beaguLevelUpOverlay'), 'No retired identity-code button or overlay');
assert.match(read('school-report.html'),/id="tierSubmit" type="submit">레벨1 인증<\/button>/, 'School report fallback label is consistent');
for(const file of ['js/level-search.js','js/statistics-compare.js','js/challenge-access-v1.js','school-report.html'])
 assert.ok(read(file).includes('beagu:participation-authenticated'),'Page state sync '+file);

const server=read('supabase/functions/beagu-level-api/index.ts');
const referral=read('supabase/functions/beagu-referral-link-v1/index.ts');
const postit=read('supabase/functions/beagu-postit-api-v1/index.ts');
const migration=read('supabase/migrations/20261121_earned_challenge_participation_auth.sql');
assert.ok(server.includes("admin.rpc('beagu_earned_challenge_visitor'"),
 'Lv2 identity must be earned');
assert.ok(!server.includes("admin.rpc('beagu_check_class_diary_guest_code'"),
 'Preissued unearned challenge code must not unlock Lv2');
assert.ok(server.includes("record.identity_campaign='2026'")&&server.includes("record.identity_visitor_id=visitorId"));
assert.ok(server.includes("admin.rpc('beagu_has_earned_challenge_visitor'"),
 'Every protected request must confirm current credit');
assert.ok(postit.includes('beagu_has_earned_challenge_visitor'),
 'Post-it reads and writes must fail closed on disabled referrals');
assert.ok(referral.includes("identity_campaign: '2026', identity_visitor_id: visitor"),
 'Referral-triggered session upgrades bind stable identity');
assert.ok(migration.includes('p.valid_referrals>=1')&&migration.includes('p.upgraded_at is not null')
 &&migration.includes('p.disabled=false'),'Credential checks real earned credit');
assert.ok(migration.includes('to service_role'),'RPCs are service-role only');
assert.ok(server.includes("beagu_2026_lv2_released_question_results"),
 'Preserve newer immediate reviewed-release feature');
assert.ok(read('levels.html').includes('서버에서 유효한 추천 참여가 확인된 코드'));
assert.doesNotMatch(read('levels.html'),/정식 계정 준비중|Lv\.2\(임시\)|Lv\.2\(진\)/);

function fakeElement(name='div'){
 const handlers={};
 const attrs={};
 const classes=new Set();
 return {
  name,handlers,attrs,style:{},dataset:{},classList:{
   add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)},
   toggle(x,v){if(v)classes.add(x);else classes.delete(x)}
  },textContent:'',value:'',type:'password',hidden:false,disabled:false,
  setAttribute(k,v){attrs[k]=String(v)},getAttribute(k){return attrs[k]},
  addEventListener(k,f){(handlers[k]??=[]).push(f)},
  dispatch(k,event){return Promise.all((handlers[k]||[]).map(f=>f(event)))},
  focus(){},getClientRects(){return [1]},append(){},before(){},
  querySelector(){return null}
 };
}
async function exercise(level){
 const nodes=new Map(),storage=new Map(),events=[],calls=[];
 const selectors=['#beaguParticipationForm','#beaguParticipationCode',
 '#beaguParticipationSubmit','#beaguParticipationMessage','#beaguParticipationDetail',
 '#beaguParticipationCodeLabel',
 '#beaguParticipationTier','#beaguParticipationExpiry','#beaguParticipationToggle',
 '[data-beagu-close]','#beaguParticipationLogout'];
 for(const id of selectors)nodes.set(id,fakeElement());
 const badge=fakeElement('a');badge.dataset.level='0';
 const modal=fakeElement('div');modal.querySelector=id=>nodes.get(id)||null;
 let appended=null;const body=fakeElement('body');
 body.append=el=>{appended=el};
 const doc={body,createElement:tag=>tag==='div'?modal:fakeElement(tag),
  getElementById:id=>id==='beaguLevelState'?badge:null,
  querySelectorAll:()=>[],addEventListener(){}};
 const token='b'.repeat(64);
 let issuedLevel=level,issuedToken=token;
 const storageAPI={
  getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),
  removeItem:k=>storage.delete(k)
 };
 const win={
  self:null,top:null,location:{assign:()=>assert.fail('Unexpected redirect')},
  dispatchEvent:e=>events.push(e.type),
  handlers:{},
  addEventListener(k,f){(this.handlers[k]??=[]).push(f)}
 };
 win.self=win;win.top=win;
 const context=createContext({
  document:doc,window:win,sessionStorage:storageAPI,
  CustomEvent:class{constructor(type,o){this.type=type;this.detail=o?.detail}},
  Event:class{constructor(type){this.type=type}},
  fetch:async (_url,opts)=>{
   const action=JSON.parse(opts.body).action;
   calls.push(action);
   if(action==='login')return {ok:true,json:async()=>({token:issuedToken,level:issuedLevel})};
   if(action==='verify')return {ok:true,json:async()=>({level:issuedLevel,expires_at:'2026-11-21T11:00:00+09:00'})};
   if(action==='logout')return {ok:true,json:async()=>({ok:true})};
   throw Error('unknown action');
  }
 });
 new Script(ui).runInContext(context);
 assert.equal(appended,modal);
 assert.equal(badge.textContent,'Lv.0');
 await nodes.get('#beaguParticipationForm').dispatch('submit',{preventDefault(){}});
 // Empty codes are always rejected locally.
 assert.equal(storage.size,0);
 nodes.get('#beaguParticipationCode').value='ABCDEF123456';
 await nodes.get('#beaguParticipationForm').dispatch('submit',{preventDefault(){}});
 assert.equal(storage.get('beagu-level-session-v1'),token);
 assert.equal(badge.textContent,'Lv.'+level);
 assert.equal(nodes.get('#beaguParticipationForm').hidden,level===2);
 assert.ok(events.includes('beagu:participation-authenticated'));
 if(level===1){
  assert.equal(nodes.get('#beaguParticipationCodeLabel').textContent,'Lv.2 참여코드');
  assert.equal(nodes.get('#beaguParticipationSubmit').textContent,'Lv.2 인증하기');
  issuedToken='c'.repeat(64);issuedLevel=1;
  nodes.get('#beaguParticipationCode').value='NOTUPGRADED12';
  await nodes.get('#beaguParticipationForm').dispatch('submit',{preventDefault(){}});
  assert.equal(storage.get('beagu-level-session-v1'),token,'Unqualified code must not replace Lv1');
  assert.match(nodes.get('#beaguParticipationMessage').textContent,/기존 Lv.1 인증은 유지/);
  issuedToken='d'.repeat(64);issuedLevel=2;
  nodes.get('#beaguParticipationCode').value='EARNEDLV2CODE';
  await nodes.get('#beaguParticipationForm').dispatch('submit',{preventDefault(){}});
  assert.equal(storage.get('beagu-level-session-v1'),issuedToken,'Earned code upgrades session');
  assert.equal(badge.textContent,'Lv.2');
  assert.equal(nodes.get('#beaguParticipationForm').hidden,true);
 }
 await nodes.get('#beaguParticipationLogout').dispatch('click');
 assert.equal(storage.size,0);
 assert.ok(events.includes('beagu:participation-logged-out'));
 assert.deepEqual(calls,level===1?['login','verify','login','verify','login','verify','logout']:['login','verify','logout']);
}
await exercise(1);await exercise(2);
console.log('PASS: Lv0/Lv1/Lv2 shared code UI, server-only earned authorization and page coverage');
