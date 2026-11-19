(() => {
'use strict';
const PROD='snvzwrexuqavnfvzgxqj';
const cfg=window.BEAGU_STAGE_CONFIG||{};
const $=id=>document.getElementById(id);
const validToken=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
const q=new URLSearchParams(location.search);
const incoming=q.get('ref');
const invite=validToken(incoming)?incoming:null;
if(incoming){history.replaceState(null,'',location.pathname);}
let access='',refresh='',user='',level=0,notice=false;
let captchaToken='',turnstileId=null;
let deviceProof='';
try{
 const key='beagu-test-device-v1';
 deviceProof=localStorage.getItem(key)||'';
 if(!validToken(deviceProof)){
  const random=crypto.getRandomValues(new Uint8Array(32));
  deviceProof=btoa(String.fromCharCode(...random)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
  localStorage.setItem(key,deviceProof);
 }
}catch(_){deviceProof='';}
let proof='';
try{proof=sessionStorage.getItem('beagu-test-level1-proof')||'';}catch(_){}
const isReady=()=>{
 try {
  const u=new URL(cfg.endpoint);
  return cfg.enabled===true && typeof cfg.projectRef==='string'
    && /^[a-z]{20}$/.test(cfg.projectRef) && cfg.projectRef!==PROD
    && u.origin==='https://'+cfg.projectRef+'.supabase.co'
    && u.pathname==='/functions/v1/beagu-test-v1'
    && cfg.siteOrigin===location.origin
    && location.origin!=='https://baeguindex.com'
    && location.origin!=='https://www.baeguindex.com';
 }catch(_){return false;}
};
function message(id,text,bad=false){
 const el=$(id);el.textContent=text;el.classList.toggle('error',bad);
}
function show(id,on){$(id).hidden=!on;}
function errorText(e){return e instanceof Error?e.message:'요청 오류';}
async function api(action,body={},authRequired=false){
 if(!isReady())throw Error('테스트 Supabase가 아직 연결되지 않았습니다.');
 if(authRequired&&!access)throw Error('테스트 계정으로 로그인해야 합니다.');
 const res=await fetch(cfg.endpoint,{method:'POST',cache:'no-store',
  credentials:'omit',referrerPolicy:'no-referrer',
  headers:{'Content-Type':'application/json',
   ...(authRequired?{'Authorization':'Bearer '+access}:{})},
  body:JSON.stringify({action,...body})
 });
 const obj=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(obj.error||'HTTP_'+res.status);
 return obj;
}
function takeSession(r){
 access=r.accessToken||'';refresh=r.refreshToken||'';
 user=r.username||'';level=Number(r.level)||0;
 notice=r.upgradeUnseen===true;
 refreshView();
 if(notice)show('notice',true);
}
async function validateMe(){
 if(!access)return;
 const p=await api('me',{},true);
 user=p.username||'';level=Number(p.level)||0;
 notice=p.upgradeUnseen===true;
 refreshView();
 if(notice)show('notice',true);
}
async function claimProof(){
 if(!access||!validToken(proof))return;
 const r=await api('claim-level1',{proof},true);
 level=Number(r.level)||level;
 proof='';
 try{sessionStorage.removeItem('beagu-test-level1-proof');}catch(_){}
}
function refreshView(){
 $('levelBadge').textContent='Lv.'+level+' · '+(access?'로그인 '+(user||'등록 중'):'비로그인');
 show('logout',!!access);show('openLogin',!access);show('openSignup',!access);
 show('goDelete',!!access);
 if(level>=2&&access){
  show('levelOnePanel',false);show('levelTwoPanel',false);show('levelComplete',true);
 }else if(level>=1){
  show('levelOnePanel',false);show('levelTwoPanel',true);show('levelComplete',false);
  $('referralHelp').textContent=access
   ?'이 계정만의 고유 설문 링크를 발급합니다. 다른 계정이 설문을 제출하면 서버가 자동 승급합니다.'
   :'레벨1 인증은 유지됩니다. 전용 링크 발급은 이메일 인증을 마친 계정으로 로그인해야 합니다.';
  $('doReferral').disabled=!access;
 }else{
  show('levelOnePanel',true);show('levelTwoPanel',false);show('levelComplete',false);
 }
 show('surveyInvite',!!invite);
 $('doSurvey').disabled=!access;
 if(invite&&!access)message('surveyStatus','설문을 제출할 다른 테스트 계정으로 가입·로그인해 주세요.');
}
function accountMode(mode){
 const view={signup:'회원가입',login:'로그인',bootstrap:'이메일 확인 뒤 등록',
  recovery:'비밀번호 재설정 메일',delete:'회원 탈퇴'};
 $('accountTitle').textContent=view[mode]||'로그인';
 for(const name of ['signup','login','bootstrap','recovery','delete'])
  show(name+'Form',mode===name);
 show('accountPanel',true);
 show('captchaBox',true);
 message('accountStatus','');
 if(isReady())initCaptcha();
}
async function initCaptcha(){
 if(!cfg.turnstileSiteKey||turnstileId!==null)return;
 try{
  if(!window.turnstile){
   await new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload=resolve;script.onerror=reject;document.head.appendChild(script);
   });
  }
  turnstileId=window.turnstile.render('#turnstile',{sitekey:cfg.turnstileSiteKey,
    callback:token=>{captchaToken=token;},
    'expired-callback':()=>{captchaToken='';},
    'error-callback':()=>{captchaToken='';}
  });
 }catch(_){message('accountStatus','CAPTCHA 위젯을 불러올 수 없습니다.',true);}
}
function resetCaptcha(){
 captchaToken='';
 try{if(turnstileId!==null)window.turnstile.reset(turnstileId);}catch(_){}
}
async function busy(button,task,id='accountStatus'){
 button.disabled=true;
 try{await task();}
 catch(e){message(id,errorText(e),true);}
 finally{button.disabled=false;resetCaptcha();}
}
$('connection').textContent=isReady()?'독립 Supabase 연결 설정됨 · 실사용 검증 필요':'연결 대기 · 현재 모의 검증만 가능';
message('globalStatus',isReady()?'TEST 전용 설정이 확인되었습니다. 실제 인증 성공 여부는 서버 응답으로 확인합니다.':'운영 서버 요청 차단됨. 테스트 프로젝트 및 CAPTCHA 설정 전에는 실제 가입이 진행되지 않습니다.');
$('openLogin').onclick=()=>accountMode('login');
$('openSignup').onclick=()=>accountMode('signup');
$('closeAccount').onclick=()=>show('accountPanel',false);
$('goBootstrap').onclick=()=>accountMode('bootstrap');
$('goRecovery').onclick=()=>accountMode('recovery');
$('goDelete').onclick=()=>accountMode('delete');
$('openUpgrade').onclick=()=>{show('upgradePanel',true);refreshView();};
$('closeUpgrade').onclick=()=>show('upgradePanel',false);
$('doSignup').onclick=()=>busy($('doSignup'),async()=>{
 const result=await api('signup',{username:$('regName').value,
  email:$('regEmail').value,password:$('regPass').value,captchaToken});
 if(result.confirmationRequired)message('accountStatus','가입 요청을 접수했습니다. 이메일을 확인한 뒤 아이디를 확정하세요.');
});
$('doLogin').onclick=()=>busy($('doLogin'),async()=>{
 const result=await api('login',{username:$('loginName').value,
  password:$('loginPass').value,captchaToken});
 takeSession(result);await claimProof();await validateMe();
 show('accountPanel',false);message('globalStatus','서버 인증 성공. Lv.'+level+' 계정으로 로그인했습니다.');
});
$('doBootstrap').onclick=()=>busy($('doBootstrap'),async()=>{
 const result=await api('bootstrap',{email:$('bootstrapEmail').value,
  password:$('bootstrapPass').value,captchaToken});
 takeSession(result);
 const created=await api('register',{username:$('bootstrapName').value,deviceProof},true);
 user=created.username||'';await claimProof();await validateMe();
 show('accountPanel',false);message('globalStatus','이메일 확인 계정 등록 완료. 현재 Lv.'+level);
});
$('doRecovery').onclick=()=>busy($('doRecovery'),async()=>{
 await api('recovery-request',{email:$('recoveryEmail').value,captchaToken});
 message('accountStatus','등록된 주소라면 재설정 메일이 발송됩니다.');
});
$('doDelete').onclick=()=>busy($('doDelete'),async()=>{
 const done=await api('delete',{password:$('deletePassword').value,
  confirm:$('deleteConfirm').value,captchaToken},true);
 if(done.deleted){access='';refresh='';user='';level=0;notice=false;
  refreshView();show('accountPanel',false);message('globalStatus','테스트 계정을 삭제했습니다.');}
});
$('logout').onclick=()=>busy($('logout'),async()=>{
 try{await api('logout',{},true);}finally{
  access='';refresh='';user='';level=validToken(proof)?1:0;notice=false;
  refreshView();show('notice',false);
  message('globalStatus','로그아웃했습니다. 서버 계정 레벨은 유지됩니다.');
 }
},'globalStatus');
$('doLevel1').onclick=()=>busy($('doLevel1'),async()=>{
 const r=await api('level1',{code:$('commonCode').value},!!access);
 if(!access&&r.proof){
  proof=r.proof;try{sessionStorage.setItem('beagu-test-level1-proof',proof);}catch(_){}
 }
 level=Number(r.level)||1;refreshView();
 message('upgradeStatus',access?'서버 계정 Lv.1 승급 완료':'30분 동안 유효한 서버 검증 증명 보유. 가입 후 자동 귀속합니다.');
},'upgradeStatus');
$('doReferral').onclick=()=>busy($('doReferral'),async()=>{
 const r=await api('referral',{},true);
 if(!validToken(r.referralToken))throw Error('잘못된 추천 토큰');
 const link=location.origin+location.pathname+'?ref='+encodeURIComponent(r.referralToken);
 $('referralUrl').value=link;show('referralUrl',true);show('referralLabel',true);show('shareTools',true);
 message('upgradeStatus','전용 설문 링크가 발급되었습니다. 다른 테스트 계정으로 참여해 주세요.');
},'upgradeStatus');
$('copyReferral').onclick=()=>busy($('copyReferral'),async()=>{
 await navigator.clipboard.writeText($('referralUrl').value);
 message('upgradeStatus','링크를 복사했습니다.');
},'upgradeStatus');
$('shareReferral').onclick=()=>busy($('shareReferral'),async()=>{
 if(navigator.share)await navigator.share({title:'가상 설문 링크',url:$('referralUrl').value});
 else await navigator.clipboard.writeText($('referralUrl').value);
},'upgradeStatus');
$('doSurvey').onclick=()=>busy($('doSurvey'),async()=>{
 if(!invite)throw Error('추천 링크가 없습니다.');
 const r=await api('survey-submit',{referralToken:invite},true);
 message('surveyStatus',r.credited?'가상 설문 제출 승인. 추천인 계정을 Lv.2로 승급했습니다.':'승급 미적립: '+(r.reason||'중복/자기추천'));
},'surveyStatus');
$('ackNotice').onclick=()=>busy($('ackNotice'),async()=>{
 await api('ack-upgrade',{},true);show('notice',false);notice=false;
},'globalStatus');
$('doSearch').onclick=()=>busy($('doSearch'),async()=>{
 const query=$('schoolQuery').value.trim();
 const schools=level>=2&&access?(await api('schools',{},true)).schools:[
  {name:'가상별빛초등학교',region:'부산'},
  {name:'가상새싹초등학교',region:'강원'},
  {name:'가상바람초등학교',region:'서울'}
 ];
 const matches=schools.filter(x=>!query||x.name.includes(query));
 const parent=$('schools');parent.replaceChildren();
 if(!matches.length){parent.textContent='해당 이름의 가상 학교가 없습니다.';return;}
 for(const school of matches){
  const row=document.createElement('div');row.className='school';
  const left=document.createElement('div');
  const name=document.createElement('strong');name.textContent=school.name;
  const meta=document.createElement('span');meta.textContent=school.region+' · 테스트 자료';
  left.append(name,meta);row.append(left);
  const b=document.createElement('strong');
  b.textContent=level>=2&&access?String(school.score)+'점':'Lv.2 상세 잠금';
  row.append(b);parent.append(row);
 }
},'globalStatus');
$('runDemo').onclick=()=>{
 const demo={alice:{level:0},bob:{level:0},tokens:new Set(),events:new Set()};
 demo.alice.level=1;
 const ref='simulated-one-time-referral-A';
 demo.tokens.add(ref);
 const distinct=demo.alice!==demo.bob;
 const inserted=distinct&&!demo.events.has('bob-survey')&&demo.tokens.has(ref);
 if(inserted){demo.events.add('bob-survey');demo.alice.level=2;}
 const duplicate=!demo.events.has('bob-survey')?false:false;
 $('demoOutput').textContent=[
  '[모의 검증 — 실제 인증/DB가 아닙니다]',
  '1. 가상 계정 A 회원가입 → Lv.0',
  '2. 서버가 공통번호를 검증했다고 가정 → A Lv.1',
  '3. A 전용 추천 링크 생성',
  '4. 별도 가상 계정 B 생성 → B Lv.0',
  '5. B 가상 설문 1건 → '+(inserted?'적립':'거부'),
  '6. A 재로그인 가정 → Lv.'+demo.alice.level,
  '7. 동일 이벤트 재시도 → '+(duplicate?'중복 허용 오류':'중복 거부'),
  '⚠ 네트워크·이메일·CAPTCHA·실제 SQL 검증은 수행하지 않았습니다.'
 ].join('\n');
 show('demoOutput',true);
};
refreshView();
})();