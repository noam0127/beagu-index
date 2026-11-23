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
  heading.textContent=level===1?'Lv.2 참여코드 입력':level>=2?'참여 인증 정보':'참여코드 입력';
  description.textContent=level===1?'Lv.1 인증을 유지하면서 Lv.2 참여코드를 입력할 수 있습니다.':
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
  modal.hidden=true;
  document.body.classList.remove('beagu-participation-open');
  message.textContent='';
  code.value='';code.type='password';toggle.textContent='표시';toggle.setAttribute('aria-pressed','false');
  lastFocus?.focus?.();
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
  if(busy)return;
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
