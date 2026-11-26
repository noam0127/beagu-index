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
 let busy=false,expiresAt='',lastFocus=null,lastLevel=0,verifiedToken='',verifiedLevel=null,verifiedProvisional=null,verifiedAccount=0;
 const el=(tag,cls,text)=>{
  const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;
 };
 const modal=el('div','beagu-participation-overlay');
 modal.id='beaguParticipationOverlay';
 modal.hidden=true;
 modal.setAttribute('role','presentation');
 modal.innerHTML=`
 <section class="beagu-participation-dialog" role="dialog" aria-modal="true"
   aria-labelledby="beaguParticipationTitle">
  <button class="beagu-participation-close" type="button" data-beagu-close aria-label="닫기">×</button>
  <div class="beagu-participation-eyebrow">BAEGU INDEX · PARTICIPATION</div>
  <h2 id="beaguParticipationTitle">참여코드 입력</h2>
  <p id="beaguParticipationDescription" hidden></p>
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
   <a href="${survey}" target="_blank" rel="noopener noreferrer">Lv.1 참여코드 받기</a>
   <a href="challenge.html">Lv.2 참여코드 받기</a>
   <a href="challenge.html#level3-account" id="beaguAccountEntry">Lv.3 비밀번호 로그인</a>
   <a href="levels.html" class="beagu-level-guide-link">레벨별 안내 →</a>
  </nav>
 </section>`;
 document.body.append(modal);
 modal.querySelector('#beaguAccountEntry')?.addEventListener('click',()=>{close();});
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
 const header=badge.closest('.beagu-level-state-container');
 const core=document.body.matches('.beagu-page-home,.beagu-page-search,.beagu-page-lv1,.beagu-page-compare,.beagu-page-playground,.beagu-page-challenge');
 let headerUI=null;
 if(header&&document.querySelector('.beagu-unified-header')){
  const inline=el('form','beagu-header-code');inline.autocomplete='off';inline.hidden=true;
  const input=el('input');input.type='password';input.name='participation-code';input.minLength=8;input.maxLength=120;input.required=true;input.autocomplete='off';input.spellcheck=false;input.autocapitalize='off';input.placeholder='참여코드';input.setAttribute('aria-label','참여코드');
  const action=el('button','','→');action.type='submit';action.setAttribute('aria-label','참여코드 인증');
  const feedback=el('span','beagu-header-code-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  inline.append(input,action,feedback);header.insertBefore(inline,badge);header.classList.add('beagu-header-auth');header.removeAttribute('aria-live');badge.setAttribute('aria-live','polite');headerUI={inline,input,action,feedback};
  if(core)document.body.classList.add('beagu-header-auth-only');
  inline.addEventListener('submit',e=>{e.preventDefault();if(!inline.hidden)return authenticate(input,action,feedback);});
 }
 const gameForms=[...document.querySelectorAll('[data-game-lv1-form],#tierCodeForm')];
 const labelFor=n=>n>=2?'♛ Lv2 · 챌린지 달성':n>=1?'✓ Lv1 · 설문 참여 완료':'참여코드 입력';
 function stored(){try{return sessionStorage.getItem(KEY)||''}catch(_){return ''}}
 function paint(level){
  lastLevel=level;
  const text=labelFor(level);
  const accountLevel=level===2&&verifiedAccount===3?3:level;
  const canRebind=level===2&&verifiedProvisional===true&&accountLevel!==3&&verifiedToken===stored();
  badge.dataset.level=String(level);badge.textContent='Lv.'+accountLevel;
  badge.setAttribute('aria-label',level===1?'Lv.1 인증 완료 · Lv.2 참여코드 입력':level?'인증 정보 및 해제 · '+text:'참여코드 입력');
  badge.title=level===1?'Lv.2 참여코드 입력 또는 인증 해제':level?'인증 정보 확인 및 인증 해제':'참여코드 입력';
  badge.classList.toggle('beagu-participation-earned',level>=2);
  if(headerUI){
   const known=verifiedLevel!==null&&verifiedToken===stored();
   headerUI.inline.hidden=!known||level>=2;
   headerUI.input.placeholder=level===1?'Lv.2 코드':'참여코드';
   headerUI.input.setAttribute('aria-label',level===1?'Lv.2 참여코드':'Lv.1 참여코드');
   if(level>=2){headerUI.input.value='';headerUI.feedback.textContent='';}
   header.classList.toggle('beagu-header-code-visible',!headerUI.inline.hidden);
  }
  for(const host of hosts)host.dataset.beaguParticipationLevel=String(level);
  for(const item of document.querySelectorAll('[data-beagu-participation-game-trigger]'))
   item.hidden=level>=1;
  detail.hidden=level<1;
  // Lv.1 must retain a code field so an earned Lv.2 code can upgrade in place.
  form.hidden=level>=2&&!canRebind;
  heading.textContent=level===1?'레벨2에 도전하세요!':level>=2?'참여 인증 정보':'참여코드 입력';
  description.hidden=level<2;
  description.textContent=accountLevel===3?'Lv.3 나의 계정으로 로그인했습니다.':canRebind?'계정을 생성하려면 개인 Lv.2 참여코드로 다시 인증해 주세요.':level>=2?'Lv.2 인증이 완료되었습니다.':'';
  modal.querySelector('[role="dialog"]').dataset.level=String(level);
  label.textContent=canRebind?'개인 Lv.2 참여코드':level===1?'Lv.2 참여코드':'참여코드';
  code.placeholder=canRebind?'개인 Lv.2 참여코드를 입력하세요':level===1?'Lv.2 참여코드를 입력하세요':'참여코드를 입력하세요';
  submit.textContent=canRebind?'개인 코드 재인증':level===1?'Lv.2 인증하기':'레벨1 인증';
  if(level>=1){
   tierText.textContent=accountLevel===3?'Lv.3 · 나의 계정':text;
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
  paint(verifiedLevel??lastLevel);
  modal.hidden=false;
  document.body.classList.add('beagu-participation-open');
  if(stored()){
   // Revalidate expiry on opening details without exposing a code.
   void verifyCurrent();
   if(lastLevel>=2&&form.hidden)logout.focus();
   else code.focus();
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
  if(core&&headerUI)host.classList.add('beagu-retired-auth-card');
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
   expiresAt=result.expires_at||'';verifiedToken=token;verifiedLevel=Number(result.level);verifiedProvisional=typeof result.provisional==='boolean'?result.provisional:null;verifiedAccount=result.accountLevel===3&&verifiedLevel===2?3:verifiedLevel;
   // The level-state module also rechecks on every route/focus.
   if(!modal.hidden)paint(Number(result.level));
  }catch(e){
   if(e.status===401||e.status===403){
    if(stored()!==token)return;
    try{sessionStorage.removeItem(KEY);sessionStorage.removeItem('beagu-login-code-mask-v1')}catch(_){}
    verifiedToken='';verifiedLevel=0;verifiedProvisional=null;verifiedAccount=0;
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
 async function authenticate(code,submit,message){
  if(busy)return;
  const startToken=stored();
  if(startToken&&(verifiedToken!==startToken||verifiedLevel===null)){message.textContent='인증 확인 후 다시 시도하세요.';window.dispatchEvent(new Event('beagu:level-state-change'));return;}
  const minimum=verifiedLevel??0;
  const rebinding=minimum===2&&verifiedProvisional===true&&verifiedAccount!==3&&verifiedToken===startToken;
  if(minimum>=2&&!rebinding)return;
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
   if(stored()!==startToken)return;
   if(rebinding&&(level!==2||checked.provisional!==false)){message.textContent='개인 Lv.2 참여코드가 확인되지 않았습니다. 기존 인증은 유지됩니다.';return;}
   if(minimum===1&&level<2){
    message.textContent='Lv.2 권한이 확인되지 않았습니다. 기존 Lv.1 인증은 유지됩니다.';
    return;
   }
   try{sessionStorage.setItem(KEY,result.token)}catch(_){throw Error('STORAGE_UNAVAILABLE')}
   if(stored()!==result.token)throw Error('STORAGE_UNAVAILABLE');
   try{sessionStorage.setItem('beagu-login-code-mask-v1',JSON.stringify({token:result.token,mask:value.slice(0,2)+'*'.repeat(value.length-2)}))}catch(_){}
   expiresAt=checked.expires_at||'';verifiedToken=result.token;verifiedLevel=level;verifiedProvisional=typeof checked.provisional==='boolean'?checked.provisional:null;verifiedAccount=checked.accountLevel===3&&level===2?3:level;
   message.textContent='';paint(level);
   if(!modal.hidden)close();
   window.dispatchEvent(new CustomEvent('beagu:participation-authenticated',{
    detail:{token:result.token,level,accountLevel:checked.accountLevel??level,provisional:checked.provisional===true}
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
 }
 form.addEventListener('submit',e=>{e.preventDefault();return authenticate(code,submit,message);});
 logout.addEventListener('click',async()=>{
  const token=stored();
  try{sessionStorage.removeItem(KEY);sessionStorage.removeItem('beagu-login-code-mask-v1')}catch(_){}
  expiresAt='';verifiedToken='';verifiedLevel=0;verifiedProvisional=null;verifiedAccount=0;paint(0);close();
  window.dispatchEvent(new Event('beagu:participation-logged-out'));
  window.dispatchEvent(new Event('beagu:level-state-change'));
  if(token)try{await request('logout',{},token)}catch(_){}
 });
 // Only auto-open on initial entry to the challenge page after Lv.0 is known.
 // Mark the entry handled before focusing: focus can trigger another level refresh.
 let challengeEntryHandled=false;
 function handleChallengeEntry(level){
  if(challengeEntryHandled||!document.body.classList.contains('beagu-page-challenge'))return;
  if(['#level3-account','#level3-create'].includes(window.location?.hash)){challengeEntryHandled=true;return;}
  if(level===0&&!stored()){
   challengeEntryHandled=true;
   if(modal.hidden)open();
  }else if(level===1||level===2){challengeEntryHandled=true;}
 }
 window.addEventListener('beagu:level-state-updated',event=>{
  const n=event.detail?.level;
  if(Number.isInteger(n)&&n>=0&&n<=2){verifiedToken=stored();verifiedLevel=n;verifiedProvisional=typeof event.detail?.provisional==='boolean'?event.detail.provisional:null;verifiedAccount=n===2&&event.detail?.accountLevel===3?3:n;paint(n);handleChallengeEntry(n);}
  else {if(verifiedToken!==stored()){verifiedLevel=null;verifiedToken='';verifiedProvisional=null;verifiedAccount=0;}if(headerUI){headerUI.inline.hidden=true;header.classList.remove('beagu-header-code-visible');}badge.textContent=event.detail?.status==='checking'?'확인 중':'확인 불가';}
 });
 window.addEventListener('beagu:participation-open',open);
 const level=Number(badge.dataset.level);
 if(Number.isInteger(level)&&level>=0&&level<=2){verifiedToken=stored();verifiedLevel=level;verifiedProvisional=badge.dataset.provisional==='true'?true:badge.dataset.provisional==='false'?false:null;verifiedAccount=level===2&&badge.dataset.accountLevel==='3'?3:level;paint(level);handleChallengeEntry(level);}
 else if(!stored()){verifiedLevel=0;paint(0);handleChallengeEntry(0);}
})();
