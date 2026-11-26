(()=> {
 'use strict';
 const card=document.getElementById('level3-account');
 if(!card)return;
 const q=id=>document.getElementById(id);
 const badge=q('beaguLevelState'), key='beagu-level-session-v1';
 const endpoint=SUPABASE_URL+'/functions/v1/beagu-level-api';
 const open=q('level3Upgrade'),form=q('level3Form'),pw=q('level3Password'),confirm=q('level3Confirm'),ack=q('level3Ack'),extra=q('level3RegisterFields'),submit=q('level3Submit'),status=q('level3Status'),login=q('level3Login');
 let mode='',busy=false,verified=0,account=0,provisional=true;
 const session=()=>{try{return sessionStorage.getItem(key)||''}catch{return ''}};
 const valid=value=>/^[A-Za-z0-9]{10,128}$/.test(value)&&/[A-Za-z]/.test(value)&&/[0-9]/.test(value);
 function clear(){pw.value='';confirm.value='';ack.checked=false;}
 function paint(){
   open.hidden=verified!==2||account===3;
   open.disabled=provisional;
   q('level3UpgradeHint').hidden=open.hidden||!provisional;
   login.hidden=account===3;
   if(account===3){form.hidden=true;clear();mode='';status.textContent='Lv.3 나의 계정 이용 중';}
   else if(mode==='register'&&open.hidden){form.hidden=true;clear();mode='';status.textContent='';}
 }
 function show(next){
   if(busy||next==='register'&&(verified!==2||provisional||account===3))return;
   mode=next;clear();status.textContent='';extra.hidden=next!=='register';confirm.required=ack.required=next==='register';
   pw.autocomplete=next==='register'?'new-password':'current-password';
   submit.textContent=next==='register'?'Lv.3 레벨업 (계정 생성)':'로그인';form.hidden=false;pw.focus();
 }
 open.addEventListener('click',()=>show('register'));
 login.addEventListener('click',()=>show('login'));
 window.addEventListener('beagu:level-state-updated',e=>{
   verified=e.detail?.level??0;account=e.detail?.accountLevel??verified;provisional=e.detail?.provisional===true;paint();
 });
 function syncAccess(){const panel=q('challengeAccessPanel');verified=Number(panel?.dataset.challengeVerifiedLevel||0);account=Number(panel?.dataset.accountLevel||verified);provisional=panel?.dataset.provisional==='true';paint();}
 window.addEventListener('beagu:challenge-access-granted',syncAccess);
 window.addEventListener('beagu:challenge-verified-level-changed',syncAccess);
 window.addEventListener('beagu:challenge-access-revoked',syncAccess);
 window.addEventListener('beagu:participation-logged-out',()=>{verified=0;account=0;provisional=true;form.hidden=true;mode='';clear();status.textContent='';paint()});
 async function api(action,payload,token){
   const r=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Beagu-Session':token},body:JSON.stringify({action,...payload})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok){const error=new Error(data.error||'UNAVAILABLE');error.status=r.status;throw error;}return data;
 }
 form.addEventListener('submit',async e=>{
   e.preventDefault();if(busy||!mode)return;
   const register=mode==='register',start=session();
   if(!valid(pw.value)){status.textContent='영문과 숫자를 포함하여 10자리 이상 입력해 주세요.';return;}
   if(register&&(pw.value!==confirm.value||!ack.checked)){status.textContent='비밀번호 확인과 안내 동의를 확인해 주세요.';return;}
   busy=true;submit.disabled=true;status.textContent='확인 중…';
   try{
     const data=await api(register?'level3_register':'level3_login',register?{password:pw.value,confirmation:confirm.value,acknowledged:ack.checked}:{password:pw.value},start);
     if(!/^[a-f0-9]{64}$/.test(data.token||'')||data.accountLevel!==3)throw Error('INVALID_SESSION');
     const checked=await api('verify',{},data.token);
     if(checked.level!==2||checked.accountLevel!==3||session()!==start)throw Error('INVALID_SESSION');
     sessionStorage.setItem(key,data.token);
     // Never carry a shared or stale code into a password-authenticated session.
     try{const maskKey='beagu-login-code-mask-v1',saved=JSON.parse(sessionStorage.getItem(maskKey)||'null');sessionStorage.removeItem(maskKey);if(register&&saved?.token===start&&/^[A-Za-z0-9-]{2}\*{6,118}$/.test(saved.mask))sessionStorage.setItem(maskKey,JSON.stringify({token:data.token,mask:saved.mask}));}catch(_){}
     window.dispatchEvent(new CustomEvent('beagu:participation-authenticated',{detail:{token:data.token,level:2,accountLevel:3,provisional:false}}));
     window.dispatchEvent(new Event('beagu:level-state-change'));
     account=3;verified=2;provisional=false;paint();
     status.textContent=register?'Lv.3 레벨업 완료':'Lv.3 로그인 완료';
   }catch(err){
     status.textContent=err.status===429?'인증 요청이 많습니다. 잠시 후 다시 시도해 주세요.':err.status===409?'계정을 만들 수 없습니다. 이미 만든 계정은 비밀번호로 로그인하고, 새 비밀번호는 다른 조합을 사용해 주세요.':err.status===401?'비밀번호를 확인해 주세요.':err.status===403?'개인 Lv.2 참여코드로 다시 인증해 주세요.':'계정 기능을 이용할 수 없습니다. 연결을 확인해 주세요.';
   }finally{clear();busy=false;submit.disabled=false;}
 });
 window.addEventListener('hashchange',()=>{if(location.hash==='#level3-account'&&account!==3)show('login')});
 if(location.hash==='#level3-account')show('login');
})();