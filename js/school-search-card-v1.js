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
  const nameHeading=el('div','school-name');
  const views=el('span','school-view-count');
  views.dataset.schoolViewCount='';
  views.dataset.schoolId=String(school.school_id);
  views.title='학교 상세 열람 조회수 · 하루 중복 제외';
  views.setAttribute('aria-label','학교 상세 조회수 확인 중');
  const eye=el('span','school-view-eye');
  eye.setAttribute('aria-hidden','true');
  views.append(eye,el('strong','school-view-number','—'));
  nameHeading.append(el('span','school-name-text',name),views);
  card.append(el('span','region-badge',region),nameHeading,meta);
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
  return section;
 }
 // Canonical card tree. Lv.0 opens the public report; authenticated tiers
 // toggle in-card details. All three tiers have identical visual structure.
 // The chosen sort metric is the first school fact in every search card.
 // Authorization is server-side; this presentation also denies cross-tier fields.
 function addSortPrimary(card,school,sortBy,level){
  const key=String(sortBy||'school_name').replace(/_(?:asc|desc)$/,'');
  if(key==='school_name'||(level===0&&key!=='address')||
     (level<2&&key==='housing_price_won'))return;
  const numeric=(value,suffix,options={})=>{
   if(value===null||value===undefined||value===''||
      !Number.isFinite(Number(value))||Number(value)<0)return '자료 없음';
   return Number(value).toLocaleString('ko-KR',options)+suffix;
  };
  let label='',value='';
  switch(key){
   case 'address': label='주소';value=String(school.address||'').trim()||'자료 없음';break;
   case 'student_count':
    label='학생 수'+(Number.isInteger(Number(school.student_reference_year))&&
      Number(school.student_reference_year)>2000?' ('+school.student_reference_year+'년 기준)':'');
    value=numeric(school.student_count,'명');break;
   case 'beagu_percentile_2025':
    label='2025 배구지수';value=numeric(school.beagu_percentile_2025,'%',{maximumFractionDigits:2});break;
   case 'view_count':
    label='학교 조회수';value=numeric(school.view_count,'회');break;
   case 'junior_teacher_ratio':
    label='2급 정교사 비율';value=numeric(school.junior_teacher_ratio,'%',{maximumFractionDigits:2});break;
   case 'male_teacher_ratio':
    label='남교사 비율';value=numeric(school.male_teacher_ratio,'%',{maximumFractionDigits:2});break;
   case 'housing_price_won':
    label='행정동 공동주택 평균 공시가격';value=numeric(school.housing_price_won,'원');break;
   default:return;
  }
  const primary=el('div','school-sort-primary');
  primary.dataset.sortKey=key;
  primary.append(el('span','school-sort-primary-label',label),
                 el('strong','school-sort-primary-value',value));
  card.querySelector('.school-name').after(primary);
 }
 function createCard(school,{level=0,percentile,sortBy='school_name'}={}){
  if(!Number.isInteger(level)||level<0||level>2)throw Error('INVALID_CARD_LEVEL');
  if(!school||!/^[A-Z0-9]{7}$/.test(String(school.school_id)))throw Error('INVALID_SCHOOL_ID');
  const card=el('article','school-card');
  card.dataset.schoolId=String(school.school_id);
  card.dataset.accessLevel=String(level);
  addHeader(card,school);
  addSortPrimary(card,school,sortBy,level);
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
  const postit=el('a','postit-quick-link postit-lv2-link','▤ 포스트잇');
  postit.href='postit.html?school_id='+encodeURIComponent(String(school.school_id));
  postit.setAttribute('aria-label',String(school.school_name||'학교')+' 포스트잇 열람 · 작성은 Lv.2부터');
  const experience=el('a','court-school-experience','학교체험');
  experience.href='teacher-volleyball.html?school_id='+encodeURIComponent(String(school.school_id));
  experience.setAttribute('aria-label',String(school.school_name||'학교')+' 학교체험 · 선생님배구');
  actions.append(open,postit,experience);
  card.append(actions);
  if(detail)card.append(detail);
  return {card,open,detail,experience};
 }
 window.BeaguSchoolSearchCard=Object.freeze({addHeader,percentiles,createCard,STATES});
})();
