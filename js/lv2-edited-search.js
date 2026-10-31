/* Beagu Lv.2 approved school detail viewer -- 4-3 release, 2026-10-27.
 * This file contains no school-specific protected data or access credentials.
 * The server is the source of truth for eligibility and approved field values.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const base=`${SUPABASE_URL}/functions/v1`;
const sessKey='beagu-level-session-v1';
let token=sessionStorage.getItem(sessKey)||'';
let mode='school',page=0,serial=0,debounce;
const LIMIT=20;
const officeNames={
 '서울':'강남서초 강동송파 강서양천 남부 동부 동작관악 북부 서부 성동광진 성북강북 중부',
 '부산':'남부 동래 북부 서부 해운대',
 '대구':'군위 남부 달성 동부 서부',
 '인천':'강화 남부 동부 북부 서부',
 '광주':'동부 서부','대전':'동부 서부','울산':'강남 강북','세종':'세종',
 '경기':'가평 고양 광명 광주하남 구리남양주 군포의왕 김포 동두천양주 부천 성남 수원 시흥 안산 안성 안양과천 양평 여주 연천 용인 의정부 이천 파주 평택 포천 화성오산',
 '강원':'강릉 고성 동해 삼척 속초양양 양구 영월 원주 인제 정선 철원 춘천 태백 평창 홍천 화천 횡성',
 '충북':'괴산증평 단양 보은 영동 옥천 음성 제천 진천 청주 충주',
 '충남':'공주 금산 논산계룡 당진 보령 부여 서산 서천 아산 예산 천안 청양 태안 홍성',
 '전북':'고창 군산 김제 남원 무주 부안 순창 완주 익산 임실 장수 전주 정읍 진안',
 '전남':'강진 고흥 곡성 광양 구례 나주 담양 목포 무안 보성 순천 신안 여수 영광 영암 완도 장성 장흥 진도 함평 해남 화순',
 '경북':'경산 경주 고령 구미 김천 문경 봉화 상주 성주 안동 영덕 영양 영주 영천 예천 울릉 울진 의성 청도 청송 칠곡 포항',
 '경남':'거제 거창 고성 김해 남해 밀양 사천 산청 양산 의령 진주 창녕 창원 통영 하동 함안 함양 합천',
 '제주':'서귀포시 제주시'
};
const prefixes={
 '서울':'서울특별시','부산':'부산광역시','대구':'대구광역시','인천':'인천광역시',
 '광주':'전남광주통합특별시광주','대전':'대전광역시','울산':'울산광역시',
 '경기':'경기도','강원':'강원특별자치도','충북':'충청북도',
 '충남':'충청남도','전북':'전북특별자치도','전남':'전남광주통합특별시',
 '경북':'경상북도','경남':'','제주':''
};
const el=(tag,cls,text)=>{
 const d=document.createElement(tag);if(cls)d.className=cls;
 if(text!==undefined)d.textContent=String(text);return d;
};
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);

/* These keys mirror the vetted outputs of beagu-edited-api-v1 (v4).
 * This is defense-in-depth in the UI, NOT authorization. Keep server allowlist and
 * access-code/session checks in place. Never render arbitrary JSON from the API. */
const RELEASED_KEYS=Object.freeze({
 2023:new Set(['A','B','C','F']),
 2024:new Set(['A','B','C','E','G','N','AI','BN','AF','AG','AP','AR','AX','AY']),
 2025:new Set(['A','B','C','D','F','G','H','I','J','K','L','N','O','P','R','S','T'])
});
const APPROVED_LABELS=Object.freeze({
 2023:{F:'전국 백분위'},
 2024:{BN:'전국 백분위'},
 2025:{
   AC:'학교 만족도 (요약)',AE:'학생·학부모 문화 (영역 집계)',
   AI:'교직원 문화 (영역 집계)',AM:'조직운영 (영역 집계)',
   AQ:'업무부하 (영역 집계)',AU:'교직관행 (영역 집계)',
   AY:'체험학습 관행 (영역 집계)',BC:'복무관행 (영역 집계)',
   BG:'학교환경 (영역 집계)'
  }
});
function releasedFields(metadata,year,values){
 const fields=metadata?.years?.[String(year)];
 if(!Array.isArray(fields)||!values||typeof values!=='object'||Array.isArray(values))return [];
 const allow=RELEASED_KEYS[year];if(!allow)return [];
 return fields.filter(f=>f&&allow.has(f.key)&&own(values,f.key)&&
   values[f.key]!==null&&values[f.key]!==undefined&&values[f.key]!==''&&
   (typeof values[f.key]==='string'||typeof values[f.key]==='number'||typeof values[f.key]==='boolean'));
}
/* Schema is at repository ROOT, not /data. The schema contains labels only. */
const schemaPromise=fetch('lv2-edited-column-schema.json',{cache:'force-cache'})
 .then(r=>{if(!r.ok)throw Error('SCHEMA_MISSING');return r.json()})
 .then(j=>{if(!j||typeof j.years!=='object')throw Error('SCHEMA_INVALID');return j});
let percentIndex=new Map(),publicStaticAvailable=false,publicLoadError=false;
let current2026=new Map();
const publicPromise=fetch('data/public-lv0-percentiles-v1.2.json?v=20261031-empirical2025')
 .then(r=>{if(!r.ok)throw Error('PUBLIC_DATA_MISSING');return r.json()})
 .then(j=>{if(window.BeaguPublic){percentIndex=BeaguPublic.buildIndex(j);publicStaticAvailable=true;}})
 .catch(e=>{console.warn('Lv.2 정적 백분위 파일 미응답, DB 조회 사용',e)});
async function recoverPublicPercentiles(schools){
 if(publicStaticAvailable||!schools.length)return;
 const ids=[...new Set(schools.map(s=>String(s.school_id))
  .filter(id=>id.length===7&&[...id].every(c=>c>='0'&&c<='9')))];
 if(!ids.length)return;
 const {data,error}=await supabaseClient.from('beagu_school_report_yearly')
  .select('school_id,survey_year,percentile').in('school_id',ids)
  .eq('publication_status','PUBLISHED').in('survey_year',[2023,2024,2025]).limit(100);
 if(error)throw error;
 for(const id of ids){
  const vals=[null,null,null];
  for(const row of data||[]){
   if(String(row.school_id)!==id||row.percentile===null)continue;
   const i=[2023,2024,2025].indexOf(Number(row.survey_year)),v=Number(row.percentile);
   if(i>=0&&Number.isFinite(v)&&v>=0&&v<=100)vals[i]=v;
  }
  percentIndex.set(id,{percentiles:vals,statuses:vals.map(v=>v===null?'NO_PUBLISHED_VALUE':'EXISTING_PUBLIC_VALUE_PRESERVED')});
 }
 publicLoadError=false;
}
async function api(path,action,payload={}){
 const response=await fetch(`${base}/${path}`,{
  method:'POST',cache:'no-store',
  headers:{'Content-Type':'application/json','X-Beagu-Session':token},
  body:JSON.stringify({action,...payload})
 });
 const data=await response.json().catch(()=>({}));
 if([401,403].includes(response.status)){
  const e=Error('AUTH_REQUIRED');e.unauthorized=true;throw e;
 }
 if(!response.ok)throw Error(data.error||`HTTP_${response.status}`);
 return data;
}
function logout(message=''){
 token='';sessionStorage.removeItem(sessKey);
 $('searchPanel').hidden=true;$('loginPanel').hidden=false;
 $('loginMessage').textContent=message;
}
function showSearch(){$('loginPanel').hidden=true;$('searchPanel').hidden=false;}
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();$('loginButton').disabled=true;$('loginMessage').textContent='서버 인증 중…';
 try{
  const data=await api('beagu-level-api','login',{code:$('levelCode').value.trim()});
  if(data.level<2){$('loginMessage').textContent='Lv.2 인증코드가 아닙니다.';return;}
  token=data.token;sessionStorage.setItem(sessKey,token);
  $('levelCode').value='';showSearch();$('searchInput').focus();
 }catch(e){$('loginMessage').textContent='참여코드를 확인해주세요.';}
 finally{$('loginButton').disabled=false;}
});
$('logoutButton').addEventListener('click',()=>logout());
function modeTo(m){
 mode=m;$('schoolPanel').hidden=m!=='school';$('regionPanel').hidden=m!=='region';
 $('schoolTab').setAttribute('aria-selected',String(m==='school'));
 $('regionTab').setAttribute('aria-selected',String(m==='region'));search(true);
}
$('schoolTab').addEventListener('click',()=>modeTo('school'));
$('regionTab').addEventListener('click',()=>modeTo('region'));
$('searchInput').addEventListener('input',()=>{
 clearTimeout(debounce);debounce=setTimeout(()=>search(true),250);
});
$('regionSelect').addEventListener('change',()=>{
 const region=$('regionSelect').value,o=$('officeSelect');
 o.replaceChildren(new Option(region?'전체 교육지원청':'시도를 먼저 선택하세요',''));
 o.disabled=!region;
 if(region==='재외한국학교')["일본","중국","대만","베트남","사우디아라비아","인도네시아","싱가포르","태국","필리핀","파라과이","아르헨티나","러시아","이란","이집트","말레이시아","캄보디아"].forEach(x=>o.add(new Option(x,x)));
 else if(region==='세종')o.add(new Option('세종시교육청','세종특별자치시교육청'));
 else if(region){
  (officeNames[region]||'').split(' ').filter(Boolean).forEach(x=>
   o.add(new Option(x,(prefixes[region]||'')+x+'교육지원청')));
  if(region==='경남')for(const [a,b] of [
   ['마산 (과거 분류)','마산교육청(폐지)'],
   ['진해 (과거 분류)','진해교육청(폐지)'],
   ['창원 (과거 분류)','창원교육청(폐지)']
  ])o.add(new Option(a,b));
 }
 search(true);
});
$('officeSelect').addEventListener('change',()=>search(true));
$('prevPage').addEventListener('click',()=>{page=Math.max(0,page-1);search(false);});
$('nextPage').addEventListener('click',()=>{page++;search(false);});
function note(t){return el('p','year-note',t);}

function metrics2026(rows){
 return (Array.isArray(rows)?rows:[]).filter(r=>Number(r.year)===2026&&[1,2].includes(Number(r.access_level)))
  .flatMap(r=>Array.isArray(r.summary?.metrics)?r.summary.metrics:[])
  .filter(m=>typeof m?.label==='string'&&(typeof m.value==='number'||typeof m.value==='string')&&!/응답|관측|표본|횟수|회수/i.test(m.label));
}
function percentile2026(rows){
 for(const m of metrics2026((Array.isArray(rows)?rows:[]).filter(r=>Number(r.access_level)===1))){
  if(m.key!=='percentile')continue;
  const n=Number(m.value);if(Number.isFinite(n)&&n>=0&&n<=100)return n;
 }return null;
}
function percentilePanel(school){
 const id=String(school.school_id),info=percentIndex.get(id),current=current2026.get(id);
 return BeaguSchoolSearchCard.percentiles({
   publicValues:window.BeaguPublic?BeaguPublic.values(info):[null,null,null],
   statuses:info?.statuses||[],
   publicError:publicLoadError,
   value2026:current?.value??null,
   status2026:current?.status||'loading',
   locked:false
 });
}
function renderPagePercentiles(results,requestId){
 const ids=[...new Set(results.map(s=>String(s.school_id)).filter(id=>/^\d{7}$/.test(id)))];
 if(!ids.length)return;
 const refresh=()=>{
  if(serial!==requestId)return;
  for(const school of results){
   for(const card of $('results').querySelectorAll('.school-card')){
    if(card.dataset.schoolId!==String(school.school_id))continue;
    const pane=card.querySelector('.percentile-panel');
    if(pane)pane.replaceWith(percentilePanel(school));
    break;
   }
  }
 };
 publicPromise.then(async()=>{
  if(!publicStaticAvailable){
   try{await recoverPublicPercentiles(results);}
   catch(e){publicLoadError=true;console.warn('Lv.2 공개 백분위 DB 재조회 실패',e)}
  }
  refresh();
 }).catch(e=>{publicLoadError=true;console.warn('Lv.2 공개 백분위 로딩 실패',e);refresh();});
 api('beagu-level-api','percentiles',{schoolIds:ids}).then(response=>{
  if(serial!==requestId)return;
  for(const id of ids){
   const n=response.values?.[id];
   current2026.set(id,typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100
    ?{status:'published',value:n}:{status:'unpublished'});
  }
  refresh();
 }).catch(e=>{
  if(serial!==requestId)return;
  if(e.unauthorized){logout('인증이 만료되었습니다. 다시 로그인하세요.');return;}
  for(const id of ids)current2026.set(id,{status:'error'});
  refresh();
 });
}
function renderRecords(root,records,metadata,year){
 root.replaceChildren();
 const rows=Array.isArray(records)?records.filter(r=>Number(r.year)===year):[];
 if(!rows.length){
  root.append(el('div','pending',`${year}년 상세자료 미공개 · 현재 승인된 자료가 없습니다.`));return;
 }
 rows.forEach((record,i)=>{
  const values=record.values&&typeof record.values==='object'&&!Array.isArray(record.values)?record.values:{};
  const fields=releasedFields(metadata,year,values);
  // The API now contains only verified official facts and published annual percentiles.
  // Show fixed-indicator data; the old filter hid almost every real numeric value.
  const visibleFields=fields;
  if(!fields.length){
   root.append(el('div','pending',`${year}년 상세항목 미공개 · 표시 가능한 승인값이 없습니다.`));return;
  }
  const suffix=rows.length>1?` · 기록 ${i+1}/${rows.length}`:'';
  root.append(note(`${year}년 · 공개 승인 자료${suffix}`));
  let sectionName='',currentSection=null,subName='';
  for(const field of visibleFields){
   const group=field.section||'기타';
   if(group!==sectionName){
    currentSection=el('section','section-card');
    currentSection.append(el('h4','',year===2025&&group==='4. 2025 배구지수 요약'?'2. 2025 배구지수 요약':group));root.append(currentSection);
    sectionName=group;subName='';
   }
   const sub=field.subsection||'';
   if(sub&&sub!==subName){currentSection.append(el('div','subheading',sub));subName=sub;}
   const item=el('div','item'),label=el('div','name');
   const title=APPROVED_LABELS[year]?.[field.key]||field.title||field.key;
   label.append(el('span','source-col',field.key),document.createTextNode(title));
   const value=el('div','val',String(values[field.key]));
   item.append(label,value);currentSection.append(item);
  }
  if(record.release_note&&typeof record.release_note==='string')
   root.append(note(record.release_note));
 });
}
async function showDetail(container,school){
 container.replaceChildren();
 let response,metadata,levelData;
 try{
  [response,metadata,levelData]=await Promise.all([
   api('beagu-edited-api-v1','school',{schoolId:school.school_id}),
   schemaPromise,
   api('beagu-level-api','school',{schoolId:school.school_id})
  ]);
  await publicPromise;
  if(!publicStaticAvailable){
   try{await recoverPublicPercentiles([school]);}
   catch(e){console.warn('Lv.2 상세 화면 백분위 DB 조회 실패',e)}
  }
 }catch(e){
  if(e.unauthorized){logout('인증이 만료되었습니다. 다시 로그인하세요.');return false;}
  container.append(el('div','pending','상세자료를 불러오지 못했습니다. 다시 시도해주세요.'));
  return false;
 }
 container.append(el('h3','school-history-heading','Lv.2 승인 학교 상세정보'));
 const tabbar=el('div','year-tabs');tabbar.setAttribute('role','tablist');
 tabbar.setAttribute('aria-label','과거 조사 연도 선택');
 const body=el('div','school-year-details');body.setAttribute('role','tabpanel');
 const years=[2023,2024,2025];
 function choose(year){
  [...tabbar.children].forEach(b=>b.setAttribute('aria-selected',String(Number(b.dataset.year)===year)));
  renderRecords(body,response.rows,metadata,year);
 }
 years.forEach(y=>{
  const b=el('button','',String(y)+'년');b.type='button';b.dataset.year=String(y);
  b.setAttribute('role','tab');b.addEventListener('click',()=>choose(y));tabbar.append(b);
 });
 const firstAvailable=[2025,2024,2023].find(year=>
  (Array.isArray(response.rows)?response.rows:[]).some(record=>
   Number(record.year)===year&&releasedFields(metadata,year,record.values).length>0));
 choose(firstAvailable||2025);
 container.append(el('h3','school-history-heading','과거 상세자료'),tabbar,body);
 container.append(el('h3','school-history-heading','2026년 최신 조사 결과'));
  const newer=el('div','year-2026-content');newer.hidden=false;
  const stats=metrics2026(levelData.rows);
  if(!stats.length)newer.append(note('미공개 · 2026년 승인된 학교별 통계가 없습니다.'));
  else stats.forEach(m=>{
   const row=el('div','data-row');row.append(el('span','',m.label),el('strong','',String(m.value)+(m.unit||'')));newer.append(row);
  });
  container.append(newer);
  if(window.BeaguSchoolMBTI)container.append(BeaguSchoolMBTI.createDetail(String(school.school_id),token));

  container.append(note('표시 순서는 2023 → 2024 → 2025 → 2026이며 각 연도는 별도의 조사 기준을 적용합니다.'));
 container.append(note('연도마다 문항과 집계 방식이 다릅니다. 백분위 및 영역별 수치를 동일 척도로 직접 비교하지 마세요.'));
 return true;
}
function render(results,total){
 current2026=new Map();
 const host=$('results');host.replaceChildren();const pages=Math.ceil(total/LIMIT);
 $('resultCount').textContent=`검색 결과 ${total.toLocaleString()}개`;
 $('pager').hidden=pages<=1;$('pageInfo').textContent=`${page+1} / ${Math.max(1,pages)}`;
 $('prevPage').disabled=page===0;$('nextPage').disabled=page+1>=pages;
 if(!results.length){host.append(el('div','pending','검색 결과가 없습니다.'));return;}
 results.forEach(s=>{
  const {card,open,detail}=BeaguSchoolSearchCard.createCard(s,{
   level:2,
   percentile:percentilePanel(s)
  });
  let loaded=false,loading=false;
  open.addEventListener('click',async()=>{
   if(!detail.hidden){
    detail.hidden=true;open.textContent='🔍 연도별 상세 기록 보기';
    open.setAttribute('aria-expanded','false');return;
   }
   detail.hidden=false;open.textContent='상세보기 접기';
   open.setAttribute('aria-expanded','true');
   if(loaded||loading)return;
   loading=true;detail.replaceChildren(el('div','pending','승인된 연도별 자료를 불러오는 중…'));
   try{loaded=await showDetail(detail,s);}finally{loading=false;}
  });
  host.append(card);
  // A unique school search should show its approved details without an extra click.
  if(results.length===1&&total===1)open.click();
 });
 renderPagePercentiles(results,serial);
 if(window.BeaguSchoolMBTI)void BeaguSchoolMBTI.decorateCards(host,token);
}
async function search(reset){
 if(reset)page=0;
 const q=mode==='school'?$('searchInput').value.trim():'';
 const region=mode==='region'?$('regionSelect').value:'';
 const office=mode==='region'?$('officeSelect').value:'';
 const t=++serial;
 if((mode==='school'&&!q)||(mode==='region'&&!region)){
  $('results').replaceChildren();$('resultCount').textContent='';
  $('pager').hidden=true;return;
 }
 $('resultCount').textContent='검색 중…';
 try{
  let query=supabaseClient.from('schools')
   .select('school_id,school_name,sido,sido_standard,support_office,address,establishment,school_kind,status',{count:'exact'})
   .eq('status','운영');
  if(q)query=query.ilike('school_name',`%${q.replaceAll('%','\\%').replaceAll('_','\\_')}%`);
  if(region)query=query.eq('sido_standard',region);
  if(office)query=query.eq('support_office',office);
  const start=page*LIMIT;
  const {data,count,error}=await query.order('address',{ascending:true,nullsFirst:false})
   .order('school_name',{ascending:true}).range(start,start+LIMIT-1);
  if(t!==serial)return;if(error)throw error;render(data||[],count||0);
 }catch(e){
  if(t!==serial)return;console.error(e);$('resultCount').textContent='';
  $('results').replaceChildren(el('div','pending','학교 검색에 실패했습니다.'));
 }
}
(async()=>{
 if(!token){logout();return;}
 try{
  const s=await api('beagu-level-api','verify');
  if(s.level>=2)showSearch();else logout('Lv.2 권한이 필요합니다.');
 }catch(e){logout('참여코드 인증을 다시 진행해주세요.');}
})();
})();
