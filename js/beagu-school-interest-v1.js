/* Lv.1+ live rising schools: rolling 72h vs prior 72h, refreshed every 15 minutes. */
(() => {
  'use strict';
  const root=document.getElementById('beaguInterest');
  if(!root||root.dataset.interestLocked==='true')return;
  const list=root.querySelector('[data-interest-list]');
  const message=root.querySelector('[data-interest-status]');
  const more=root.querySelector('[data-interest-more]');
  const updated=root.querySelector('[data-interest-updated]');
  if(!list||!message||!more)return;
  const key='beagu-level-session-v1';
  const endpoint='https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-school-interest-v1';
  const idPattern=/^[0-9]{7}$/;
  let schools=[],expanded=false,requestId=0,lastToken='',lastLoadedAt=0;
  const getToken=()=>{try{return sessionStorage.getItem(key)||''}catch(_){return ''}};
  const el=(tag,className='',value='')=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(value)node.textContent=value;
    return node;
  };
  const isValid=row=>row&&idPattern.test(String(row.school_id||'')) &&
    typeof row.school_name==='string'&&row.school_name.length<=120 &&
    Number.isSafeInteger(Number(row.growth))&&Number(row.growth)>=3 &&
    Number.isSafeInteger(Number(row.visitors))&&Number(row.visitors)>=5;
  function render(){
    list.replaceChildren();
    for(const [index,school] of (expanded?schools:schools.slice(0,5)).entries()){
      const item=el('li','beagu-interest-item');
      const button=el('button');
      button.type='button';
      button.setAttribute('aria-label',school.school_name+' 학교 검색하기');
      const rank=el('span','beagu-interest-rank',String(index+1));
      const detail=el('span','beagu-interest-school');
      detail.append(el('strong','',school.school_name),el('small','',school.region||''));
      const increase=el('span','beagu-interest-number','↑ '+Number(school.growth).toLocaleString('ko-KR')+'명');
      button.append(rank,detail,increase);
      button.addEventListener('click',event=>{
        window.BeaguSearchTelemetry?.selected(String(school.school_id),1,'search-lv1',event);
        const schoolTab=document.getElementById('schoolTab');
        const searchInput=document.getElementById('searchInput');
        if(!searchInput)return;
        if(schoolTab?.getAttribute('aria-selected')!=='true')schoolTab?.click();
        searchInput.value=school.school_name;
        searchInput.dispatchEvent(new Event('input',{bubbles:true}));
        searchInput.focus({preventScroll:true});
        searchInput.scrollIntoView({behavior:'smooth',block:'start'});
      });
      item.append(button);
      list.append(item);
    }
    message.hidden=schools.length>0;
    if(!schools.length)message.innerHTML='급상승 학교를 집계 중입니다.<br>방문 기록이 충분히 쌓이면 순위가 표시됩니다.';
    more.hidden=schools.length<=5;
    more.textContent=expanded?'접기':'10위까지 보기';
  }
  more.addEventListener('click',()=>{expanded=!expanded;render()});
  async function load({force=false,quiet=false}={}){
    const token=getToken();
    if(!/^[a-f0-9]{64}$/.test(token)){
      ++requestId;schools=[];expanded=false;lastToken='';lastLoadedAt=0;
      list.replaceChildren();more.hidden=true;message.hidden=false;
      message.textContent='Lv.1 이상 인증 후 확인할 수 있습니다.';
      if(updated)updated.textContent='';
      return;
    }
    if(!force&&token===lastToken&&Date.now()-lastLoadedAt<900000)return;
    const seq=++requestId;
    if(!quiet||!schools.length){
      if(!quiet)list.replaceChildren();
      more.hidden=true;message.hidden=false;
      message.textContent='실시간 급상승 학교를 확인하는 중입니다.';
    }
    try{
      const response=await fetch(endpoint,{
        method:'POST',cache:'no-store',
        headers:{'X-Beagu-Session':token,'Content-Type':'application/json'},
        body:'{}'
      });
      if(seq!==requestId||getToken()!==token)return;
      if(!response.ok)throw new Error(response.status===401||response.status===403?'AUTH':'UNAVAILABLE');
      const result=await response.json();
      const rows=Array.isArray(result.rising)?result.rising:[];
      schools=rows.filter(isValid).slice(0,10);
      lastToken=token;lastLoadedAt=Date.now();
      render();
      if(updated)updated.textContent='마지막 갱신 '+new Intl.DateTimeFormat('ko-KR',{
        timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit',hour12:true
      }).format(new Date(lastLoadedAt));
    }catch(error){
      if(seq!==requestId)return;
      if(error?.message==='AUTH'){
        schools=[];expanded=false;lastToken='';list.replaceChildren();more.hidden=true;
        message.hidden=false;message.textContent='Lv.1 인증이 만료되었습니다. 다시 인증해 주세요.';
        if(updated)updated.textContent='';
      }else if(schools.length&&quiet){
        if(updated)updated.textContent='일시적으로 갱신하지 못했습니다. 다시 시도합니다.';
      }else{
        message.hidden=false;message.textContent='순위를 불러오지 못했습니다. 연결 상태를 확인해 주세요.';
      }
    }
  }
  const shouldPoll=()=>!document.hidden&&!root.hidden&&!root.closest('#searchPanel')?.hidden;
  setInterval(()=>{if(shouldPoll())void load({quiet:true})},900000);
  document.addEventListener('visibilitychange',()=>{if(shouldPoll())void load()});
  window.addEventListener('focus',()=>{if(shouldPoll())void load()});
  window.addEventListener('beagu:level-state-change',()=>{lastLoadedAt=0;void load()});
  window.addEventListener('pageshow',event=>{if(event.persisted){lastLoadedAt=0;void load()}});
  void load();
})();
