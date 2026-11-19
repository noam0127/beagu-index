/* Server-verified Lv.1 school-interest ranking; never put ranked data into Lv.0 markup. */
(() => {
  'use strict';
  const root=document.getElementById('beaguInterest');
  if(!root||root.dataset.interestLocked==='true')return;
  const list=root.querySelector('[data-interest-list]');
  const message=root.querySelector('[data-interest-status]');
  const more=root.querySelector('[data-interest-more]');
  const tabs=Array.from(root.querySelectorAll('[data-interest-mode]'));
  if(!list||!message||!more||tabs.length!==2)return;
  const key='beagu-level-session-v1';
  const endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-school-interest-v1';
  const schoolId=/^[0-9]{7}$/;
  const data={popular:[],rising:[]};
  let mode='popular',expanded=false,requestId=0,lastToken='';
  const getToken=()=>{try{return sessionStorage.getItem(key)||''}catch(_){return ''}};
  const el=(tag,className='',value='')=>{const node=document.createElement(tag);if(className)node.className=className;if(value)node.textContent=value;return node};
  function render(){
    list.replaceChildren();
    const items=data[mode];
    const visible=expanded?items:items.slice(0,5);
    for(const [index,school] of visible.entries()){
      if(!schoolId.test(String(school.school_id||'')))continue;
      const item=el('li','beagu-interest-item');
      const button=el('button');
      button.type='button';
      button.setAttribute('aria-label',school.school_name+' 검색하기');
      const rank=el('span','beagu-interest-rank',String(index+1));
      const schoolDetails=el('span','beagu-interest-school');
      schoolDetails.append(el('strong','',school.school_name),el('small','',school.region||''));
      const metric=mode==='popular'
        ?Number(school.visitors).toLocaleString('ko-KR')+'명'
        :'+'+Number(school.growth).toLocaleString('ko-KR')+'명';
      button.append(rank,schoolDetails,el('span','beagu-interest-number',metric));
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
    const empty=items.length===0;
    message.hidden=!empty;
    if(empty)message.textContent=mode==='popular'
      ?'아직 표시할 학교가 없습니다. 방문 기록이 쌓이면 순위가 열립니다.'
      :'아직 급상승 학교가 없습니다. 지난주와 비교할 기록이 더 필요합니다.';
    more.hidden=items.length<=5;
    more.textContent=expanded?'접기':'10위까지 보기';
    tabs.forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.interestMode===mode)));
  }
  tabs.forEach(tab=>tab.addEventListener('click',()=>{
    mode=tab.dataset.interestMode;
    expanded=false;
    render();
  }));
  more.addEventListener('click',()=>{expanded=!expanded;render()});
  async function load(){
    const token=getToken(),sequence=++requestId;
    if(!/^[a-f0-9]{64}$/.test(token)){
      data.popular=[];data.rising=[];
      message.hidden=false;message.textContent='Lv.1 이상 인증 후 확인할 수 있습니다.';
      list.replaceChildren();more.hidden=true;
      return;
    }
    if(token===lastToken&&root.dataset.loaded==='true')return;
    root.dataset.loaded='false';
    message.hidden=false;message.textContent='학교 관심 순위를 불러오는 중입니다.';
    list.replaceChildren();more.hidden=true;
    try{
      const response=await fetch(endpoint,{
        method:'POST',cache:'no-store',
        headers:{'X-Beagu-Session':token,'Content-Type':'application/json'},
        body:'{}'
      });
      if(sequence!==requestId||getToken()!==token)return;
      if(!response.ok)throw new Error(response.status===401||response.status===403?'AUTH':'UNAVAILABLE');
      const json=await response.json();
      data.popular=Array.isArray(json.popular)?json.popular:[];
      data.rising=Array.isArray(json.rising)?json.rising:[];
      lastToken=token;
      root.dataset.loaded='true';
      render();
    }catch(error){
      if(sequence!==requestId)return;
      data.popular=[];data.rising=[];
      message.hidden=false;
      message.textContent=error?.message==='AUTH'
        ?'Lv.1 인증이 만료되었습니다. 다시 인증해 주세요.'
        :'순위를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';
    }
  }
  window.addEventListener('beagu:level-state-change',()=>{lastToken='';void load()});
  window.addEventListener('pageshow',event=>{if(event.persisted){lastToken='';void load()}});
  void load();
})();
