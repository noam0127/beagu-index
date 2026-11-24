/* Public ranking at Lv.0; verified counts only at Lv.1+. Home rotates
 * the existing top 10 by 3 seconds; all rows come from the official API. */
(() => {
  'use strict';
  const root=document.getElementById('beaguInterest');
  if(!root)return;
  const carousel=root.dataset.interestCarousel==='true';
  const topFive=root.dataset.interestTopFive==='true';
  const list=root.querySelector('[data-interest-list]');
  const message=root.querySelector('[data-interest-status]');
  const more=root.querySelector('[data-interest-more]');
  const updated=root.querySelector('[data-interest-updated]');
  if(!list||!message||(!carousel&&!topFive&&!more))return;
  const endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-school-interest-v1';
  const key='beagu-level-session-v1';
  const idPattern=/^[0-9]{7}$/;
  let schools=[],expanded=false,activeIndex=0,requestId=0,lastLoadedAt=0,lastToken='';
  const getToken=()=>{try{return sessionStorage.getItem(key)||''}catch(_){return ''}};
  const el=(tag,cls='',value)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==undefined)node.textContent=String(value);
    return node;
  };
  const valid=row=>row&&idPattern.test(String(row.school_id||''))&&
    typeof row.school_name==='string'&&row.school_name.length>0&&row.school_name.length<=120;
  const verifiedLevel=()=>{
    const level=document.getElementById('beaguLevelState')?.dataset.level;
    return level==='1'||level==='2'?Number(level):0;
  };
  const destination=school=>verifiedLevel()>=1?
    'search-lv1.html?school_id='+encodeURIComponent(school.school_id):
    'school-report.html?school_id='+encodeURIComponent(school.school_id);
  function render(){
    list.replaceChildren();
    const visible=carousel?(schools.length?[schools[activeIndex%schools.length]]:[]):
      (expanded?schools:schools.slice(0,5));
    for(const school of visible){
      const item=el('li','beagu-interest-item');
      const link=el('a','beagu-interest-link');
      link.href=destination(school);
      link.setAttribute('aria-label',school.school_name+' 학교 상세페이지 보기');
      const rank=el('span','beagu-interest-rank',schools.indexOf(school)+1);
      const detail=el('span','beagu-interest-school');
      detail.append(el('strong','',school.school_name),el('small','',school.region||''));
      link.append(rank,detail);
      if(verifiedLevel()>=1&&school.visitors!==undefined&&school.growth!==undefined&&
         Number.isSafeInteger(Number(school.visitors))&&Number.isSafeInteger(Number(school.growth))){
        const growth=Number(school.growth);
        link.append(el('span','beagu-interest-number',
          '최근 '+Number(school.visitors).toLocaleString('ko-KR')+'명 · '+
          (growth>0?'↑ +':growth<0?'↓ -':'→ ')+Math.abs(growth).toLocaleString('ko-KR')+'명'));
      }
      link.addEventListener('click',event=>{
        window.BeaguSearchTelemetry?.selected(String(school.school_id),verifiedLevel(),
          carousel?'home-rising':'search-rising',event);
      });
      item.append(link);list.append(item);
    }
    message.hidden=schools.length>0;
    if(!schools.length)message.textContent='최근 72시간 급상승 학교가 없습니다.';
    if(more){
      more.hidden=schools.length<=5;
      more.textContent=expanded?'접기':'10위까지 보기';
    }
  }
  if(more)more.addEventListener('click',()=>{expanded=!expanded;render()});
  function request(token){
    const headers={'Content-Type':'application/json'};
    if(token)headers['X-Beagu-Session']=token;
    return fetch(endpoint,{method:'POST',cache:'no-store',headers,body:'{}'});
  }
  async function load({force=false,quiet=false}={}){
    const token=getToken();
    if(!force&&token===lastToken&&Date.now()-lastLoadedAt<900000)return;
    const seq=++requestId;
    if(!quiet||!schools.length){
      if(!quiet)list.replaceChildren();
      message.hidden=false;
      message.textContent='실시간 급상승 학교를 확인하는 중입니다.';
    }
    try{
      let response=await request(token);
      if((response.status===401||response.status===403)&&token)response=await request('');
      if(seq!==requestId)return;
      if(!response.ok)throw Error('RANKING_UNAVAILABLE');
      const result=await response.json();
      schools=(Array.isArray(result.rising)?result.rising:[]).filter(valid).slice(0,topFive?5:10);
      activeIndex=activeIndex%Math.max(1,schools.length);
      lastToken=token;lastLoadedAt=Date.now();
      render();
      if(updated)updated.textContent='마지막 갱신 '+new Intl.DateTimeFormat('ko-KR',{
        timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit',hour12:true
      }).format(new Date(lastLoadedAt));
    }catch(_){
      if(seq!==requestId)return;
      if(schools.length&&quiet){
        if(updated)updated.textContent='일시적으로 갱신하지 못했습니다.';
      }else{
        schools=[];list.replaceChildren();
        message.hidden=false;
        message.textContent='급상승 학교를 불러오지 못했습니다. 다시 확인해 주세요.';
      }
    }
  }
  const shouldRefresh=()=>!document.hidden&&!root.hidden;
  setInterval(()=>{if(shouldRefresh())void load({force:true,quiet:true})},900000);
  if(carousel){
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
    if(!reduced)setInterval(()=>{
      if(!shouldRefresh()||schools.length<2||root.contains(document.activeElement)||
         root.matches(':hover'))return;
      activeIndex=(activeIndex+1)%schools.length;render();
    },3000);
  }
  document.addEventListener('visibilitychange',()=>{if(shouldRefresh())void load()});
  window.addEventListener('focus',()=>{if(shouldRefresh())void load()});
  window.addEventListener('beagu:level-state-updated',render);
  window.addEventListener('beagu:level-state-change',()=>{lastLoadedAt=0;void load({force:true,quiet:true})});
  window.addEventListener('pageshow',event=>{if(event.persisted){lastLoadedAt=0;void load({force:true})}});
  void load();
})();
