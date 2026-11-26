/* Per-load random school showcase from the previously published 2025 percentiles.
 * No private responses or unreleased 2026 metrics are requested. */
(() => {
  'use strict';
  const root=document.getElementById('beaguTodaySchools');
  if(!root)return;
  const high=root.querySelector('[data-today-high]');
  const low=root.querySelector('[data-today-low]');
  const status=root.querySelector('[data-today-status]');
  if(!high||!low||!status)return;
  const STORAGE_KEY='beagu-home-school-pair-v2';
  let selectedHigh=null,selectedLow=null;
  function previousPair(){
    try{const value=JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)||'null');return value&&typeof value==='object'?value:{};}catch(_){return {};}
  }
  function choose(pool,previousId){
    // Exclude the last school when an alternative exists. One-school pools
    // necessarily repeat. No account information or private data is stored.
    const alternatives=pool.filter(school=>school.id!==previousId);
    const candidates=alternatives.length?alternatives:pool;
    return candidates.length?candidates[Math.floor(Math.random()*candidates.length)]:null;
  }
  function selectPair(upper,lower){
    const previous=previousPair();
    selectedHigh=choose(upper,previous.high);
    selectedLow=choose(lower,previous.low);
    try{window.sessionStorage.setItem(STORAGE_KEY,JSON.stringify({high:selectedHigh?.id,low:selectedLow?.id}));}catch(_){}
  }
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
  function paint(host,school,label){
    host.replaceChildren();
    if(!school){host.append(el('p','',label+' 공개 학교 자료 없음'));return;}
    const anchor=el('a','beagu-home-school-name',school.name);
    anchor.href=linkFor(school.id);
    anchor.setAttribute('aria-label',school.name+' 학교 상세페이지 보기');
    const header=el('div','beagu-home-school-top');
    const value=el('span','beagu-home-school-value');
    value.append(el('span','beagu-home-percentile-label','공개'),
      el('strong','beagu-home-percentile-number',school.percentile.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%'));
    header.append(el('span','beagu-home-school-tier',label),value);
    const identity=el('div','beagu-home-school-identity');
    identity.append(anchor,el('span','beagu-home-school-region',[school.region,school.office].filter(Boolean).join(' · ')));
    const footer=el('div','beagu-home-school-footer');
    const actions=el('div','beagu-home-school-actions');
    const detail=el('a','court-school-detail','상세보기');
    detail.href=linkFor(school.id);
    detail.setAttribute('aria-label',school.name+' 상세보기');
    const experience=el('a','court-school-experience','학교체험');
    experience.href='teacher-volleyball.html?school_id='+encodeURIComponent(school.id);
    experience.setAttribute('aria-label',school.name+' 학교체험 · 선생님배구');
    actions.append(detail,experience);
    footer.append(el('span','beagu-home-school-year','2025년 기준'),actions);
    host.append(header,identity,footer,el('p','beagu-survey-meta',"유효 응답 건수: 공개 자료에서 확인되지 않음 · 2025년 백분위 비교 모집단: 1,458개교"),el('p','beagu-survey-limit',"본 수치는 익명·자발적 설문 응답을 바탕으로 산출된 인식조사 결과입니다. 응답자의 교원 신분과 실제 학교 소속이 확인되지 않았을 수 있으며, 해당 학교 전체의 교직문화를 대표하지 않습니다. 백분위와 순위는 해당 연도 산출 대상 학교 간 조사값의 상대적 위치이며, 개별 사실의 확인이나 학교·교직원의 우열을 판정한 결과가 아닙니다."));
  }
  function render(){
    if(!selectedHigh||!selectedLow)return;
    paint(high,selectedHigh,'백분위 90 이상');
    paint(low,selectedLow,'백분위 10 이하');
    status.hidden=true;
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
        .map(row=>[String(row[0]),{name:row[1],region:String(row[2]||'전국'),office:typeof row[3]==='string'?row[3]:''}]));
      const all=percentiles.rows.flatMap(row=>{
        const id=String(row?.school_id||'');
        const percentile=row?.percentiles?.[2];
        const school=names.get(id);
        if(!school||typeof percentile!=='number'||!Number.isFinite(percentile)||
           percentile<0||percentile>100)return [];
        return [{id,name:school.name,region:school.region,office:school.office,percentile}];
      }).sort((a,b)=>a.id.localeCompare(b.id));
      const unique=Array.from(new Map(all.map(school=>[school.id,school])).values());
      const upper=unique.filter(row=>row.percentile>=90);
      const lower=unique.filter(row=>row.percentile<=10);
      if(!upper.length||!lower.length)throw Error('NO_PUBLIC_CANDIDATES');
      selectPair(upper,lower);
      render();
      // Repaint links on permission changes without selecting a different pair.
      window.addEventListener('pageshow',render);
      window.addEventListener('beagu:level-state-updated',render);
    }catch(_){
      high.replaceChildren();low.replaceChildren();
      status.hidden=false;
      status.textContent='공개 학교 자료를 확인하지 못했습니다. 다시 이용해 주세요.';
    }
  }
  void init();
})();
