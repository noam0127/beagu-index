/* One reusable Lv1/Lv2 participation-code control on every public page.
 * Server is authoritative: client-side levels never authorize protected data.
 * No account, social provider login, or higher-tier control is introduced here. */
(() => {
 'use strict';
 try { if(window.self !== window.top) return; } catch (_) { return; }
 const KEY='beagu-level-session-v1';
 const ENDPOINT='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api';
 const survey='https://forms.gle/TPyCakK6Sj2zchRy7';
 const badge=document.getElementById('beaguLevelState');
 if(!badge)return;
 let busy=false,expiresAt='',lastFocus=null,lastLevel=0;
 const el=(tag,cls,text)=>{
  const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;
 };
 const modal=el('div','beagu-participation-overlay');
 modal.id='beaguParticipationOverlay';
 modal.hidden=true;
 modal.setAttribute('role','presentation');
 modal.innerHTML=`
 <section class="beagu-participation-dialog" role="dialog" aria-modal="true"
   aria-labelledby="beaguParticipationTitle" aria-describedby="beaguParticipationDescription">
  <button class="beagu-participation-close" type="button" data-beagu-close aria-label="닫기">×</button>
  <div class="beagu-participation-eyebrow">BAEGU INDEX · PARTICIPATION</div>
  <h2 id="beaguParticipationTitle">참여코드 입력</h2>
  <p id="beaguParticipationDescription">발급받은 참여코드를 입력하면 이용 가능한 학교정보가 열립니다.</p>
  <div id="beaguParticipationDetail" class="beagu-participation-detail" hidden>
   <strong id="beaguParticipationTier"></strong>
   <span id="beaguParticipationExpiry"></span>
   <button type="button" id="beaguParticipationLogout">인증 해제</button>
  </div>
  <form id="beaguParticipationForm" autocomplete="off">
   <label id="beaguParticipationCodeLabel" for="beaguParticipationCode">참여코드</label>
   <div class="beagu-participation-field">
    <input id="beaguParticipationCode" type="password" minlength="8" maxlength="120"
       placeholder="참여코드를 입력하세요" autocomplete="off" autocapitalize="off"
       spellcheck="false" required>
    <button type="button" id="beaguParticipationToggle" aria-pressed="false">표시</button>
   </div>
   <button type="submit" id="beaguParticipationSubmit">레벨1 인증</button>
  </form>
  <p id="beaguParticipationMessage" role="status" aria-live="polite"></p>
  <nav class="beagu-participation-links" aria-label="참여 및 승급">
   <a href="${survey}" target="_blank" rel="noopener noreferrer">참여코드 받기 — 2026 본조사</a>
   <a href="challenge.html">Lv2 달성하기 — 챌린지</a>
   <a href="account.html">나의 계정 — 가입·로그인</a>
  </nav>
 </section>`;
 document.body.append(modal);
 const heading=modal.querySelector('#beaguParticipationTitle');
 const description=modal.querySelector('#beaguParticipationDescription');
 const label=modal.querySelector('#beaguParticipationCodeLabel');
 const form=modal.querySelector('#beaguParticipationForm');
 const code=modal.querySelector('#beaguParticipationCode');
 const submit=modal.querySelector('#beaguParticipationSubmit');
 const message=modal.querySelector('#beaguParticipationMessage');
 const detail=modal.querySelector('#beaguParticipationDetail');
 const tierText=modal.querySelector('#beaguParticipationTier');
 const expiryText=modal.querySelector('#beaguParticipationExpiry');
 const toggle=modal.querySelector('#beaguParticipationToggle');
 const closeButton=modal.querySelector('[data-beagu-close]');
 const logout=modal.querySelector('#beaguParticipationLogout');
 const hosts=[...document.querySelectorAll('#lv1QuickAuth,#loginPanel,#compareLv1AuthPanel,#challengeAccessPanel')];
 const gameForms=[...document.querySelectorAll('[data-game-lv1-form],#tierCodeForm')];
 const labelFor=n=>n>=2?'♛ Lv2 · 챌린지 달성':n>=1?'✓ Lv1 · 설문 참여 완료':'참여코드 입력';
 function stored(){try{return sessionStorage.getItem(KEY)||''}catch(_){return ''}}
 function paint(level){
  lastLevel=level;
  const text=labelFor(level);
  badge.textContent='Lv.'+level;
  badge.setAttribute('aria-label',level===1?'Lv.1 인증 완료 · Lv.2 참여코드 입력':level?'인증 정보 및 해제 · '+text:'참여코드 입력');
  badge.title=level===1?'Lv.2 참여코드 입력 또는 인증 해제':level?'인증 정보 확인 및 인증 해제':'참여코드 입력';
  badge.classList.toggle('beagu-participation-earned',level>=2);
  for(const host of hosts){
   host.dataset.beaguParticipationLevel=String(level);
   const action=host.querySelector('[data-beagu-participation-trigger]');
   const state=host.querySelector('[data-beagu-participation-status]');
   const description=host.querySelector('[data-beagu-participation-description]');
   if(action)action.hidden=level>=1;
   if(description)description.hidden=level>=1;
   if(state){
    const stateText=level===1?text+' · Lv.2 참여코드 입력':text;
    state.textContent=stateText;
    state.setAttribute('aria-label',stateText);
    state.hidden=level<1;
   }
   // Keep the challenge screen participation-code-only at all levels.
   if(host.id==='challengeAccessPanel'){
    const heading=host.querySelector('h1,h2');
    if(heading)heading.textContent=level>=2?'Lv2 참여 인증 완료':'참여코드 입력';
   }
  }
  for(const item of document.querySelectorAll('[data-beagu-participation-game-trigger]'))
   item.hidden=level>=1;
  detail.hidden=level<1;
  // Lv.1 must retain a code field so an earned Lv.2 code can upgrade in place.
  form.hidden=level>=2;
  heading.textContent=level===1?'레벨2에 도전하세요!':level>=2?'참여 인증 정보':'참여코드 입력';
  description.textContent=level===1?'Lv.2 참여코드를 입력하면 공시가격 등 더 많은 학교정보를 확인할 수 있습니다. 기존 Lv.1 인증은 유지됩니다.':
   level>=2?'Lv.2 인증이 완료되었습니다.':'발급받은 참여코드를 입력하면 이용 가능한 학교정보가 열립니다.';
  label.textContent=level===1?'Lv.2 참여코드':'참여코드';
  code.placeholder=level===1?'Lv.2 참여코드를 입력하세요':'참여코드를 입력하세요';
  submit.textContent=level===1?'Lv.2 인증하기':'레벨1 인증';
  if(level>=1){
   tierText.textContent=text;
   expiryText.textContent=expiresAt?
     '인증 만료: '+new Date(expiresAt).toLocaleString('ko-KR'):'현재 세션의 인증 정보';
  }
 }
 function close(){
  if(window.dispatchEvent(new Event('beagu:participation-before-close',{cancelable:true}))===false)return;
  modal.hidden=true;
  document.body.classList.remove('beagu-participation-open');
  message.textContent='';
  code.value='';code.type='password';toggle.textContent='표시';toggle.setAttribute('aria-pressed','false');
  lastFocus?.focus?.();
  window.dispatchEvent(new Event('beagu:participation-dialog-closed'));
 }
 function open(){
  lastFocus=document.activeElement;
  const n=Number(badge.dataset.level);
  paint(Number.isInteger(n)&&n>=1?n:0);
  modal.hidden=false;
  document.body.classList.add('beagu-participation-open');
  if(lastLevel>=1){
   // Revalidate expiry on opening details without exposing a code.
   void verifyCurrent();
   if(lastLevel===1)code.focus();
   else logout.focus();
  }else code.focus();
  window.dispatchEvent(new Event('beagu:participation-dialog-opened'));
 }
 const button=(label,className,action=open)=>{
  const b=el('button',className,label);b.type='button';
  b.addEventListener('click',action);
  return b;
 };
 for(const host of hosts){
  host.classList.add('beagu-participation-host');
  const legacy=host.querySelector('form');
  if(legacy){
   legacy.classList.add('beagu-participation-legacy');
   legacy.setAttribute('aria-hidden','true');
   legacy.inert=true;
  }
  const heading=host.querySelector('h1,h2');
  if(heading)heading.textContent='참여코드 입력';
  const intro=el('p','beagu-participation-intro','발급받은 참여코드를 입력하면 이용 가능한 학교정보가 열립니다.');
  intro.dataset.beaguParticipationDescription='';
  const trigger=button('참여코드 입력','beagu-participation-inline-trigger');
  trigger.dataset.beaguParticipationTrigger='';
  const status=button('', 'beagu-participation-inline-status',open);
  status.dataset.beaguParticipationStatus='';
  status.hidden=true;
  (legacy||host).before(intro,trigger,status);
 }
 for(const legacy of gameForms){
  legacy.classList.add('beagu-participation-legacy');
  legacy.inert=true;
  const action=button('참여코드 입력','beagu-participation-game-trigger');
  action.dataset.beaguParticipationGameTrigger='';
  legacy.before(action);
 }
 async function request(action,payload={},token=''){
  const res=await fetch(ENDPOINT,{
   method:'POST',cache:'no-store',
   headers:{'Content-Type':'application/json',...(token?{'X-Beagu-Session':token}:{})},
   body:JSON.stringify({action,...payload})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok){
   const e=new Error(data.error||'AUTH_FAILED');e.status=res.status;throw e;
  }
  return data;
 }
 async function verifyCurrent(){
  const token=stored();
  if(!token)return;
  try{
   const result=await request('verify',{},token);
   if(stored()!==token)return;
   if(Number(result.level)<1||Number(result.level)>2)throw Error('INVALID_LEVEL');
   expiresAt=result.expires_at||'';
   // The level-state module also rechecks on every route/focus.
   if(!modal.hidden)paint(Number(result.level));
  }catch(e){
   if(e.status===401||e.status===403){
    if(stored()===token){try{sessionStorage.removeItem(KEY)}catch(_){}}
    window.dispatchEvent(new Event('beagu:level-state-change'));
   }
   if(!modal.hidden){
    if(e.status===401||e.status===403)paint(0);
    message.textContent=e.status===401||e.status===403?
      '인증이 만료되었거나 해제되었습니다. 참여코드를 다시 입력해 주세요.':
      '서버 연결이 원활하지 않습니다. 기존 인증을 유지한 채 다시 확인해 주세요.';
   }
  }
 }
 badge.setAttribute('role','button');
 badge.addEventListener('click',e=>{e.preventDefault();open()});
 badge.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();open()}});
 modal.addEventListener('click',e=>{if(e.target===modal)close()});
 closeButton.addEventListener('click',close);
 document.addEventListener('keydown',e=>{
  if(modal.hidden)return;
  if(e.key==='Escape'){e.preventDefault();close()}
  if(e.key==='Tab'){
   const focusable=[...modal.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),a[href]')]
    .filter(x=>x.getClientRects().length);
   if(!focusable.length)return;
   const first=focusable[0],last=focusable[focusable.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 });
 toggle.addEventListener('click',()=>{
  const visible=code.type==='password';
  code.type=visible?'text':'password';
  toggle.textContent=visible?'숨기기':'표시';
  toggle.setAttribute('aria-pressed',String(visible));
 });
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(busy||modal.dataset.entryMode==='account')return;
  const value=code.value.trim();
  if(!/^[A-Za-z0-9-]{8,120}$/.test(value)){
   message.textContent='참여코드 형식을 확인해 주세요.';return;
  }
  busy=true;submit.disabled=true;message.textContent='참여코드를 확인하고 있습니다.';
  try{
   const result=await request('login',{code:value});
   if(typeof result.token!=='string'||!/^[a-f0-9]{64}$/.test(result.token))
    throw Error('INVALID_SESSION');
   const checked=await request('verify',{},result.token);
   const level=Number(checked.level);
   if(!Number.isInteger(level)||level<1||level>2)throw Error('INVALID_LEVEL');
   if(lastLevel===1&&level<2){
    message.textContent='Lv.2 권한이 확인되지 않았습니다. 기존 Lv.1 인증은 유지됩니다.';
    return;
   }
   try{sessionStorage.setItem(KEY,result.token)}catch(_){throw Error('STORAGE_UNAVAILABLE')}
   if(stored()!==result.token)throw Error('STORAGE_UNAVAILABLE');
   expiresAt=checked.expires_at||'';
   paint(level);
   close();
   window.dispatchEvent(new CustomEvent('beagu:participation-authenticated',{
    detail:{token:result.token,level,provisional:checked.provisional===true}
   }));
   window.dispatchEvent(new Event('beagu:level-state-change'));
   if(document.body.classList.contains('beagu-page-search'))
    window.location.assign('search-lv1.html');
  }catch(err){
   message.textContent=err.status===429?'인증 요청이 많습니다. 잠시 후 다시 시도해 주세요.':
    err.status===401||err.status===403?'참여코드를 확인해 주세요.':
    err.message==='STORAGE_UNAVAILABLE'?'브라우저의 저장 기능을 허용해 주세요.':
    '인증할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
  }finally{busy=false;submit.disabled=false;code.value=''}
 });
 logout.addEventListener('click',async()=>{
  const token=stored();
  try{sessionStorage.removeItem(KEY)}catch(_){}
  expiresAt='';paint(0);close();
  window.dispatchEvent(new Event('beagu:participation-logged-out'));
  window.dispatchEvent(new Event('beagu:level-state-change'));
  if(token)try{await request('logout',{},token)}catch(_){}
 });
 window.addEventListener('beagu:level-state-updated',event=>{
  const n=event.detail?.level;
  if(Number.isInteger(n)&&n>=0&&n<=2)paint(n);
  else if(event.detail?.status==='checking')badge.textContent='인증 확인 중';
  else if(event.detail?.status==='error')badge.textContent='참여코드 확인';
 });
 window.addEventListener('beagu:participation-open',open);
 const level=Number(badge.dataset.level);
 paint(Number.isInteger(level)&&level>=1&&level<=2?level:0);
})();

/* Unified anonymous account entry. Legacy code access remains explicit. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),badge=$('beaguLevelState'),overlay=$('beaguParticipationOverlay');
 if(!badge||!overlay)return;
 const KEY='beagu-level-session-v1',OWN='beagu-account-session-v1',DEVICE='beagu-referral-device-secret-v1';
 const base='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/';
 const idPattern=/^[A-Za-z0-9-]{8,120}$/,tokenPattern=/^[a-f0-9]{64}$/;
 const read=k=>{try{return sessionStorage.getItem(k)||''}catch{return ''}};
 const own=()=>{const t=read(OWN);return tokenPattern.test(t)&&t===read(KEY)?t:''};
 const localDevice=()=>{try{return localStorage.getItem(DEVICE)||''}catch{return ''}};
 const dialog=overlay.querySelector('.beagu-participation-dialog');
 const panel=document.createElement('section');panel.id='beaguAccountEntry';
 panel.innerHTML=`
 <h2 id="beaguAccountEntryTitle">배구지수 로그인</h2>
 <p id="beaguEntryCopy">나의 고유번호가 로그인 아이디입니다.</p>
 <div id="beaguEntryTabs" class="beagu-account-entry-tabs"><button type="button" id="beaguEntryLoginTab">로그인</button><button type="button" id="beaguEntrySignupTab">회원가입</button></div>
 <form id="beaguEntryForm" method="post">
 <label for="beaguEntryId">로그인 아이디 (나의 고유번호)</label><input id="beaguEntryId" autocomplete="username" maxlength="120" minlength="8" required spellcheck="false" autocapitalize="off">
 <label for="beaguEntryPassword">비밀번호</label><input id="beaguEntryPassword" type="password" autocomplete="current-password" minlength="4" maxlength="256" required>
 <div id="beaguEntryConfirmRow" hidden><label for="beaguEntryConfirm">비밀번호 확인</label><input id="beaguEntryConfirm" type="password" autocomplete="new-password" minlength="4" maxlength="256"></div>
 <p id="beaguEntryHelp" hidden>최초 참여 기기에서 가입하세요. 비밀번호는 4자 이상, 추측하기 어려운 긴 비밀번호를 권장합니다.</p>
 <button id="beaguEntrySubmit" type="submit">로그인</button></form>
 <div id="beaguEntryOwner" hidden><p>익명 계정으로 로그인했습니다.</p><a href="account.html">나의 계정 관리</a><button id="beaguEntryLogout" type="button">로그아웃</button></div>
 <section id="beaguEntryCard" hidden><h3>나의 익명 회원증</h3><strong id="beaguEntryCardId"></strong><p id="beaguEntryCardLevel"></p><p>일회용 복구코드</p><code id="beaguEntryRecovery"></code><p>다른 사람에게 공유하지 마세요. 비밀번호와 복구코드를 모두 잃으면 운영자도 복구할 수 없습니다.</p><button type="button" id="beaguEntrySave">회원증 저장 (.txt)</button><button type="button" id="beaguEntryContinue">저장 완료 · 계속</button></section>
 <p id="beaguEntryMessage" role="status" aria-live="polite"></p>
 <nav id="beaguEntryLinks"><a href="account.html#accountRecover">비밀번호 복구</a><a href="challenge.html">챌린지에서 회원가입</a><a href="https://forms.gle/TPyCakK6Sj2zchRy7" target="_blank" rel="noopener noreferrer">2026 조사 참여</a></nav>
 <button type="button" id="beaguEntryLegacy">기존 참여코드로 자료 열람하기</button><button type="button" id="beaguEntryBack" hidden>로그인 화면으로 돌아가기</button>`;
 dialog.append(panel);
 const header=document.createElement('button');header.id='beaguAccountHeader';header.type='button';badge.after(header);
 const footer=document.createElement('p');footer.className='beagu-anonymous-notice';
 footer.textContent='배구지수사이트는 익명 회원제로 운영되며, 신규 회원가입 시 이메일, 전화번호, 실명 등을 수집하거나 저장하지 않습니다.';
 (document.querySelector('footer')||document.querySelector('main')||document.body).append(footer);
 const form=$('beaguEntryForm'),code=$('beaguEntryId'),pw=$('beaguEntryPassword'),confirm=$('beaguEntryConfirm'),msg=$('beaguEntryMessage');
 const join=$('challengeAccountJoin'),joinStatus=$('challengeAccountStatus');
 let mode='login',busy=false,card=null,challengeCode='',challengeToken='',ownerToken='',saved=false;
 function clearFields(){code.value='';pw.value='';confirm.value='';code.readOnly=false;}
 function clearCard(){card=null;saved=false;$('beaguEntryCard').hidden=true;$('beaguEntryCardId').textContent='';$('beaguEntryCardLevel').textContent='';$('beaguEntryRecovery').textContent='';$('beaguEntryContinue').disabled=true;}
 function sync(){
  const logged=Boolean(own())&&ownerToken===own();
  header.textContent=logged?'나의 계정':'로그인';
  if(join){const ready=challengeToken===read(KEY)&&idPattern.test(challengeCode)&&tokenPattern.test(localDevice());join.hidden=logged||!ready;join.disabled=!ready||busy;if(joinStatus)joinStatus.textContent=logged?'나의 고유번호가 로그인 아이디입니다. 계정 로그인 완료.':ready?'나의 고유번호가 로그인 아이디입니다. 비밀번호만 설정해 계정을 만드세요.':'나의 고유번호가 로그인 아이디입니다. 최초 참여 기기에서 가입하세요.';}
  for(const b of document.querySelectorAll('[data-beagu-participation-trigger],[data-beagu-participation-game-trigger]'))b.textContent='로그인';
 }
 function show(next,prefill=''){
  if(busy||card)return;
  mode=next;clearFields();msg.textContent='';
  const legacy=next==='legacy',signup=next==='signup',owner=next==='owner';
  overlay.dataset.entryMode=legacy?'legacy':'account';
  dialog.setAttribute('aria-labelledby',legacy?'beaguParticipationTitle':'beaguAccountEntryTitle');
  $('beaguEntryBack').hidden=!legacy;
  $('beaguAccountEntryTitle').hidden=legacy;$('beaguEntryCopy').hidden=legacy;
  $('beaguEntryTabs').hidden=legacy||owner;$('beaguEntryLinks').hidden=legacy||owner;
  form.hidden=legacy||owner;$('beaguEntryOwner').hidden=!owner;
  $('beaguEntryLegacy').hidden=legacy||owner||Boolean(own());
  $('beaguEntryConfirmRow').hidden=!signup;confirm.required=signup;
  pw.autocomplete=signup?'new-password':'current-password';
  $('beaguEntryHelp').hidden=!signup;
  $('beaguEntrySubmit').textContent=signup?'회원가입':'로그인';
  $('beaguAccountEntryTitle').textContent=owner?'나의 계정':signup?'익명 회원가입':'배구지수 로그인';
  $('beaguEntryLoginTab').setAttribute('aria-pressed',String(!signup));$('beaguEntrySignupTab').setAttribute('aria-pressed',String(signup));
  if(prefill){code.value=prefill;code.readOnly=true;}
  if(!overlay.hidden&&!legacy)(owner?$('beaguEntryLogout'):prefill?pw:code).focus();
 }
 function open(next,prefill=''){window.dispatchEvent(new Event('beagu:participation-open'));show(next,prefill);}
 async function api(action,payload={},token=''){
  const r=await fetch(base+'beagu-account-v1',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Beagu-Session':token},body:JSON.stringify({action,...payload})});
  const d=await r.json().catch(()=>null);if(!r.ok||!d){const e=Error('ACCOUNT_FAILED');e.status=r.status;throw e;}return d;
 }
 async function verifyLogin(id,password){
  const result=await api('password_login',{account_id:id,password});
  if(!tokenPattern.test(result.token||'')||result.account_id!==id||![1,2].includes(result.level))throw Error('INVALID_SESSION');
  const response=await fetch(base+'beagu-level-api',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Beagu-Session':result.token},body:JSON.stringify({action:'verify'})});
  const checked=await response.json();
  if(!response.ok||Number(checked.level)!==result.level)throw Error('VERIFY_FAILED');
  const previous=read(KEY),previousOwn=read(OWN);
  try{sessionStorage.setItem(KEY,result.token);sessionStorage.setItem(OWN,result.token);}
  catch(e){try{previous?sessionStorage.setItem(KEY,previous):sessionStorage.removeItem(KEY);previousOwn?sessionStorage.setItem(OWN,previousOwn):sessionStorage.removeItem(OWN);}catch{}throw e;}
  ownerToken=result.token;challengeCode='';challengeToken='';sync();
  window.dispatchEvent(new CustomEvent('beagu:participation-authenticated',{detail:{token:result.token,level:result.level,provisional:checked.provisional===true}}));
  window.dispatchEvent(new Event('beagu:level-state-change'));
  return result;
 }
 function finish(){clearCard();overlay.querySelector('[data-beagu-close]').click();if(document.body.classList.contains('beagu-page-search'))window.location.assign('search-lv1.html');}
 function renderCard(id,recovery,result){
  card={id,recovery,known:Boolean(result),active:result?.lv2_active===true};saved=false;
  form.hidden=true;$('beaguEntryTabs').hidden=true;$('beaguEntryLinks').hidden=true;$('beaguEntryLegacy').hidden=true;
  $('beaguEntryCard').hidden=false;$('beaguEntryCardId').textContent=id;$('beaguEntryCardLevel').textContent=card.known?(card.active?'Lv.2 활성':'Lv.2 비활성'):'Lv.2 확인 필요';
  $('beaguEntryRecovery').textContent=recovery.slice(0,4)+'-'+recovery.slice(4,8)+'-'+recovery.slice(8);$('beaguEntryContinue').disabled=true;
 }
 window.addEventListener('beagu:participation-dialog-opened',()=>show(own()&&ownerToken===own()?'owner':'login'));
 window.addEventListener('beagu:participation-dialog-closed',()=>{clearFields();if(!card)msg.textContent='';});
 window.addEventListener('beagu:participation-before-close',e=>{if(busy||card){e.preventDefault();msg.textContent=busy?'처리 중입니다.':'회원증을 저장하고 계속 버튼을 눌러주세요.';}});
 header.addEventListener('click',()=>open(own()&&ownerToken===own()?'owner':'login'));
 $('beaguEntryLoginTab').onclick=()=>show('login');$('beaguEntrySignupTab').onclick=()=>show('signup');
 $('beaguEntryLegacy').onclick=()=>show('legacy');$('beaguEntryBack').onclick=()=>show('login');
 join?.addEventListener('click',()=>{if(challengeToken===read(KEY)&&idPattern.test(challengeCode))open('signup',challengeCode);});
 window.addEventListener('beagu:identity-ready',e=>{if(idPattern.test(e.detail?.code||'')&&tokenPattern.test(read(KEY))){challengeCode=e.detail.code;challengeToken=read(KEY);sync();}});
 window.addEventListener('beagu:challenge-access-revoked',()=>{challengeCode='';challengeToken='';sync();});
 async function refreshOwner(){
  const t=own();if(!t){ownerToken='';sync();return;}
  try{const r=await api('status',{},t);if(own()===t&&idPattern.test(r.account_id||'')&&[1,2].includes(r.level)){ownerToken=t;sync();}}
  catch(e){if(own()===t&&(e.status===401||e.status===403)){sessionStorage.removeItem(OWN);if(read(KEY)===t)sessionStorage.removeItem(KEY);ownerToken='';sync();window.dispatchEvent(new Event('beagu:level-state-change'));}}
 }
 window.addEventListener('beagu:level-state-updated',()=>{sync();if(!busy&&own()!==ownerToken)void refreshOwner();});
 window.addEventListener('beagu:participation-logged-out',()=>{ownerToken='';challengeCode='';challengeToken='';try{sessionStorage.removeItem(OWN)}catch{}sync();});
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||card||!['login','signup'].includes(mode))return;
  const id=code.value.trim(),password=pw.value,repeated=confirm.value,signup=mode==='signup';pw.value='';confirm.value='';
  if(!idPattern.test(id)||Array.from(password).length<4){msg.textContent='고유번호와 4자 이상 비밀번호를 확인하세요.';return;}
  if(signup&&password!==repeated){msg.textContent='비밀번호가 일치하지 않습니다.';return;}
  if(signup&&!tokenPattern.test(localDevice())){msg.textContent='최초 설문 참여 기기에서 가입하세요.';return;}
  busy=true;$('beaguEntrySubmit').disabled=true;msg.textContent='확인 중입니다.';
  try{
   if(signup){
    const recovery=Array.from(crypto.getRandomValues(new Uint8Array(13)),b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b&31]).join('');
    let result;
    try{result=await api('signup',{account_id:id,code:id,password,deviceSecret:localDevice(),new_recovery:recovery});if(result.account_id!==id||![1,2].includes(result.level))throw Error('INVALID_RESULT');}
    catch(err){if(!err.status||err.status>=500){renderCard(id,recovery,null);msg.textContent='가입 결과를 확인할 수 없습니다. 회원증을 저장한 후 로그인 여부를 확인하세요.';return;}throw err;}
    renderCard(id,recovery,result);
    try{await verifyLogin(id,password);msg.textContent='가입 및 자동 로그인 완료. 회원증을 저장하세요.';}
    catch{msg.textContent='가입 완료. 회원증을 저장한 뒤 직접 로그인하세요.';}
   }else{await verifyLogin(id,password);busy=false;finish();}
  }catch(err){msg.textContent=err.status===429?'인증 요청이 많습니다. 잠시 후 다시 시도하세요.':'로그인 또는 가입에 실패했습니다. 입력값과 최초 참여 기기를 확인하세요.';}
  finally{busy=false;$('beaguEntrySubmit').disabled=false;sync();}
 };
 $('beaguEntrySave').onclick=()=>{if(!card)return;const text='BAEGUINDEX 익명 회원증\n로그인 고유번호: '+card.id+'\n'+$('beaguEntryCardLevel').textContent+' (발급 시점)\n일회용 복구코드: '+$('beaguEntryRecovery').textContent+'\n타인과 공유 금지.\n';const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='BAEGUINDEX-익명회원증.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);saved=true;$('beaguEntryContinue').disabled=false;};
 $('beaguEntryContinue').onclick=()=>{if(!card||!saved)return;const logged=Boolean(own())&&ownerToken===own();const id=card.id;clearCard();if(logged)finish();else{show('login');code.value=id;}};
 $('beaguEntryLogout').onclick=async()=>{if(busy)return;const t=own();busy=true;try{if(t)await api('logout',{},t);}catch{msg.textContent='서버 로그아웃을 확인하지 못했습니다.';}finally{try{if(read(KEY)===t)sessionStorage.removeItem(KEY);sessionStorage.removeItem(OWN);}catch{}ownerToken='';busy=false;window.dispatchEvent(new Event('beagu:participation-logged-out'));window.dispatchEvent(new Event('beagu:level-state-change'));sync();show('login');}};
 sync();void refreshOwner();
})();
