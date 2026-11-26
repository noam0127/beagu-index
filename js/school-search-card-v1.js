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
  const flag=el('button','school-data-report','🚩 자료신고');flag.type='button';flag.title='2026 자료 신고';flag.setAttribute('aria-label',name+' 자료 신고');flag.style.cssText='border:0;background:transparent;padding:6px;cursor:pointer;font-size:12px;line-height:1.4;color:inherit';
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
  views.title='검색 + 상세조회 · 각각 하루 1회';
  views.setAttribute('aria-label','검색 및 상세조회 합계 확인 중');
  const eye=el('span','school-view-eye');
  eye.setAttribute('aria-hidden','true');
  views.append(eye,el('strong','school-view-number','—'));
  const right=el('div','glory-header-meta school-count-pair');
  const heart=window.BeaguSchoolLikes?.create(String(school.school_id));
  if(heart)right.append(heart);right.append(views);
  nameHeading.append(el('span','school-name-text',name),right);
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
 function historicalMean(publicValues=[],common2026=null){
  const values=[...publicValues.slice(0,3),common2026].filter(valid);
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
 }
 function meanPanel(section,publicValues,common2026,publicError){
  const value=historicalMean(publicValues,common2026),row=el('div','glory-score-row');
  section.dataset.displayYear='average';section.setAttribute('aria-label','역대 배구지수 평균');
  section.append(el('h3','percentile-heading','역대 배구지수 평균'));
  row.append(el('strong','glory-score',value===null?(publicError?'불러오기 실패':'자료 없음'):value.toFixed(1)+'%'));
  if(value!==null){const track=el('div','glory-track'),fill=el('span','glory-fill');track.setAttribute('role','progressbar');track.setAttribute('aria-label','역대 배구지수 평균');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(value));fill.style.width=value+'%';track.append(fill);row.append(track);}
  section.append(row);
  return section;
 }
 function percentiles({publicValues=[],statuses=[],publicError=false,value2026=null,common2026=null,
   status2026='unpublished',locked=false,viewerTier=null}={}){
  const section=el('section','percentile-panel glory-percentile');
  // Identical representative mean for authenticated tiers; Lv2 retains the four-year breakdown.
  if(viewerTier===1){section.dataset.publishedYears=[2023,2024,2025].filter((y,i)=>valid(publicValues[i])).concat(!locked&&valid(value2026)?[2026]:[]).join(',');return meanPanel(section,publicValues,locked?null:common2026,publicError);}
  if(viewerTier===2){
   const current=!locked&&valid(value2026)?value2026:null;
   const values=[current,...[2,1,0].map(i=>valid(publicValues[i])?publicValues[i]:null)];
   const years=[2026,2025,2024,2023];
   const first=values.findIndex(v=>v!==null),latest=first<0?0:first;
   section.dataset.displayYear=String(years[latest]);
   section.dataset.publishedYears=years.filter((_,i)=>values[i]!==null).slice().reverse().join(',');
   section.setAttribute('aria-label','2026~2023 배구지수 백분위');
   meanPanel(section,publicValues,locked?null:common2026,publicError);
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
    row.append(track,el('strong','glory-year-value',value===null?labelFor(i===0?(locked?STATES.LOCKED:status2026):publicState(statuses[3-i],publicError)):value.toFixed(1)+'%'));
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
 function formatHousingPrice(value){
  if(value===null||value===undefined||value==='')return '자료 없음';
  const raw=typeof value==='number'?value:Number(String(value).replace(/[,\s]/g,'').replace(/원$/,''));
  if(!Number.isFinite(raw)||raw<=0)return '자료 없음';
  const rounded=Math.round(raw/1000000),eok=Math.floor(rounded/100),million=rounded%100;
  return eok?(million?eok+'억'+million+'백만원':eok+'억원'):million+'백만원';
 }
 function addFacts(card,school,level){
  const facts=el('div','glory-facts');
  for(const [label,key,suffix] of [['학생 수','student_count','명'],['교원 수','teacher_total','명'],['남교사 비율','male_teacher_ratio','%'],['2급 정교사 비율','junior_teacher_ratio','%']]){
   const item=el('div','glory-fact');
   const n=school[key];
   const allowed=level>=1&&n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))&&Number(n)>=0&&(suffix!=='%'||Number(n)<=100);
   item.dataset.factKey=key;
   item.append(el('span','glory-fact-label',label),el('strong','glory-fact-value',allowed?Number(n).toLocaleString('ko-KR',{maximumFractionDigits:1})+suffix:level===0?'Lv.1+':'자료 없음'));
   facts.append(item);
  }
  if(level>=2){
   const item=el('div','glory-fact');item.dataset.factKey='housing_price_won';
   item.append(el('span','glory-fact-label','공시가격'),el('strong','glory-fact-value',formatHousingPrice(school.housing_price_won)));
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
  if(key==='school_name'||(level>=1&&key==='beagu_percentile_2025')||['student_count','male_teacher_ratio','junior_teacher_ratio'].includes(key)||(level===0&&key!=='address')||
     (['housing_price_won','game_points'].includes(key)))return;
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
    label='행정동 공동주택 평균 공시가격';value=formatHousingPrice(school.housing_price_won);break;
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
  badge.append(el('span','beagu-mbti-label','학교 MBTI(응답 유형)'),el('strong','beagu-mbti-text',level===0?'Lv.1+':'확인 중'));
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
  const ranked=Object.prototype.hasOwnProperty.call(school,'game_points');
  const known=Number.isSafeInteger(school.game_points)&&school.game_points>=0;
  const amount=el('strong','glory-points-value',level<1?'Lv.1+':known?school.game_points.toLocaleString('ko-KR')+' P':ranked?'자료 없음':'—');
  if(level>=1&&!ranked)amount.dataset.schoolGamePoints=String(school.school_id);
  points.append(el('span','glory-points-label','🏆 학교 누적 게임포인트'),amount);
  card.append(points,el('div','glory-record-years'));
  updateRecordedYears(card,[]);
  if(detail)card.append(detail);
  const publishedYears=(percentile.dataset.publishedYears||'').split(',');
  const metadata=publishedYears.filter(y=>/^(2023|2024|2025|2026)$/.test(y)).map(y=>y+'년: '+(y==='2025'?'백분위 비교 모집단 1,458개교':'비교 모집단 수 미확인')).join(' · ');
  if(metadata)card.append(el('p','beagu-survey-meta',metadata));
  card.append(el('p','beagu-survey-limit',"본 수치는 익명·자발적 설문 응답을 바탕으로 산출된 인식조사 결과입니다. 응답자의 교원 신분과 실제 학교 소속이 확인되지 않았을 수 있으며, 해당 학교 전체의 교직문화를 대표하지 않습니다. 백분위와 순위는 해당 연도 산출 대상 학교 간 조사값의 상대적 위치이며, 개별 사실의 확인이나 학교·교직원의 우열을 판정한 결과가 아닙니다."));
  const stories=window.BeaguLockerSchoolLinks?.create(String(school.school_id));if(stories)card.append(stories);
  return {card,open,detail,experience};
 }
 window.BeaguSchoolSearchCard=Object.freeze({addHeader,createReportFlag,percentiles,historicalMean,createCard,updateRecordedYears,formatHousingPrice,STATES});
})();
