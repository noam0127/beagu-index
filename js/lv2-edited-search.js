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
 2024:new Set(['A','B','C','E','G','N','AI','BN']),
 2025:new Set(['A','B','C','D','F','G','H','I','J','K','L','M','N','O','P','R','S','T','AC','AE','AI','AM','AQ','AU','AY','BC','BG'])
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
let percentIndex=new Map();
const publicPromise=fetch('data/public-lv0-percentiles-v1.2.json')
 .then(r=>{if(!r.ok)throw Error('PUBLIC_DATA_MISSING');return r.json()})
 .then(j=>{if(window.BeaguPublic)percentIndex=BeaguPublic.buildIndex(j)})
 .catch(()=>{});
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
 if(region==='세종')o.add(new Option('세종시교육청','세종특별자치시교육청'));
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
 .filter(m=>typeof m?.label==='string'&&typeof m?.value==='string'&&!/응답|관측|표본|횟수|회수/i.test(m.label));
}
function percentile2026(rows){
 for(const m of metrics2026(rows).filter(x=>x.label.includes('백분위'))){
  const l=m.value.trim().match(/^(\d{1,3}(?:\.\d{1,2})?)\s*%?$/),n=l?Number(l[1]):NaN;
  if(Number.isFinite(n)&&n>=0&&n<=100)return n;
 }return null;
}
function addPercentiles(root,school,levelRows){
 const box=el('div','percentiles');
 const values=window.BeaguPublic?BeaguPublic.values(percentIndex.get(String(school.school_id))):[null,null,null];
 [2023,2024,2025,2026].forEach((year,i)=>{
  const value=year===2026?percentile2026((levelRows||[]).filter(r=>Number(r.access_level)===1)):values[i];
  const cell=el('div');cell.append(el('span','',String(year)),el('b','',value==null?'자료 준비 중':Number(value).toFixed(1)+'%'));box.append(cell);
 });root.append(box);
}
function addSchoolProfile(root,school){
 const profile=el('section','school-profile');profile.append(el('h3','','학교 기본정보'));
 for(const [label,value] of [
  ['학교명',school.school_name],['시도',school.sido_standard||school.sido],
  ['교육지원청',school.support_office],['주소',school.address],
  ['설립유형',school.establishment],['학교급',school.school_kind]
 ]){const line=el('div','data-row');line.append(el('span','',label),el('strong','',value||'자료 없음'));profile.append(line);}
 root.append(profile);
}
function renderRecords(root,records,metadata,year){
 root.replaceChildren();
 const rows=Array.isArray(records)?records.filter(r=>Number(r.year)===year):[];
 if(!rows.length){
  root.append(el('div','pending',`${year}년의 공개 승인된 상세자료가 없습니다.`));return;
 }
 rows.forEach((record,i)=>{
  const values=record.values&&typeof record.values==='object'&&!Array.isArray(record.values)?record.values:{};
  const fields=releasedFields(metadata,year,values);
  if(!fields.length){
   root.append(el('div','pending',`${year}년에는 표시 가능한 승인 항목이 없습니다.`));return;
  }
  const suffix=rows.length>1?` · 기록 ${i+1}/${rows.length}`:'';
  root.append(note(`${year}년 · 공개 승인 항목 ${fields.length}개 (편집본 열 순서)${suffix}`));
  let sectionName='',currentSection=null,subName='';
  for(const field of fields){
   const group=field.section||'기타';
   if(group!==sectionName){
    currentSection=el('section','section-card');
    currentSection.append(el('h4','',group));root.append(currentSection);
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
  if(year===2025&&Number.isInteger(record.observation_count)&&record.observation_count===1)
   root.append(note('참고: 이 학교의 요약은 관측 응답 기록 1건에 기반합니다. 학교 전체를 대표하는 결과가 아닙니다.'));
 });
}
async function showDetail(container,school){
 container.replaceChildren();
 const head=el('div','overview');
 head.append(el('h3','','연도별 상세자료'),el('small','','공개 승인 자료만 표시'));
 container.append(head);
 await publicPromise;addPercentiles(container,school);
 const tabbar=el('div','year-tabs');tabbar.setAttribute('role','tablist');
 const body=el('div');container.append(tabbar,body);
 let response,metadata;
 try{
  [response,metadata]=await Promise.all([
   api('beagu-edited-api-v1','school',{schoolId:school.school_id}),schemaPromise
  ]);
 }catch(e){
  if(e.unauthorized){logout('인증이 만료되었습니다. 다시 로그인하세요.');return false;}
  body.append(el('div','pending','상세자료 또는 항목설명을 불러오지 못했습니다. 다시 시도해주세요.'));
  return false;
 }
 const years=[2025,2024,2023];
 function choose(year){
  [...tabbar.children].forEach(b=>
   b.setAttribute('aria-selected',String(Number(b.dataset.year)===year)));
  renderRecords(body,response.rows,metadata,year);
 }
 years.forEach(y=>{
  const b=el('button','',String(y)+'년');b.type='button';b.dataset.year=String(y);
  b.setAttribute('role','tab');b.addEventListener('click',()=>choose(y));tabbar.append(b);
 });
 choose(2025);
 container.append(note('연도마다 문항과 집계 방식이 다릅니다. 백분위 및 영역별 수치를 동일 척도로 직접 비교하지 마세요.'));
 return true;
}
function render(results,total){
 const host=$('results');host.replaceChildren();const pages=Math.ceil(total/LIMIT);
 $('resultCount').textContent=`검색 결과 ${total.toLocaleString()}개`;
 $('pager').hidden=pages<=1;$('pageInfo').textContent=`${page+1} / ${Math.max(1,pages)}`;
 $('prevPage').disabled=page===0;$('nextPage').disabled=page+1>=pages;
 if(!results.length){host.append(el('div','pending','검색 결과가 없습니다.'));return;}
 results.forEach(s=>{
  const card=el('article','school-card');
  card.append(el('span','region-pill',s.sido_standard||s.sido),
   el('div','school-name',s.school_name),
   el('div','school-meta',[s.support_office,s.address].filter(Boolean).join(' · ')));
  const actions=el('div','actions'),open=el('button','view-button','학교별 상세보기');
  open.type='button';open.setAttribute('aria-expanded','false');
  actions.append(open);card.append(actions);
  const detail=el('section','school-detail');detail.hidden=true;
  detail.setAttribute('aria-label','학교별 상세정보');card.append(detail);
  let loaded=false,loading=false;
  open.addEventListener('click',async()=>{
   if(!detail.hidden){
    detail.hidden=true;open.textContent='학교별 상세보기';
    open.setAttribute('aria-expanded','false');return;
   }
   detail.hidden=false;open.textContent='상세보기 접기';
   open.setAttribute('aria-expanded','true');
   if(loaded||loading)return;
   loading=true;detail.replaceChildren(el('div','pending','승인된 연도별 자료를 불러오는 중…'));
   try{loaded=await showDetail(detail,s);}finally{loading=false;}
  });
  host.append(card);
 });
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
