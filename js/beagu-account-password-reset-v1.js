(() => {
  'use strict';
  const endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-account-v1';
  const status=document.getElementById('resetStatus');
  const form=document.getElementById('resetForm');
  const password=document.getElementById('resetPassword');
  const confirmation=document.getElementById('resetPasswordConfirm');
  const url=new URL(location.href);
  const hash=url.searchParams.get('token_hash') || '';
  // Remove sensitive token from URL before any user interaction, network
  // request, screenshot, referrer or subsequent navigation.
  try{history.replaceState(null,'',url.pathname);}catch(_){}
  if (location.hash) {
    try{history.replaceState(null,'',url.pathname);}catch(_){}
  }
  if(!/^[a-fA-F0-9]{64}$/.test(hash)){
    status.textContent='복구 링크가 유효하지 않습니다. 이메일에서 새 링크를 요청해 주세요.';
    return;
  }
  form.hidden=false;
  status.textContent='새 비밀번호를 두 번 입력해 주세요.';
  let used=false;
  async function update(event){
    if(event)event.preventDefault();
    if(used)return;
    if(password.value.length<12||password.value.length>128){
      status.textContent='새 비밀번호는 12~128자로 입력해 주세요.';
      return;
    }
    if(password.value!==confirmation.value){
      status.textContent='두 비밀번호가 일치하지 않습니다.';
      return;
    }
    used=true;
    form.hidden=true;
    status.textContent='비밀번호를 변경하고 있습니다.';
    try {
      const response=await fetch(endpoint,{
        method:'POST',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'complete-recovery',tokenHash:hash.toLowerCase(),password:password.value})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.passwordUpdated!==true)
        throw new Error('RESET_FAILED');
      password.value='';confirmation.value='';
      status.textContent='비밀번호가 변경되었습니다. 새로운 비밀번호로 로그인해 주세요.';
    }catch(_){
      used=false;
      password.value='';confirmation.value='';
      status.textContent='복구 링크를 사용할 수 없습니다. 새 복구 이메일을 요청해 주세요.';
      // An OTP may have been consumed; do not show the password form again.
    }
  }
  form.addEventListener('submit',update);
  // No visible submit button by product requirement; pressing Enter in either
  // password field triggers the form explicitly (including on mobile).
  form.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.isComposing){
      event.preventDefault();
      form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    }
  });
})();