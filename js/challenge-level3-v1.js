(()=> {
 'use strict';
 const card=document.getElementById('level3-account');
 if(!card||card.hidden||card.inert)return;
 const q=id=>document.getElementById(id);
 const badge=q('beaguLevelState'), key='beagu-level-session-v1';
 const endpoint=SUPABASE_URL+'/functions/v1/beagu-level-api';
 const open=q('level3Upgrade'),form=q('level3Form'),pw=q('level3Password'),confirm=q('level3Confirm'),ack=q('level3Ack'),extra=q('level3RegisterFields'),submit=q('level3Submit'),status=q('level3Status'),login=q('level3Login');
 let mode='',busy=false,verified=null,account=0,provisional=null,verifiedToken='',pendingCreate=location.hash==='#level3-create';
 const session=()=>{try{return sessionStorage.getItem(key)||''}catch{return ''}};
 const valid=value=>/^[A-Za-z0-9]{10,128}$/.test(value)&&/[A-Za-z]/.test(value)&&/[0-9]/.test(value);
 const reveal=q('level3Reveal'),username=q('level3Username');
 const validUsername=value=>/^[A-Za-z0-9_]{4,20}$/.test(value);
 const eligible=()=>verified===2&&account!==3&&provisional===false&&!!verifiedToken&&session()===verifiedToken;
 function clear(){username.value='';pw.value='';confirm.value='';ack.checked=false;pw.type='password';confirm.type='password';reveal.textContent='표시';reveal.setAttribute('aria-pressed','false');}
 reveal.addEventListener('click',()=>{const shown=pw.type==='password';pw.type=confirm.type=shown?'text':'password';reveal.textContent=shown?'숨기기':'표시';reveal.setAttribute('aria-pressed',String(shown));});
 function paint(){
   const signed=account===3&&verified===2&&verifiedToken===session();
   open.hidden=signed;login.hidden=signed;open.disabled=busy;login.disabled=busy;
   q('level3UpgradeHint').hidden=signed||eligible();
   q('level3UpgradeHint').textContent=verified===null?'인증 상태를 확인하고 있습니다.':verified===2?'공용 Lv.2 코드로 인증한 경우 개인 Lv.2 참여코드로 다시 인증해 주세요.':'개인 Lv.2 참여코드를 받은 뒤 계정을 만들 수 있습니다.';
   q('level3Current').textContent=signed?'Lv.3 · 계정 이용 중':eligible()?'Lv.2 · 계정 생성 가능':verified===null?'인증 확인 중':'Lv.'+verified+' · 나의 계정';
   open.setAttribute('aria-pressed',String(mode==='register'));login.setAttribute('aria-pressed',String(mode==='login'));
   if(signed){form.hidden=true;clear();mode='';status.textContent='Lv.3 나의 계정 이용 중';}
   else if(mode==='register'&&!eligible()){
     if(verified===null){submit.disabled=true;status.textContent='인증 상태 확인 중…';}
     else{form.hidden=true;clear();mode='';status.textContent='개인 Lv.2 인증을 다시 확인해 주세요.';open.setAttribute('aria-pressed','false');}
   }else if(!busy){submit.disabled=false;if(mode==='register'&&status.textContent==='인증 상태 확인 중…')status.textContent='';}
 }
 function show(next){
   if(busy||account===3)return;
   if(next==='register'&&!eligible()){
     pendingCreate=true;
     status.textContent=verified===null?'인증 상태 확인 후 다시 눌러 주세요.':verified===2?'개인 Lv.2 참여코드로 인증하면 계정을 만들 수 있습니다.':'설문 참여 및 유효 추천 1건 달성 후 개인 Lv.2 코드로 인증해 주세요.';
     if(verified===null)window.dispatchEvent(new Event('beagu:level-state-change'));
     else window.dispatchEvent(new CustomEvent('beagu:participation-open',{detail:{rebind:verified===2&&provisional===true}}));
     return;
   }
   pendingCreate=false;mode=next;clear();status.textContent='';extra.hidden=next!=='register';confirm.required=ack.required=next==='register';
   pw.autocomplete=next==='register'?'new-password':'current-password';
   submit.textContent=next==='register'?'Lv.3 계정 생성':'로그인';form.hidden=false;
   open.setAttribute('aria-pressed',String(next==='register'));login.setAttribute('aria-pressed',String(next==='login'));username.focus();
 }
 open.addEventListener('click',()=>show('register'));
 login.addEventListener('click',()=>show('login'));
 function apply(level,accountLevel,isProvisional){
   verified=Number.isInteger(level)&&level>=0&&level<=2?level:null;
   account=verified===2&&accountLevel===3?3:verified??0;
   provisional=isProvisional===false?false:isProvisional===true?true:null;
   verifiedToken=verified!==null?session():'';
   paint();
   if(!busy&&pendingCreate&&eligible())show('register');
 }
 window.addEventListener('beagu:level-state-updated',e=>apply(e.detail?.level,e.detail?.accountLevel,e.detail?.provisional));
 function syncAccess(){const panel=q('challengeAccessPanel');const raw=panel?.dataset.challengeVerifiedLevel;
   if(session()&&(!raw||raw==='0'))return; // Wait for server verification instead of treating startup as Lv.0.
   const level=raw===undefined?null:Number(raw);apply(Number.isInteger(level)?level:null,Number(panel?.dataset.accountLevel),panel?.dataset.provisional==='false'?false:panel?.dataset.provisional==='true'?true:null);}
 window.addEventListener('beagu:challenge-access-granted',syncAccess);
 window.addEventListener('beagu:challenge-verified-level-changed',syncAccess);
 window.addEventListener('beagu:challenge-access-revoked',()=>apply(0,0,null));
 window.addEventListener('beagu:participation-logged-out',()=>{pendingCreate=false;form.hidden=true;mode='';clear();status.textContent='';apply(0,0,null);});
 async function api(action,payload,token){
   const r=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Beagu-Session':token},body:JSON.stringify({action,...payload})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok){const error=new Error(data.error||'UNAVAILABLE');error.status=r.status;throw error;}return data;
 }
 form.addEventListener('submit',async e=>{
   e.preventDefault();if(busy||!mode)return;
   const register=mode==='register',start=session();
   if(register&&!eligible()){status.textContent='개인 Lv.2 인증을 확인해 주세요.';return;}
   if(!validUsername(username.value)){status.textContent='아이디는 영문·숫자·밑줄 4~20자리로 입력해 주세요.';return;}
   if(!valid(pw.value)){status.textContent='영문과 숫자를 포함하여 10자리 이상 입력해 주세요.';return;}
   if(register&&(pw.value!==confirm.value||!ack.checked)){status.textContent='비밀번호 확인과 안내 동의를 확인해 주세요.';return;}
   busy=true;submit.disabled=true;open.disabled=true;login.disabled=true;status.textContent='확인 중…';
   try{
     const data=await api(register?'level3_register':'level3_login',register?{username:username.value,password:pw.value,confirmation:confirm.value,acknowledged:ack.checked}:{username:username.value,password:pw.value},start);
     if(!/^[a-f0-9]{64}$/.test(data.token||'')||data.accountLevel!==3)throw Error('INVALID_SESSION');
     const checked=await api('verify',{},data.token);
     if(checked.level!==2||checked.accountLevel!==3||session()!==start)throw Error('INVALID_SESSION');
     sessionStorage.setItem(key,data.token);
     // Never carry a shared or stale code into a password-authenticated session.
     try{const maskKey='beagu-login-code-mask-v1',saved=JSON.parse(sessionStorage.getItem(maskKey)||'null');sessionStorage.removeItem(maskKey);if(register&&saved?.token===start&&/^[A-Za-z0-9-]{2}\*{6,118}$/.test(saved.mask))sessionStorage.setItem(maskKey,JSON.stringify({token:data.token,mask:saved.mask}));}catch(_){}
     window.dispatchEvent(new CustomEvent('beagu:participation-authenticated',{detail:{token:data.token,level:2,accountLevel:3,provisional:false}}));
     window.dispatchEvent(new Event('beagu:level-state-change'));
     account=3;verified=2;provisional=false;verifiedToken=data.token;pendingCreate=false;paint();
     status.textContent=register?'Lv.3 레벨업 완료':'Lv.3 로그인 완료';
   }catch(err){
     status.textContent=err.message==='ACCOUNT_UNAVAILABLE'?'계정 서버 기능이 활성화되어 있지 않거나 연결되지 않았습니다.':err.message==='INVALID_USERNAME'?'아이디 형식을 확인해 주세요.':err.message==='INVALID_PASSWORD'&&register?'비밀번호 형식을 확인해 주세요.':err.status===429?'인증 요청이 많습니다. 잠시 후 다시 시도해 주세요.':err.status===409?'계정을 만들 수 없습니다. 다른 아이디를 사용하거나 이미 만든 계정으로 로그인해 주세요.':err.status===401?'아이디 또는 비밀번호를 확인해 주세요.':err.status===403?'개인 Lv.2 참여코드로 다시 인증해 주세요.':'계정 기능을 이용할 수 없습니다. 연결을 확인해 주세요.';
   }finally{clear();busy=false;submit.disabled=false;open.disabled=false;login.disabled=false;}
 });
 function handleHash(){if(location.hash==='#level3-create'){pendingCreate=true;card.scrollIntoView?.({block:'start'});if(eligible())show('register');}else if(location.hash==='#level3-account'&&account!==3){pendingCreate=false;show('login');}}
 window.addEventListener('hashchange',handleHash);
 syncAccess();handleHash();
})();