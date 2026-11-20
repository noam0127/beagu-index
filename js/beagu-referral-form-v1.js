(() => {
  'use strict';
  const rawRef=new URLSearchParams(location.search).get('ref');
  if(!rawRef)return;
  const notice=document.getElementById('referralNotice');
  const normal=document.getElementById('surveyFormLink');
  const wrapper=document.getElementById('referralOptin');
  const consent=document.getElementById('referralConsent');
  const button=document.getElementById('referralJoinForm');
  const feedback=document.getElementById('referralSubmitFeedback');
  const cfg=window.BEAGU_REFERRAL_FORM_CONFIG||{};
  const goodRef=/^[a-f0-9]{64}$/.test(rawRef);
  const goodEntry=/^entry\.\d{3,20}$/.test(cfg.entryName||'');
  if(!notice||!normal||!wrapper||!button||!feedback||!consent)return;
  notice.hidden=false;
  notice.textContent='추천 실적 연동이 준비 중입니다. 지금 설문을 제출해도 추천인 승급에 반영되지 않습니다.';
  if(!goodRef){notice.textContent='올바르지 않은 추천 링크입니다. 일반 설문만 이용할 수 있습니다.';return;}
  // No pre-fill entry ID from the real Form, so the referral journey must not launch.
  if(!goodEntry)return;
  wrapper.hidden=false;
  function browserVisitor(){
    const key='beagu-visitor-v1';
    const valid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    let v=localStorage.getItem(key);
    if(!valid.test(v||'')){
      v=crypto.randomUUID();
      localStorage.setItem(key,v);
    }
    return v;
  }
  button.addEventListener('click',async () => {
    if(!consent.checked){feedback.textContent='선택적 추천 인증에 동의해야 추천 실적을 연결할 수 있습니다.';return;}
    button.disabled=true;
    feedback.textContent='추천 인증 정보를 확인하고 있습니다.';
    try{
      const req=await fetch(SUPABASE_URL+'/functions/v1/beagu-referral-checkin-v1',{
        method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'checkin',ref:rawRef,respondent:browserVisitor()})
      });
      const data=await req.json().catch(()=>({}));
      if(!req.ok || typeof data.proof!=='string' ||
         !/^BR1\.[a-f0-9]{64}\.[a-f0-9-]{36}\.\d{10}\.[a-f0-9]{64}$/.test(data.proof))
        throw Error('UNAVAILABLE');
      const form=new URL(cfg.formUrl);
      if(form.protocol!=='https:' || form.hostname!=='docs.google.com' ||
         !form.pathname.startsWith('/forms/d/e/'))
        throw Error('FORM_CONFIG_INVALID');
      form.searchParams.set('usp','pp_url');
      form.searchParams.set(cfg.entryName,data.proof);
      // The proof contains only a browser pseudonym and referral code.
      // Survey answers remain in Google Forms; we never submit answers here.
      location.assign(form.toString());
    }catch(_){
      button.disabled=false;
      feedback.textContent='추천 인증 연결을 사용할 수 없습니다. 일반 설문은 아래에서 계속 참여할 수 있습니다.';
    }
  });
  consent.addEventListener('change',()=>{button.disabled=!consent.checked;});
  button.disabled=true;
})();
