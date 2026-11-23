/* Rotating school showcase from the previously published 2025 percentiles.
 * No private responses or unreleased 2026 metrics are requested. */
(() => {
  'use strict';
  const root=document.getElementById('beaguTodaySchools');
  if(!root)return;
  const high=root.querySelector('[data-today-high]');
  const low=root.querySelector('[data-today-low]');
  const status=root.querySelector('[data-today-status]');
  if(!high||!low||!status)return;
  const HOUR=3600000,PERIOD=12*HOUR,SEOUL_OFFSET=9*HOUR;
  let upper=[],lower=[],timer=null;
  const slotAt=now=>Math.floor((now+SEOUL_OFFSET)/PERIOD);
  const nextBoundary=now=>(slotAt(now)+1)*PERIOD-SEOUL_OFFSET;
  const tier=()=>{
    const level=document.getElementById('beaguLevelState')?.dataset.level;
    return level==='1'||level==='2'?Number(level):0;
  };
  const linkFor=id=>(tier()>=1?'search-lv1.html':'school-report.html')+
    '?school_id='+encodeURIComponent(id);
  const el=(tag,cls,text)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=String(text);
    return node;
  };
  function paint(host,pool,slot,label,step){
    host.replaceChildren();
    if(!pool.length){host.append(el('p','',label+' 공개 학교 자료 없음'));return;}
    const school=pool[(slot*step%pool.length+pool.length)%pool.length];
    const anchor=el('a','beagu-home-school-name',school.name);
    anchor.href=linkFor(school.id);
    anchor.setAttribute('aria-label',school.name+' 학교 상세페이지 보기');
    host.append(el('span','beagu-home-school-tier',label),anchor,
      el('span','beagu-home-school-region',school.region+' · 2025년 기준'),
      el('span','beagu-home-school-value','공개 백분위 '+
        school.percentile.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%'));
  }
  function render(){
    if(!upper.length||!lower.length)return;
    const slot=slotAt(Date.now());
    paint(high,upper,slot,'상위 10%',1);
    paint(low,lower,slot,'하위 10%',7);
    status.hidden=true;
  }
  function schedule(){
    if(timer!==null)clearTimeout(timer);
    const now=Date.now();
    timer=setTimeout(()=>{render();schedule()},Math.max(1000,nextBoundary(now)-now+50));
  }
  async function init(){
    try{
      const [percentiles,directory]=await Promise.all([
        fetch('data/public-lv0-percentiles-v1.2.json?v=20261120-all-regions1',{cache:'default'})
          .then(r=>{if(!r.ok)throw Error('PERCENTILES_UNAVAILABLE');return r.json()}),
        fetch('data/public-compare-school-directory-v1.json?v=20261122-directory1',{cache:'default'})
          .then(r=>{if(!r.ok)throw Error('DIRECTORY_UNAVAILABLE');return r.json()})
      ]);
      if(!Array.isArray(percentiles?.rows)||!Array.isArray(directory?.rows))
        throw Error('INVALID_PUBLIC_DATA');
      const names=new Map(directory.rows.filter(row=>Array.isArray(row)&&
        /^[0-9]{7}$/.test(String(row[0]))&&typeof row[1]==='string'&&row[1].length<=120)
        .map(row=>[String(row[0]),{name:row[1],region:String(row[2]||'전국')}]));
      const all=percentiles.rows.flatMap(row=>{
        const id=String(row?.school_id||'');
        const percentile=row?.percentiles?.[2];
        const school=names.get(id);
        if(!school||typeof percentile!=='number'||!Number.isFinite(percentile)||
           percentile<0||percentile>100)return [];
        return [{id,name:school.name,region:school.region,percentile}];
      }).sort((a,b)=>a.id.localeCompare(b.id));
      upper=all.filter(row=>row.percentile>=90);
      lower=all.filter(row=>row.percentile<=10);
      if(!upper.length||!lower.length)throw Error('NO_PUBLIC_CANDIDATES');
      render();schedule();
      window.addEventListener('pageshow',()=>{render();schedule()});
      document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();schedule()}});
      window.addEventListener('beagu:level-state-updated',render);
    }catch(_){
      high.replaceChildren();low.replaceChildren();
      status.hidden=false;
      status.textContent='공개 학교 자료를 확인하지 못했습니다. 다시 이용해 주세요.';
    }
  }
  void init();
})();
