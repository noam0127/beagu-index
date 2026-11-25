import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import assert from 'node:assert/strict';

const read=path=>readFileSync(path,'utf8');
const xp=read('js/challenge-progress-v1.js');
const telemetry=read('js/search-telemetry-v1.js');
assert.doesNotThrow(()=>new Script(xp));
assert.doesNotThrow(()=>new Script(telemetry));
const xpScope={
 window:{},
 document:{readyState:'loading',addEventListener:()=>{},querySelectorAll:()=>[]}
};
runInNewContext(xp,xpScope);
const progress=xpScope.window.BeaguChallengeProgress;
assert.equal(progress.GOAL,1000);
assert.match(xp,/beagu_get_challenge_progress/,'XP must use the live database RPC');
assert.match(xp,/event\.persisted/,'XP must refresh after back-forward cache restore');
function target(){
 const controls=new Map();
 for(const k of ['number','remainder','progress','state']){
  controls.set(k,{textContent:'순번 확인 중',style:{},attributes:{},
   setAttribute(a,v){this.attributes[a]=v;},
   removeAttribute(a){delete this.attributes[a];}});
 }
 return {dataset:{},querySelector:s=>controls.get(s.match(/data-xp-(.*?)\]/)?.[1]),controls};
}
let a=target();
assert.equal(progress.render(a,999),true);
assert.equal(a.controls.get('remainder').textContent,'1명 남음');
assert.equal(a.controls.get('progress').style.width,'99.9%');
assert.equal(a.controls.get('progress').attributes['aria-valuenow'],'999');
a=target();progress.render(a,1000);
assert.equal(a.controls.get('progress').style.width,'100.0%');
assert.equal(a.controls.get('remainder').textContent,'목표 달성');
a=target();progress.render(a,1001);
assert.equal(a.controls.get('number').textContent,'1,001 / 1,000');
assert.equal(a.controls.get('progress').style.width,'100.0%');
assert.equal(a.controls.get('progress').attributes['aria-valuenow'],'1000');
a=target();progress.unavailable(a);
assert.equal(a.controls.get('number').textContent,'집계 확인 불가');
assert.notEqual(a.controls.get('number').textContent,'0 / 1000');
assert.equal(a.controls.get('progress').attributes['aria-valuenow'],undefined);
assert.equal(progress.render(a,NaN),false);
assert.notEqual(a.dataset.xpState,'ready');

const calls=[];let index=0;
const context={
 window:{beaguVisitor:'11111111-1111-4111-8111-111111111111'},
 crypto:{randomUUID:()=> '22222222-2222-4222-8222-'+(++index).toString().padStart(12,'0')},
 supabaseClient:{rpc:(name,args)=>{calls.push({name,args});return Promise.resolve({data:true,error:null});}},
 console:{warn:()=>{}}
};
runInNewContext(telemetry,context);
const t=context.window.BeaguSearchTelemetry;
assert.equal(t.selected('1234567',1,'search-lv1',{isTrusted:false}),null);
assert.equal(t.selected('badid',1,'search-lv1',{isTrusted:true}),null);
assert.equal(t.selected('1234567',2,'search-lv1',{isTrusted:true}),null);
assert.equal(calls.length,0,'Auto click and untrusted IDs cannot log');
const action=t.selected('1234567',1,'search-lv1',{isTrusted:true});
assert.ok(action);
assert.equal(calls.length,1);
assert.equal(calls[0].args.p_event_type,'school_selected');
assert.equal(calls[0].args.p_school_id,'1234567');
assert.equal(calls[0].args.p_viewer_level,1);
assert.equal(calls[0].args.p_source_page,'search-lv1');
assert.equal(calls[0].args.p_action_id,action);
assert.equal(t.detailViewed('1234567',1,'search-lv1',action),null===action?null:action);
assert.equal(calls.length,2);
assert.equal(calls[1].args.p_action_id,action,'Pair selection and successfully viewed detail by action ID');
assert.equal(calls[1].args.p_event_type,'detail_viewed');
assert.equal(t.detailViewed('1234567',1,'search-lv1',action),null,'Single view per page');
assert.equal(t.selected('1234567',1,'search-lv1',{isTrusted:true}),null,'Rapid duplicate suppressed');
assert.equal(calls.length,2);
assert.ok(t.searchConfirmed('9876543',0,'search'));
assert.equal(calls.length,3);
assert.equal(calls[2].args.p_event_type,'search_confirmed');
assert.ok(t.detailViewed('9876543',0,'school-report'));
assert.equal(calls.length,4);
assert.equal(calls[3].args.p_source_page,'school-report');
assert.ok(!JSON.stringify(calls).includes('검색어'));
assert.doesNotMatch(telemetry,/p_(?:query|password|ip|code|name)/i);
assert.doesNotMatch(telemetry,/service_role/);
assert.doesNotMatch(xp,/beagu_join_challenge|Google\s*Forms\s*API|random\(\)/,'Never create extra ordinal or fake XP');

const home=read('index.html'),challenge=read('challenge.html');
for(const html of [home,challenge]){
 assert.match(html,/2026 챌린지 · 목표 1,000명/);
 assert.doesNotMatch(html,/1,000명 달성 시 2026 배구지수 자료를 공개합니다/);
 assert.doesNotMatch(html,/2026 챌린지 XP · 목표 1,000명/);
 assert.match(html,/js\/challenge-progress-v1\.js\?v=20261117-[a-z0-9-]+/);
 assert.match(html,/data-beagu-xp/);
 assert.match(html,/styles\/challenge-progress-v1\.css/);
 assert.match(html,/js\/challenge-progress-v1\.js/);
 assert.match(html,/data-xp-progress/);
}
assert.ok(challenge.indexOf('data-beagu-xp')>challenge.indexOf('id="certificate"'),
 'XP should not alter the printable personal certificate');
assert.match(read('js/challenge.js'),/beagu-challenge-identity/,'Issue codes through the session-verified API');
assert.doesNotMatch(read('js/challenge.js'),/supabaseClient\.rpc\('beagu_join_challenge'/,
 'No browser-direct ordinal issuance');
assert.match(read('js/challenge.js'),/X-Beagu-Session/,'Require the existing Level 1 session');
assert.match(read('js/challenge.js'),/identityCode\.textContent = code/,'Show the issued unique code');
const codePattern = /^(?:BG26-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}|BG26-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{10})$/;
assert.equal(codePattern.test('BG26-ABCD-1234-ABCD-1234-ABCD'),true,'Legacy identifiers remain valid');
assert.equal(codePattern.test('BG26-K7M9Q2-X4T8W3'),true,'Previous 12-symbol identifiers remain valid');
assert.equal(codePattern.test('K7M9Q2X4T8'),true,'New 10-symbol format accepted');
assert.equal(codePattern.test('K7M9Q2X4T0'),false,'Avoid 0 in new format');
assert.equal(codePattern.test('K7M9Q2X4T8W'),false,'Avoid unrecognized length');
assert.equal(codePattern.test('BG26-K7M9Q2-X4T8W0'),false,'Ambiguous characters are not permitted for new identifiers');
assert.equal(codePattern.test('BG26-K7M9Q2-X4T8W3-TEST'),false,'Wrong suffix is rejected');
assert.ok(read('js/challenge.js').includes('[A-HJ-NP-Z2-9]{10}'),
 'Client validates new 10-character format');
assert.ok(read('supabase/functions/beagu-challenge-identity/index.ts').includes('[A-HJ-NP-Z2-9]{10}'),
 'Edge function validates new 10-character format');

assert.ok(challenge.indexOf('id="identityCode"') > challenge.indexOf('</section>',challenge.indexOf('id="certificate"')),
 'Identity code must be outside the image capture root');
assert.match(challenge,/data-html2canvas-ignore="true"/,'Private code should never render in generated certificate');
assert.ok(challenge.includes('id="challengeReferralTag"') &&
 read('js/challenge-referral-v1.js').includes("'Lv.2 참여코드(비활성)'"),
 'Private identity code remains marked for private keeping until earned Lv2');
assert.ok(challenge.indexOf('id="challengeAccessCode"')<challenge.indexOf('id="challengeProtected"'),'Level 1 entry uses a separate field from the identity code');
assert.match(read('js/challenge.js'),/BeaguChallengeProgress\.refresh/);
assert.match(read('js/visit-stats.js'),/beagu-telemetry-v2/,'Preserve preexisting visit accounting via Edge');
assert.match(read('js/visit-stats.js'),/sessionStorage/,'Browser session fallback');
assert.match(read('js/visit-stats.js'),/body:\{action:'visit',visitor,event,page\}/,'Reuse one event for retries');
assert.match(read('js/visit-stats.js'),/Number.isSafeInteger/,'Do not invent visit totals');
assert.match(read('js/challenge.js'),/participantNo\.textContent = '순번 조회 실패'/,'Show a retryable ordinal error');
assert.doesNotMatch(home,/방문한 선생님/);
for(const period of ['today','month','total'])assert.ok(home.includes('data-stat="'+period+'"'),'Preserve real visitor counter '+period);
assert.doesNotMatch(read('index.html'),/자료 공개 기준/);
assert.doesNotMatch(read('index.html'),/class="data-access-link" href="challenge\.html"/,'No standalone home challenge CTA');

for(const page of ['search.html','search-lv1.html','school-report.html']){
 const html=read(page);
 assert.match(html,/js\/search-telemetry-v1\.js\?v=20261120-[a-z0-9-]+/);
}
const publicSearch=read('search.html');
const lv1=read('js/level-search.js'),lv2=read('js/lv2-edited-search.js');
for(const source of [publicSearch,lv1,lv2]){
 assert.match(source,/explicitEnter/);
 assert.match(source,/searchConfirmed/);
 assert.match(source,/addEventListener\('keydown'/);
 assert.match(source,/\.selected\(/);
}
assert.match(publicSearch,/count===1&&list\.length===1/);
assert.match(publicSearch,/id="searchInput"/,'Lv.0 public search restored');
assert.match(lv1,/if\(action\)window\.BeaguSearchTelemetry\?\.detailViewed/);
assert.match(lv2,/if\(loaded&&action\)window\.BeaguSearchTelemetry\?\.detailViewed/);
assert.match(lv1,/showDetails\(detail,\s*data\.rows,\s*school,\s*data\.schoolQuestionModes,\s*data\.schoolQuestionSelections,\s*data\.schoolQuestionResults2026,\s*Number\(data\.level\)\)/,'Approved school question results must reach the detail with the server-verified tier');
assert.match(lv2,/loaded=await showDetail\(detail,s\)/);
assert.match(read('school-report.html'),/if\(!state\.demo\)\{[^}]*window\.BeaguSearchTelemetry\?\.detailViewed/);
assert.doesNotMatch(publicSearch,/school-mbti-v1\.js/,'No Lv1 MBTI in Lv0');
const sql=read('supabase/08_xp_search_install.sql');
assert.match(sql,/max\(p\.participant_no\)/);
assert.match(sql,/ALTER TABLE public\.school_search_events ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/REVOKE ALL ON public\.school_search_events FROM PUBLIC,anon,authenticated/);
assert.match(sql,/UNIQUE\(action_id,event_type\)/);
assert.match(sql,/SET search_path (?:=|TO) ''/);
assert.match(sql,/school_search_limits/);
assert.match(sql,/school-report/);
assert.doesNotMatch(sql,/GRANT\s+SELECT\s+ON\s+public\.school_search_events\s+TO\s+anon/i);
for(const file of ['search.html','school-report.html','index.html','challenge.html']){
 const html=read(file);
 for(const block of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)){
  const opening=block[0].slice(0,block[0].indexOf('>')+1);
  if(/type=["']application\/json["']/.test(opening))continue;
  if(block[1].trim())assert.doesNotThrow(()=>new Script(block[1]),file+' has invalid inline script');
 }
}
// The homepage must show real numeric visit totals returned by the RPC.
const visitSource=read('js/visit-stats.js');
assert.doesNotThrow(()=>new Script(visitSource));
const counts=['today','month','total'].map(stat=>({dataset:{stat},textContent:'집계 중'}));
const storedVisitor='11111111-1111-4111-8111-111111111111';
const visitCalls=[];
const visitScope={
 window:{setTimeout:()=>0,setInterval:()=>0},
 document:{querySelectorAll:()=>counts,addEventListener:()=>{},visibilityState:'visible'},
 localStorage:{getItem:()=>storedVisitor,setItem:()=>{}},
 sessionStorage:{getItem:()=>null,setItem:()=>{}},
 crypto:{randomUUID:()=> '22222222-2222-4222-8222-222222222222'},
 location:{pathname:'/'},
 supabaseClient:{functions:{invoke:async(name,{body})=>{
  visitCalls.push({name,args:body});
  return {data:{today:'7',month:91,total:'1000'},error:null};
 }}}
};
runInNewContext(visitSource,visitScope);
await visitScope.window.beaguVisitReady;
assert.equal(visitScope.window.beaguVisitor,storedVisitor);
assert.equal(visitCalls.length,1);
assert.equal(visitCalls[0].name,'beagu-telemetry-v2');
assert.equal(visitCalls[0].args.page,'index');
assert.equal(counts[0].textContent,'7');
assert.equal(counts[1].textContent,'91');
assert.equal(counts[2].textContent,'1,000');


// The challenge certificate must be inaccessible before a server-confirmed Level 1 session.
const challengeGate=read('js/challenge-access-v1.js');
const challengeLogic=read('js/challenge.js');
assert.doesNotThrow(()=>new Script(challengeGate));
assert.doesNotThrow(()=>new Script(challengeLogic));
assert.match(challenge,/id="challengeAccessPanel"/);
assert.match(challenge,/id="challengeAccessForm"[^>]*hidden/);
assert.match(challenge,/id="challengeProtected" hidden/);
assert.ok(challenge.indexOf('id="challengeProtected"')<challenge.indexOf('id="certificate"'));
assert.match(challenge,/js\/challenge-access-v1\.js/);
assert.match(challenge,/styles\/challenge-access-v1\.css/);
assert.match(challenge,/styles\/beagu-auth-unified-v1\.css/,'Challenge uses same shared form styles');
assert.match(challenge,/id="challengeAccessForm" class="beagu-auth-form"/);
assert.match(challenge,/id="challengeAccessToggle" class="beagu-auth-toggle"/);
assert.match(challenge,/class="challenge-access-submit beagu-auth-submit"/);
assert.match(challenge,/class="beagu-auth-field"/);
assert.match(challenge,/class="beagu-auth-input-wrap"/);
assert.match(challenge,/class="challenge-access-feedback beagu-auth-message"/);
assert.match(challenge,/class="challenge-access-help beagu-auth-help"/);
assert.match(challengeLogic,/beagu:challenge-access-granted/);
assert.match(challengeLogic,/beagu:challenge-access-revoked/);
assert.doesNotMatch(challengeLogic,/^\s*prepare\(\);\s*$/m,'Do not join public challenge without Lv1');
assert.match(challengeGate,/api\('verify',\{\},token\)/,'Validate saved sessions on server');
assert.match(challengeGate,/Number\.isInteger\(level\)&&level>=1/,'Level 0 is insufficient');

const gateElements=Object.fromEntries([
  'challengeAccessPanel','challengeAccessForm','challengeAccessCode',
  'challengeAccessSubmit','challengeAccessFeedback','challengeProtected','challengeLogout',
  'challengeAccessBadge','challengeAccessToggle'
].map(id=>[id,{hidden:id==='challengeProtected'||id==='challengeAccessForm',
  disabled:false,value:'',type:id==='challengeAccessCode'?'password':'',textContent:'',
  attributes:{},className:'',listeners:{},
  classList:{toggle(_name,_flag){}},
  setAttribute(name,value){this.attributes[name]=value;},
  addEventListener(type,fn){this.listeners[type]=fn;}}]));
const gateEvents=[];
let returnedLevel=0;
const gateFetchCalls=[];
let storedGateToken='';
const gateWindow={
  addEventListener(){},
  dispatchEvent(event){gateEvents.push(event.type);}
};
runInNewContext(challengeGate,{
  SUPABASE_URL:'https://example.supabase.co',
  document:{getElementById:id=>gateElements[id]},
  window:gateWindow,
  Event:class{constructor(type){this.type=type;}},
  sessionStorage:{
    getItem(){return storedGateToken;},
    setItem(key,value){assert.equal(key,'beagu-level-session-v1');storedGateToken=value;},
    removeItem(){storedGateToken='';}
  },
  fetch:async(_url,options)=>{
    const payload=JSON.parse(options.body);
    gateFetchCalls.push(payload);
    return {ok:true,status:200,json:async()=>payload.action==='login'
      ? {level:returnedLevel,token:'f'.repeat(64)}
      : {level:returnedLevel}};
  }
});
assert.equal(gateElements.challengeProtected.hidden,true,'Anonymous certificate remains hidden');
assert.equal(gateElements.challengeAccessForm.hidden,false,'Anonymous users see login form');
assert.equal(gateElements.challengeAccessBadge.textContent,'Lv.0 · 미인증','Same badge as search and comparison');
assert.equal(gateElements.challengeAccessCode.type,'password');
gateElements.challengeAccessCode.value='samplecode';
gateElements.challengeAccessToggle.listeners.click();
assert.equal(gateElements.challengeAccessCode.type,'text','Show code toggle works');
assert.equal(gateElements.challengeAccessToggle.attributes['aria-pressed'],'true');
gateElements.challengeAccessToggle.listeners.click();
assert.equal(gateElements.challengeAccessCode.type,'password','Hide code toggle works');
await gateElements.challengeAccessForm.listeners.submit({preventDefault(){}});
assert.equal(gateElements.challengeProtected.hidden,true,'Level 0 cannot enter');
assert.equal(storedGateToken,'','Do not cache Level 0 token');
returnedLevel=1;
gateElements.challengeAccessCode.value='samplecode';
await gateElements.challengeAccessForm.listeners.submit({preventDefault(){}});
assert.equal(gateElements.challengeProtected.hidden,false,'Level 1 can enter');
assert.equal(gateElements.challengeAccessPanel.hidden,false,
 'Level 1 keeps the same status panel visible after login');
assert.equal(gateElements.challengeLogout.hidden,false,'Logout remains in the common card');
assert.equal(gateElements.challengeAccessBadge.textContent,'Lv.1 인증 완료','Verified Lv1 badge is updated');
assert.equal(gateElements.challengeAccessPanel.attributes['data-auth-level'],'1','Shared signed-in state styles');
assert.equal(gateElements.challengeAccessToggle.attributes['aria-pressed'],'false','Reveal is cleared after authentication');
assert.equal(storedGateToken,'f'.repeat(64),'Share verified session with search');
assert.ok(gateEvents.includes('beagu:challenge-access-granted'),'Only verified access signals certificate generator');
assert.equal(gateFetchCalls.filter(x=>x.action==='login').length,2);
await gateElements.challengeLogout.listeners.click();
assert.equal(gateElements.challengeAccessBadge.textContent,'Lv.0 · 미인증','Logout resets common badge');
assert.equal(gateElements.challengeAccessForm.hidden,false,'Logout restores input form');
assert.equal(gateElements.challengeProtected.hidden,true,'Logout hides participation certificate');
assert.equal(storedGateToken,'','Logout forgets the Lv1 session');

console.log('PASS: existing participant ordinal only, 999/1000/1001, error≠0, intentional school events, privacy and original permissions');
