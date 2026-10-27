/* Lv.2 school edited-view: school records are NEVER bundled into GitHub. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const base=`${SUPABASE_URL}/functions/v1`;
const sessKey='beagu-level-session-v1';
let token=sessionStorage.getItem(sessKey)||'';
let mode='school',page=0,serial=0,debounce;const LIMIT=20;
const officeNames={'서울':'강남서초 강동송파 강서양천 남부 동부 동작관악 북부 서부 성동광진 성북강북 중부','부산':'남부 동래 북부 서부 해운대','대구':'군위 남부 달성 동부 서부','인천':'강화 남부 동부 북부 서부','광주':'동부 서부','대전':'동부 서부','울산':'강남 강북','세종':'세종','경기':'가평 고양 광명 광주하남 구리남양주 군포의왕 김포 동두천양주 부천 성남 수원 시흥 안산 안성 안양과천 양평 여주 연천 용인 의정부 이천 파주 평택 포천 화성오산','강원':'강릉 고성 동해 삼척 속초양양 양구 영월 원주 인제 정선 철원 춘천 태백 평창 홍천 화천 횡성','충북':'괴산증평 단양 보은 영동 옥천 음성 제천 진천 청주 충주','충남':'공주 금산 논산계룡 당진 보령 부여 서산 서천 아산 예산 천안 청양 태안 홍성','전북':'고창 군산 김제 남원 무주 부안 순창 완주 익산 임실 장수 전주 정읍 진안','전남':'강진 고흥 곡성 광양 구례 나주 담양 목포 무안 보성 순천 신안 여수 영광 영암 완도 장성 장흥 진도 함평 해남 화순','경북':'경산 경주 고령 구미 김천 문경 봉화 상주 성주 안동 영덕 영양 영주 영천 예천 울릉 울진 의성 청도 청송 칠곡 포항','경남':'거제 거창 고성 김해 남해 밀양 사천 산청 양산 의령 진주 창녕 창원 통영 하동 함안 함양 합천','제주':'서귀포시 제주시'};
const prefixes={'서울':'서울특별시','부산':'부산광역시','대구':'대구광역시','인천':'인천광역시','광주':'전남광주통합특별시광주','대전':'대전광역시','울산':'울산광역시','경기':'경기도','강원':'강원특별자치도','충북':'충청북도','충남':'충청남도','전북':'전북특별자치도','전남':'전남광주통합특별시','경북':'경상북도','경남':'','제주':''};
const el=(tag,cls,text)=>{const d=document.createElement(tag);if(cls)d.className=cls;if(text!==undefined)d.textContent=String(text);return d};
const schemaPromise=fetch('data/lv2-edited-column-schema.json',{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('SCHEMA_MISSING');return r.json()});
let percentIndex=new Map();
const publicPromise=fetch('data/public-lv0-percentiles-v1.2.json').then(r=>r.json()).then(j=>{if(window.BeaguPublic)percentIndex=BeaguPublic.buildIndex(j)}).catch(()=>{});
async function api(path,action,payload={}){
 const response=await fetch(`${base}/${path}`,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Beagu-Session':token},body:JSON.stringify({action,...payload})});
 const data=await response.json().catch(()=>({}));
 if([401,403].includes(response.status)){const e=Error('AUTH_REQUIRED');e.unauthorized=true;throw e}
 if(!response.ok)throw Error(data.error||`HTTP_${response.status}`);
 return data;
}
function logout(message=''){
 token='';sessionStorage.removeItem(sessKey);$('searchPanel').hidden=true;$('loginPanel').hidden=false;$('loginMessage').textContent=message;
}
function showSearch(){$('loginPanel').hidden=true;$('searchPanel').hidden=false;}
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();$('loginButton').disabled=true;$('loginMessage').textContent='서버 인증 중…';
 try{const data=await api('beagu-level-api','login',{code:$('levelCode').value.trim()});if(data.level<2){$('loginMessage').textContent='Lv.2 인증코드가 아닙니다.';return}token=data.token;sessionStorage.setItem(sessKey,token);$('levelCode').value='';showSearch();$('searchInput').focus()}
 catch(e){$('loginMessage').textContent='참여코드를 확인해주세요.'}finally{$('loginButton').disabled=false}
});
$('logoutButton').addEventListener('click',()=>logout());
function modeTo(m){mode=m;$('schoolPanel').hidden=m!=='school';$('regionPanel').hidden=m!=='region';$('schoolTab').setAttribute('aria-selected',String(m==='school'));$('regionTab').setAttribute('aria-selected',String(m==='region'));search(true)}
$('schoolTab').addEventListener('click',()=>modeTo('school'));
$('regionTab').addEventListener('click',()=>modeTo('region'));
$('searchInput').addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>search(true),250)});
$('regionSelect').addEventListener('change',()=>{
 const region=$('regionSelect').value;const o=$('officeSelect');o.replaceChildren(new Option(region?'전체 교육지원청':'시도를 먼저 선택하세요',''));o.disabled=!region;
 if(region==='세종')o.add(new Option('세종시교육청','세종특별자치시교육청'));
 else if(region){(officeNames[region]||'').split(' ').filter(Boolean).forEach(x=>o.add(new Option(x,(prefixes[region]||'')+x+'교육지원청')));if(region==='경남')for(const [a,b] of [['마산 (과거 분류)','마산교육청(폐지)'],['진해 (과거 분류)','진해교육청(폐지)'],['창원 (과거 분류)','창원교육청(폐지)']])o.add(new Option(a,b))}
 search(true);
});
$('officeSelect').addEventListener('change',()=>search(true));
$('prevPage').addEventListener('click',()=>{page=Math.max(0,page-1);search(false)});
$('nextPage').addEventListener('click',()=>{page++;search(false)});
function note(text){return el('p','year-note',text)}
function addPercentiles(root,school){
 const box=el('div','percentiles');const values=window.BeaguPublic?BeaguPublic.values(percentIndex.get(String(school.school_id))):[null,null,null];
 [2023,2024,2025].forEach((year,index)=>{const cell=el('div');cell.append(el('span','',String(year)),el('b','',values[index]==null?'자료 없음':Number(values[index]).toFixed(1)+'%'));box.append(cell)});root.append(box);
}
function renderRecords(root,records,metadata,year){
 root.replaceChildren();const fields=metadata?.years?.[String(year)]||[];const rows=(records||[]).filter(x=>Number(x.year)===year);
 if(!rows.length){root.append(el('div','pending',`${year}년 편집본의 공개 승인 자료가 없습니다. 자료가 없거나 검수가 진행 중입니다.`));return;}
 rows.forEach((record,idx)=>{
  const values=record.values||{};
  root.append(note(`${year}년 편집본 · 원래 열 순서대로 표시${rows.length>1?` · 기록 ${idx+1}/${rows.length}`:''}`));
  let lastSection='',currentSection=null,lastSub='';
  fields.forEach(field=>{
   const sectionName=field.section||'기타';
   if(sectionName!==lastSection){currentSection=el('section','section-card');currentSection.append(el('h4','',sectionName));root.append(currentSection);lastSection=sectionName;lastSub='';}
   const subName=field.subsection||'';
   if(subName&&subName!==lastSub){currentSection.append(el('div','subheading',subName));lastSub=subName}
   const item=el('div','item');const label=el('div','name');label.append(el('span','source-col',field.key),document.createTextNode(field.title||field.key));
   const raw=Object.prototype.hasOwnProperty.call(values,field.key)?values[field.key]:null;
   const value=el('div',raw===null||raw===''?'val empty-value':'val',raw===null||raw===''?'— (원본 공란)':String(raw));
   item.append(label,value);currentSection.append(item);
  });
  if(!fields.length)root.append(el('div','pending','항목 목록을 읽지 못했습니다.'));
 });
}
async function showDetail(container,school){
 container.replaceChildren();const head=el('div','overview');head.append(el('h3','','연도별 상세자료'),el('small','','출처: 배구지수 편집본'));container.append(head);
 await publicPromise;addPercentiles(container,school);
 const tabbar=el('div','year-tabs');tabbar.setAttribute('role','tablist');const body=el('div');container.append(tabbar,body);
 let response,metadata;
 try{[response,metadata]=await Promise.all([api('beagu-edited-api-v1','school',{schoolId:school.school_id}),schemaPromise]);}
 catch(e){if(e.unauthorized){logout('인증이 만료되었습니다. 다시 로그인하세요.');return}body.append(el('div','pending','학교별 상세자료를 불러오지 못했습니다. 서버 자료 등록 상태를 확인해주세요.'));return}
 const years=[2025,2024,2023];function choose(year){
  [...tabbar.children].forEach(b=>b.setAttribute('aria-selected',String(Number(b.dataset.year)===year)));
  renderRecords(body,response.rows,metadata,year);
 }
 years.forEach(y=>{const b=el('button','',String(y)+'년');b.type='button';b.dataset.year=String(y);b.setAttribute('role','tab');b.addEventListener('click',()=>choose(y));tabbar.append(b)});
 choose(2025);container.append(note('각 셀의 수치는 편집본 기록값이며 새로 환산하거나 재산정한 값이 아닙니다.'));
}
function render(results,total){
 const host=$('results');host.replaceChildren();const nPages=Math.ceil(total/LIMIT);$('resultCount').textContent=`검색 결과 ${total.toLocaleString()}개`;
 $('pager').hidden=nPages<=1;$('pageInfo').textContent=`${page+1} / ${nPages}`;$('prevPage').disabled=page===0;$('nextPage').disabled=page+1>=nPages;
 if(!results.length){host.append(el('div','pending','검색 결과가 없습니다.'));return}
 results.forEach(s=>{
  const card=el('article','school-card');card.append(el('span','region-pill',s.sido_standard||s.sido),el('div','school-name',s.school_name),el('div','school-meta',[s.support_office,s.address].filter(Boolean).join(' · ')));
  const actions=el('div','actions');const open=el('button','view-button','학교별 상세보기');open.type='button';open.setAttribute('aria-expanded','false');
  const exchange=el('a','exchange-button','실시간 정보교류');exchange.href='https://open.kakao.com/o/gJyJ14Si';exchange.target='_blank';exchange.rel='noopener noreferrer';actions.append(open,exchange);card.append(actions);
  const detail=el('section','school-detail');detail.hidden=true;detail.setAttribute('aria-label','학교별 상세정보');card.append(detail);
  let loaded=false;open.addEventListener('click',async()=>{
    if(!detail.hidden){detail.hidden=true;open.textContent='학교별 상세보기';open.setAttribute('aria-expanded','false');return}
    detail.hidden=false;open.textContent='상세보기 접기';open.setAttribute('aria-expanded','true');
    if(loaded)return;loaded=true;detail.append(el('div','pending','편집본의 연도별 자료를 불러오는 중…'));await showDetail(detail,s);
  });host.append(card);
 });
}
async function search(reset){
 if(reset)page=0;const q=mode==='school'?$('searchInput').value.trim():'';const region=mode==='region'?$('regionSelect').value:'';const office=mode==='region'?$('officeSelect').value:'';const t=++serial;
 if((mode==='school'&&!q)||(mode==='region'&&!region)){$('results').replaceChildren();$('resultCount').textContent='';$('pager').hidden=true;return}
 $('resultCount').textContent='검색 중…';
 try{
  let query=supabaseClient.from('schools').select('school_id,school_name,sido,sido_standard,support_office,address,status',{count:'exact'}).eq('status','운영');
  if(q)query=query.ilike('school_name',`%${q.replaceAll('%','\\%').replaceAll('_','\\_')}%`);
  if(region)query=query.eq('sido_standard',region);if(office)query=query.eq('support_office',office);
  const start=page*LIMIT;const {data,count,error}=await query.order('address',{ascending:true,nullsFirst:false}).order('school_name',{ascending:true}).range(start,start+LIMIT-1);
  if(t!==serial)return;if(error)throw error;render(data||[],count||0);
 }catch(e){if(t!==serial)return;console.error(e);$('resultCount').textContent='';$('results').replaceChildren(el('div','pending','학교 검색에 실패했습니다.'))}
}
(async()=>{if(!token){logout();return}try{const s=await api('beagu-level-api','verify');if(s.level>=2)showSearch();else logout('Lv.2 권한이 필요합니다.')}catch(e){logout('참여코드 인증을 다시 진행해주세요.')}})();
})();
