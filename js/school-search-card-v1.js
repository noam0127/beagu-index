/* Shared Lv.0/Lv.1/Lv.2 search-result card builder.
 * One presentation, the original Lv.0 field order, and zero school-homepage links.
 * Approved tier-only data is supplied by existing server authorization; this module never fetches it.
 */
(function(){
 'use strict';
 const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;
 function el(tag,cls,value){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(value!==undefined)n.textContent=String(value);
  return n;
 }
 function addHeader(card,school){
  const region=school.sido_standard||school.sido||'';
  const name=school.school_name||'학교명 없음';
  const meta=el('div','school-meta');
  meta.append(document.createTextNode(String(school.support_office||'교육지원청 정보 없음')));
  if(school.address){
   meta.append(document.createElement('br'),document.createTextNode(String(school.address)));
  }
  card.append(el('span','region-badge',region),el('div','school-name',name),meta);
  return card;
 }
 // Explicit display states must not imply a review process when none is recorded.
 const STATES=Object.freeze({
  PUBLISHED:'published',MISSING:'missing',REVIEW:'review',
  UNPUBLISHED:'unpublished',ERROR:'error',LOCKED:'locked',LOADING:'loading'
 });
 function publicState(status,failed){
  if(status==='REVIEW_PENDING')return STATES.REVIEW;
  if(status==='NO_PUBLISHED_VALUE')return STATES.MISSING;
  if(status==='VERIFIED_LEGACY_RESTORATION'||status==='EXISTING_PUBLIC_VALUE_PRESERVED')return STATES.MISSING;
  return failed?STATES.ERROR:STATES.MISSING;
 }
 function labelFor(state){
  return ({
   [STATES.MISSING]:'자료 없음',
   [STATES.REVIEW]:'검수 중',
   [STATES.UNPUBLISHED]:'미공개',
   [STATES.ERROR]:'불러오기 실패',
   [STATES.LOCKED]:'🔒 Lv.1+ 승인 시',
   [STATES.LOADING]:'확인 중'
  })[state]||'자료 없음';
 }
 function percentiles({publicValues=[],statuses=[],publicError=false,value2026=null,
   status2026='unpublished',locked=false}={}){
  const values=[0,1,2].map(i=>valid(publicValues[i])?publicValues[i]:null);
  values.push(!locked&&valid(value2026)?value2026:null);
  const section=el('section','percentile-panel');
  section.setAttribute('aria-label','연도별 배구지수 백분위');
  section.append(el('h3','percentile-heading','연도별 배구지수 백분위'));
  const grid=el('div','percentile-grid');
  // All visible year labels are chronological: 2023, 2024, 2025, 2026.
  for(const i of [0,1,2,3]){
   const year=2023+i;
   const cell=el('div','percentile-cell'+(year===2026&&locked?' percentile-locked':''));
   cell.dataset.year=String(year);
   const state=values[i]!==null?STATES.PUBLISHED:
    year===2026?(locked?STATES.LOCKED:
      [STATES.ERROR,STATES.LOADING,STATES.REVIEW,STATES.UNPUBLISHED].includes(status2026)
       ?status2026:STATES.UNPUBLISHED):
    publicState(statuses[i],publicError);
   cell.dataset.state=state;
   const label=state===STATES.PUBLISHED?values[i].toFixed(1)+'%':labelFor(state);
   cell.append(el('span','percentile-year',String(year)),el('strong','percentile-value',label));
   grid.append(cell);
  }
  section.append(grid);
  if(values.some(valid)&&typeof percentileChart==='function'){
    const graph=el('div','percentile-graph');
    // percentileChart renders only validated numerical values in an internal fixed SVG.
    const graphLabels=[0,1,2].map(i=>labelFor(publicState(statuses[i],publicError)));
    graphLabels.push(locked?'승인 전':labelFor(
      [STATES.ERROR,STATES.LOADING,STATES.REVIEW,STATES.UNPUBLISHED].includes(status2026)?status2026:STATES.UNPUBLISHED
    ));
    graph.innerHTML=percentileChart(values,{
      blank2026:locked||values[3]===null,
      labels:graphLabels
    });
    section.append(graph);
  }
  const notes=el('ul','percentile-notes');
  [
   '표시 순서: 2023 → 2024 → 2025 → 2026. 각 점은 해당 연도의 독립적인 백분위이며, 연도 간 상승·하락을 의미하지 않습니다.',
   '2023·2024: 해당 연도 문항과 당시 산정 기준의 공개값. 2025: 8개 영역 종합값을 비교집단 1,458개교에서 재산출(99%는 상위 약 1%).',
   '2026: 수정5 신규 조사 기준의 공개 승인 결과만 표시. 자료 없음·검수 중·미공개·불러오기 실패는 서로 다른 상태입니다.'
  ].forEach(s=>notes.append(el('li','percentile-note',s)));
  section.append(notes);
  section.append(el('p','percentile-note','자료 기준: 2026.10.31 · 2025 전국백분위 재산출'));
  return section;
 }
 // Canonical card tree. Lv.0 opens the public report; authenticated tiers
 // toggle in-card details. All three tiers have identical visual structure.
 function createCard(school,{level=0,percentile}={}){
  if(!Number.isInteger(level)||level<0||level>2)throw Error('INVALID_CARD_LEVEL');
  if(!school||!/^\d{7}$/.test(String(school.school_id)))throw Error('INVALID_SCHOOL_ID');
  const card=el('article','school-card');
  card.dataset.schoolId=String(school.school_id);
  card.dataset.accessLevel=String(level);
  addHeader(card,school);
  if(!percentile||!percentile.classList?.contains('percentile-panel'))throw Error('INVALID_PERCENTILE_PANEL');
  card.append(percentile);
  const actions=el('div','school-actions');
  const open=el(level===0?'a':'button','view-button','🔍 연도별 상세 기록 보기');
  let detail=null;
  if(level===0){
   open.classList.add('school-button');
   open.href='school-report.html?school_id='+encodeURIComponent(String(school.school_id));
   open.setAttribute('aria-label',String(school.school_name||'학교')+' 연도별 상세 기록 보기');
  }else{
   open.type='button';
   open.setAttribute('aria-expanded','false');
   open.setAttribute('aria-label','Lv.'+level+' 연도별 상세 기록 보기');
   detail=el('section','school-detail');
   detail.id='beagu-school-detail-'+level+'-'+String(school.school_id);
   detail.hidden=true;
   detail.setAttribute('aria-label',String(school.school_name||'학교')+' 상세정보');
   open.setAttribute('aria-controls',detail.id);
  }
  actions.append(open);
  card.append(actions);
  if(detail)card.append(detail);
  return {card,open,detail};
 }
 window.BeaguSchoolSearchCard=Object.freeze({addHeader,percentiles,createCard,STATES});
})();
