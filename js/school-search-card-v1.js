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
 function createReportFlag(school){
  const name=school.school_name||'학교명 없음';
  const flag=el('button','school-data-report','🚩');flag.type='button';flag.title='2026 자료 신고';flag.setAttribute('aria-label',name+' 자료 신고');flag.style.cssText='border:0;background:transparent;padding:4px;cursor:pointer;font-size:16px;line-height:1';
  flag.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();
   const detail=window.prompt('자료 신고 사유 (12~500자, 개인정보·실명 제외)');
   if(detail===null)return;const reason=detail.trim();if(reason.length<12||reason.length>500){window.alert('신고 사유를 12~500자로 입력해 주세요.');return;}
   flag.disabled=true;
   try{let nonce;try{nonce=sessionStorage.getItem('beagu-civic-device-v1');if(!nonce){nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');sessionStorage.setItem('beagu-civic-device-v1',nonce);}}catch{nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}
    const res=await fetch('https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-2026-civic',{method:'POST',cache:'no-store',headers:{'content-type':'application/json','x-beagu-client':nonce},body:JSON.stringify({action:'simple_report',school_id:String(school.school_id),detail:reason})});
    if(!res.ok)throw Error('report');window.alert('신고가 접수되었습니다.');
   }catch{window.alert('신고 접수 실패. 잠시 후 다시 시도해 주세요.');}finally{flag.disabled=false;}
  });
  return flag;
 }
 function addHeader(card,school){
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
  const right=el('div','glory-header-meta');
  right.append(views);
  const flag=createReportFlag(school);
  const heart=window.BeaguSchoolLikes?.create(String(school.school_id));
  nameHeading.append(el('span','school-name-text',name),flag);if(heart)nameHeading.append(heart);nameHeading.append(right);
  card.append(nameHeading,meta);
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
   status2026='unpublished',locked=false,viewerTier=null}={}){
  const section=el('section','percentile-panel glory-percentile');
  // Lv0/Lv1 keep the 2025 card. Lv2 displays all four years, without inventing zeros.
  if(viewerTier===2){
   const current=!locked&&valid(value2026)?value2026:null;
   const values=[current,...[2,1,0].map(i=>valid(publicValues[i])?publicValues[i]:null)];
   const years=[2026,2025,2024,2023];
   const first=values.findIndex(v=>v!==null),latest=first<0?0:first;
   section.dataset.displayYear=String(years[latest]);
   section.dataset.publishedYears=years.filter((_,i)=>values[i]!==null).slice().reverse().join(',');
   section.setAttribute('aria-label','2026~2023 배구지수 백분위');
   section.append(el('h3','percentile-heading',years[latest]+' 배구지수'));
   const group=el('div','glory-four-year');
   years.forEach((year,i)=>{
    const value=values[i],row=el('div','glory-year-row');
    row.dataset.year=String(year);
    row.append(el('span','glory-year-label',year));
    const track=el('div','glory-track');
    if(value!==null){
     const fill=el('span','glory-fill');
     fill.style.width=value+'%';
     track.setAttribute('role','progressbar');
     track.setAttribute('aria-label',year+'년 배구지수 백분위');
     track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(value));
     track.append(fill);
    }else{track.classList.add('glory-track-missing');track.setAttribute('aria-hidden','true');}
    row.append(track,el('strong',i===latest?'glory-year-value glory-score':'glory-year-value',value===null?labelFor(i===0?(locked?STATES.LOCKED:status2026):publicState(statuses[3-i],publicError)):value.toFixed(1)+'%'));
    group.append(row);
   });
   section.append(group);
   return section;
  }
  const current=!locked&&viewerTier!==0&&viewerTier!==1&&valid(value2026)?value2026:null;
  const historical=viewerTier===0||viewerTier===1;
  const fallback=viewerTier===2?[2,1,0].find(i=>valid(publicValues[i])):2;
  const year=historical?2023+(fallback??2):2026;
  const value=historical?(valid(publicValues[fallback])?publicValues[fallback]:null):current;
  section.dataset.displayYear=String(year);
  section.setAttribute('aria-label',year+' 배구지수 백분위');
  section.dataset.publishedYears=[2023,2024,2025].filter((y,i)=>valid(publicValues[i])).concat(current!==null?[2026]:[]).join(',');
  section.append(el('h3','percentile-heading',year+' 배구지수'));
  const row=el('div','glory-score-row');
  row.append(el('strong','glory-score',value===null?labelFor(historical?publicState(statuses[fallback??2],publicError):(locked?STATES.LOCKED:status2026)):value.toFixed(1)+'%'));
  if(value!==null){
   const track=el('div','glory-track'),fill=el('span','glory-fill');
   track.setAttribute('role','progressbar');track.setAttribute('aria-label','배구지수 백분위');
   track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
   track.setAttribute('aria-valuenow',String(value));fill.style.width=value+'%';
   track.append(fill);row.append(track);
  }
  section.append(row);
  if(viewerTier===2&&historical)section.append(el('p','glory-fallback-note','2026 배구지수 · '+labelFor(status2026)));
  return section;
 }
 function updateRecordedYears(card,years){
  const footer=card.querySelector('.glory-record-years');
  if(!footer)return;
  if(Array.isArray(years))footer.dataset.knownYears=years.join(',');
  const merged=[...new Set(((footer.dataset.knownYears||'')+','+(card.querySelector('.percentile-panel')?.dataset.publishedYears||'')).split(',').filter(y=>/^(2023|2024|2025|2026)$/.test(y)))].sort();
  footer.textContent='조사기록 '+(merged.length?merged.join(' · '):'확인된 기록 없음');
 }
 function addFacts(card,school,level){
  const facts=el('div','glory-facts');
  for(const [label,key,suffix] of [['학생 수','student_count','명'],['남교원 비율','male_teacher_ratio','%'],['2급 정교사 비율','junior_teacher_ratio','%']]){
   const item=el('div','glory-fact');
   const n=school[key];
   const allowed=level>=1&&n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))&&Number(n)>=0&&(suffix!=='%'||Number(n)<=100);
   item.dataset.factKey=key;
   item.append(el('span','glory-fact-label',label),el('strong','glory-fact-value',allowed?Number(n).toLocaleString('ko-KR',{maximumFractionDigits:1})+suffix:level===0?'Lv.1+':'자료 없음'));
   facts.append(item);
  }
  card.append(facts);
 }
 // Canonical card tree. Lv.0 opens the public report; authenticated tiers
 // toggle in-card details. All three tiers have identical visual structure.
 // The chosen sort metric is the first school fact in every search card.
 // Authorization is server-side; this presentation also denies cross-tier fields.
 function addSortPrimary(card,school,sortBy,level){
  const key=String(sortBy||'school_name').replace(/_(?:asc|desc)$/,'');
  if(key==='school_name'||['student_count','male_teacher_ratio','junior_teacher_ratio'].includes(key)||(level===0&&key!=='address')||
     (level<1&&key==='housing_price_won'))return;
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
  const card=el('article','school-card school-glory-card');
  card.dataset.schoolId=String(school.school_id);
  card.dataset.accessLevel=String(level);
  addHeader(card,school);
  addSortPrimary(card,school,sortBy,level);
  if(!percentile||!percentile.classList?.contains('percentile-panel'))throw Error('INVALID_PERCENTILE_PANEL');
  card.append(percentile);
  addFacts(card,school,level);
  const actions=el('div','school-actions glory-actions');
  const mbti=el('div','glory-mbti-slot');
  const badge=el('div','beagu-mbti-badge');
  badge.append(el('span','beagu-mbti-label','학교 MBTI'),el('strong','beagu-mbti-text',level===0?'Lv.1+':'확인 중'));
  mbti.append(badge);
  const open=el(level===0?'a':'button','view-button','상세조회');
  let detail=null;
  if(level===0){
   open.classList.add('school-button');
   open.href='school-report.html?school_id='+encodeURIComponent(String(school.school_id));
   open.setAttribute('aria-label',String(school.school_name||'학교')+' 연도별 상세 기록 보기');
  }else{
   open.type='button';
   open.classList.add('glory-detail-trigger');
   open.setAttribute('aria-expanded','false');
   open.setAttribute('aria-label','Lv.'+level+' 연도별 상세 기록 보기');
   detail=el('section','school-detail');
   detail.id='beagu-school-detail-'+level+'-'+String(school.school_id);
   detail.hidden=true;
   detail.setAttribute('aria-label',String(school.school_name||'학교')+' 상세정보');
   open.setAttribute('aria-controls',detail.id);
  }
  const experience=el('a','court-school-experience','학교체험');
  const game=level===0?'teacher-volleyball.html':'teacher-run.html';
  experience.href=game+'?school_id='+encodeURIComponent(String(school.school_id));
  experience.setAttribute('aria-label',String(school.school_name||'학교')+' 학교체험 · '+(level===0?'선생님배구':'험난한 교직생활'));
  actions.append(mbti,open,experience);
  card.append(actions);
  const points=el('div','glory-points');
  const amount=el('strong','glory-points-value','—');
  amount.dataset.schoolGamePoints=String(school.school_id);
  points.append(el('span','glory-points-label','🏆 학교 누적 게임포인트'),amount);
  card.append(points,el('div','glory-record-years'));
  updateRecordedYears(card,[]);
  if(detail)card.append(detail);
  return {card,open,detail,experience};
 }
 window.BeaguSchoolSearchCard=Object.freeze({addHeader,createReportFlag,percentiles,createCard,updateRecordedYears,STATES});
})();
