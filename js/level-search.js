/* Beagu Lv.1 approved statistics, 2023-2025. Replaces js/level-search.js.
 * The public legacy percentiles remain public; the protected metrics are
 * fetched exclusively through beagu-level-api after server-side validation.
 * Release: step 4-2, 2026-10-27. No backend or data-table modifications.
 */
(() => {
  'use strict';
  const level = Number(document.documentElement.dataset.beaguLevel);
  const base = `${SUPABASE_URL}/functions/v1/beagu-level-api`;
  const $ = id => document.getElementById(id);
  const key = 'beagu-level-session-v1';
  const arcadeTargetId = new URLSearchParams(window.location.search).get('school_id');
  const arcadeTargetValid = typeof arcadeTargetId==='string'&&/^[A-Z0-9]{7}$/.test(arcadeTargetId);
  let arcadeTargetOpened = false;
  let session = sessionStorage.getItem(key) || '';
  let authGeneration = 0;
  function invalidateSearch(){ ++serial; ++officeLoadSerial; clearTimeout(timer); current2026.clear(); visiblePageSchools=[]; geographyComparisons.clear(); arcadeTargetOpened=false; $('results').replaceChildren(); $('resultCount').textContent=''; $('pager').hidden=true; }
  let viewerTier=1;
  function showUpgrade(){
    const isLv2=viewerTier>=2;
    $('lv2UpgradeCard').hidden=isLv2;
    const option=$('regionSort').querySelector('option[value="housing_price_won"]');
    if(option){option.disabled=!isLv2;option.textContent=isLv2?'공동주택 평균 공시가격':'🔒 공시가격 (Lv.2)';}
    if(!isLv2&&$('regionSort').value==='housing_price_won')$('regionSort').value='school_name';
  }
  let mode = 'school', page = 0, timer, serial = 0;
  const LIMIT = 20;
  const YEARS = [2023, 2024, 2025, 2026];
  const conciseQuestion=value=>String(value||'').replace(
    /^\s*\(\d+\s*[~～〜\-–]\s*\d+\)\s*아래는\s*있다\s*,\s*없다\s*혹은\s*모름을\s*체크해\s*주세요\s*/u,
    ''
  ).trim();
  // Exact education office names come from the verified schools table.
  let officeLoadSerial=0;
  const SORTS=new Set(['school_name','address','beagu_percentile_2025','student_count','junior_teacher_ratio','male_teacher_ratio','housing_price_won','view_count','like_count','game_points']);
  let sortDirection='asc';
  const updateSortDirection=()=>{
    const button=$('regionSortDirection');
    const ascending=sortDirection==='asc';
    button.textContent=ascending?'↑':'↓';
    button.setAttribute('aria-label',ascending?'현재 오름차순, 내림차순으로 전환':'현재 내림차순, 오름차순으로 전환');
    button.title=ascending?'현재 오름차순 · 클릭하면 내림차순':'현재 내림차순 · 클릭하면 오름차순';
  };
  // Only the visible name is shortened. The option value remains the verified
  // exact school-support office string used for server-side filtering.
  const shortOfficeName=(full,region)=>{
    const raw=String(full||'').trim();
    if(region==='경남'){
      if(raw==='창원교육지원청')return '창원(본청)';
      if(raw==='창원교육지원청(마산센터)')return '마산센터';
      if(raw==='창원교육지원청(진해센터)')return '진해센터';
    }
    if(!raw.endsWith('교육지원청')){
      if(raw.endsWith('교육청'))return region+'교육청';
      return raw;
    }
    let name=raw.slice(0,-'교육지원청'.length);
    const prefixes=[
      '전남광주통합특별시','강원특별자치도','전북특별자치도','제주특별자치도',
      '세종특별자치시','서울특별시','부산광역시','대구광역시','인천광역시',
      '광주광역시','대전광역시','울산광역시',
      '강원도','경기도','충청북도','충청남도','전라북도','전라남도',
      '경상북도','경상남도','제주도'
    ];
    for(const prefix of prefixes){
      if(name.startsWith(prefix)){name=name.slice(prefix.length);break;}
    }
    if(region==='광주'&&name.startsWith('광주')&&name.length>2)name=name.slice(2);
    return name||raw;
  };
  const escape = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const make = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  let publicIndex = new Map(), publicStaticAvailable = false, publicLoadError = false;
  let current2026 = new Map();
  let officialBasicsIndex=new Map(),officialBasicsAvailable=false;
  const basicsReady=window.BeaguPublicSchoolBasics2026.index().then(m=>{officialBasicsIndex=m;officialBasicsAvailable=true;}).catch(e=>console.warn('2026 공식 기본정보 파일 조회 실패',e));
  // Only signed API-approved 2026 values can refresh on an active search page.
  let visiblePageSchools=[];
  let refreshingReleased2026=false;
  // 2026 result snapshots must be invalidated whenever a live recheck fails.
  const approved2026Views=new WeakMap();
  let historicalPresenceByYear={};
  const geographyComparisons=new Map(); // approved national/province benchmarks; never school responses

  const historicalPresenceReady=fetch('data/public-2023-2025-school-records-v2.json?v=20261120-historyfull2',{cache:'default'})
    .then(r=>{if(!r.ok)throw new Error('과거 조사 기록 파일 조회 실패');return r.json()})
    .then(data=>{
      const years=data?.schoolIdsByYear;
      if(!years||!['2023','2024','2025'].every(y=>Array.isArray(years[y])&&
          years[y].every(id=>typeof id==='string'&&/^[A-Z0-9]{7}$/.test(id))))return;
      historicalPresenceByYear=Object.fromEntries(
        ['2023','2024','2025'].map(y=>[y,new Set(years[y])]));
    }).catch(e=>{console.warn('조사 기록이 표시되지 않아도 기존 검색은 유지됩니다.',e)});

  const loaded = fetch('data/public-lv0-percentiles-v1.2.json?v=20261120-all-regions1', {cache:'default'})
    .then(r => { if (!r.ok) throw new Error('PUBLIC_DATA_UNAVAILABLE'); return r.json(); })
    .then(data => { publicIndex = BeaguPublic.buildIndex(data); publicStaticAvailable = true; })
    .catch(error => { console.warn('공개 백분위 파일 미응답, 승인 DB를 사용합니다.', error); });

  async function recoverPublicIndex(list) {
    if(!list.length) return;
    const ids=[...new Set(list.map(s=>String(s.school_id))
      .filter(id=>/^[A-Z0-9]{7}$/.test(id))
      .filter(id=>{
        const item=publicIndex.get(id);
        return !item||!Array.isArray(item.percentiles)||item.percentiles.some(v=>v==null);
      }))];
    if(!ids.length) return;
    const {data,error}=await supabaseClient.from('beagu_school_report_yearly')
      .select('school_id,survey_year,percentile').in('school_id',ids)
      .eq('publication_status','PUBLISHED').in('survey_year',[2023,2024,2025]).limit(100);
    if(error) throw error;
    for(const id of ids) {
      const previous=publicIndex.get(id);
      const values=Array.isArray(previous?.percentiles)?previous.percentiles.slice(0,3):[null,null,null];
      const statuses=Array.isArray(previous?.statuses)?previous.statuses.slice(0,3):
        ['NO_PUBLISHED_VALUE','NO_PUBLISHED_VALUE','NO_PUBLISHED_VALUE'];
      for(const row of data||[]) {
        if(String(row.school_id)!==id || row.percentile===null) continue;
        const i=[2023,2024,2025].indexOf(Number(row.survey_year)),n=Number(row.percentile);
        if(i>=0 && Number.isFinite(n) && n>=0 && n<=100&&values[i]===null){
          values[i]=n;statuses[i]='EXISTING_PUBLIC_VALUE_PRESERVED';
        }
      }
      publicIndex.set(id,{percentiles:values,statuses});
    }
    publicLoadError=false;
  }

  function loggedOut(message = '') {
    ++authGeneration;
    invalidateSearch();
    session = '';
    arcadeTargetOpened=false;
    $('results').replaceChildren(); $('resultCount').textContent=''; $('pager').hidden=true;
    geographyComparisons.clear();
    visiblePageSchools=[];
    sessionStorage.removeItem(key);
    window.dispatchEvent(new Event('beagu:level-state-change'));
    $('loginPanel').hidden = false;
    $('searchPanel').hidden = true;
    viewerTier=1;
    $('loginMessage').textContent = message;
    // Auth is now in the shared header; never strand logged-out visitors on a blank protected page.
    window.location.replace('search.html');
  }
  function loggedIn() {
    window.dispatchEvent(new Event('beagu:level-state-change'));
    $('loginPanel').hidden = true;
    $('searchPanel').hidden = false;
    showUpgrade();
    if(arcadeTargetValid)void openArcadeTarget();
  }
  async function openArcadeTarget(){
    if(!arcadeTargetValid||arcadeTargetOpened||!session)return;
    arcadeTargetOpened=true;
    const targetGeneration=authGeneration;
    try{
      // Resolve exact school ID; same-name schools must never be mixed up.
      const {data:school,error}=await supabaseClient.from('schools')
        .select('school_id,school_name,sido_standard').eq('school_id',arcadeTargetId).limit(1).maybeSingle();
      if(targetGeneration!==authGeneration)return;
      if(error||!school||String(school.school_id)!==arcadeTargetId)throw Error('SCHOOL_NOT_FOUND');
      mode='school';
      $('searchInput').value=String(school.school_name||'');
      const region=String(school.sido_standard||'');
      let selected=null;
      // Search is paged at 20 entries: scan until exact ID is found.
      for(let candidatePage=0;candidatePage<10;candidatePage++){
        const found=await api('ranked_schools',{searchText:school.school_name,region,office:'',
          sort:'school_name',direction:'asc',page:candidatePage});
        const list=Array.isArray(found.schools)?found.schools:[];
        selected=list.find(item=>String(item.school_id)===arcadeTargetId);
        if(selected||((candidatePage+1)*LIMIT)>=Number(found.total||0))break;
      }
      if(!selected)throw Error('SCHOOL_NOT_IN_RESULTS');
      ++serial;page=0;
      render([selected],1,'school_name_asc');
      const trigger=$('results').querySelector('.glory-detail-trigger');
      if(trigger)trigger.click();
      const card=$('results').querySelector('.school-card');
      if(card?.scrollIntoView)card.scrollIntoView({block:'start'});
    }catch(error){
      if(targetGeneration!==authGeneration||error.stale)return;
      console.warn('학교 고유번호 상세조회 실패 · 이름 검색으로 전환합니다.',error);
      if($('searchInput').value.trim())void search(true);
    }
  }

  async function api(action, payload = {}) {
    const generation=authGeneration, requestToken=session;
    const response = await fetch(base, {
      method: 'POST', cache: 'no-store',
      headers: {'Content-Type':'application/json', 'X-Beagu-Session':session},
      body: JSON.stringify({action, ...payload})
    });
    const data = await response.json().catch(() => ({}));
    if(generation!==authGeneration||requestToken!==session){const stale=new Error('이전 인증 요청 종료');stale.stale=true;throw stale;}
    if (response.status === 401 || (response.status === 403 && data.error !== 'LEVEL2_REQUIRED' && data.error !== 'ACCESS_DENIED')) {
      const error = new Error('인증 만료'); error.unauthorized = true; throw error;
    }
    if (!response.ok) { const error=new Error(data.error || '서버 오류'); error.status=response.status; throw error; }
    return data;
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const code = $('levelCode').value.trim();
    $('loginButton').disabled = true;
    $('loginMessage').textContent = '인증 중...';
    const loginTask=window.BeaguLoading?.start('참여코드를 확인하는 중…');
    try {
      const data = await api('login', {code});
      if (!/^[a-f0-9]{64}$/.test(String(data.token||'')) || ![1,2].includes(Number(data.level)) || Number(data.level) < level) {
        $('loginMessage').textContent = '이 등급에서 사용할 수 없는 참여코드입니다.';
        return;
      }
      ++authGeneration; invalidateSearch();
      session = data.token;
      viewerTier=Number(data.level)>=2?2:1;
      geographyComparisons.clear();
      sessionStorage.setItem(key, session);
      $('levelCode').value = '';
      loggedIn();
      $('searchInput').focus();
    } catch (_) {
      $('loginMessage').textContent = '참여코드를 확인해주세요.';
    } finally {
      $('loginButton').disabled = false;
      window.BeaguLoading?.finish(loginTask);
    }
  });
  $('logoutButton').addEventListener('click', () => loggedOut());
  window.addEventListener('beagu:participation-authenticated',event=>{
    const next=event.detail;
    if(!next||![1,2].includes(Number(next.level))||Number(next.level)<level||!/^[a-f0-9]{64}$/.test(String(next.token||'')))return;
    if(session!==next.token||viewerTier!==Number(next.level)){++authGeneration;invalidateSearch();}
    session=next.token;
    viewerTier=Number(next.level)>=2?2:1;
    geographyComparisons.clear();
    visiblePageSchools=[];
    loggedIn();
    $('searchInput').focus();
    if($('searchInput').value.trim()||$('regionSelect').value)void search(true);
  });
  window.addEventListener('beagu:participation-logged-out',()=>loggedOut());
  window.addEventListener('beagu:level-state-updated',event=>{
    const verified=event.detail?.level;
    const saved=sessionStorage.getItem(key)||'';
    if(session && verified===0 && !saved){loggedOut('인증이 만료되었습니다. 다시 로그인해주세요.');return;}
    if(session && saved===session && !$('searchPanel').hidden && (verified===1||verified===2) && verified!==viewerTier){
      ++authGeneration;invalidateSearch();viewerTier=verified;showUpgrade();
      if(!$('searchPanel').hidden)void search(true);
    }
  });
  $('lv2UpgradeForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(viewerTier>=2)return;
    const input=$('lv2UpgradeCode'),submit=$('lv2UpgradeSubmit'),message=$('lv2UpgradeMessage');
    const code=input.value.trim(),upgradeGeneration=authGeneration;
    if(!/^[A-Za-z0-9-]{8,120}$/.test(code)){message.textContent='코드 형식을 확인해 주세요.';return;}
    submit.disabled=true;message.textContent='Lv.2 코드를 확인하는 중…';
    try{
      const result=await api('login',{code});
      if(!/^[a-f0-9]{64}$/.test(String(result.token||'')))throw Error('INVALID_SESSION');
      const response=await fetch(base,{method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json','X-Beagu-Session':result.token},
        body:JSON.stringify({action:'verify'})});
      const checked=await response.json().catch(()=>({}));
      if(upgradeGeneration!==authGeneration)return;
      if(!response.ok||Number(checked.level)!==2){
        message.textContent='아직 Lv.2 권한이 없습니다. 기존 Lv.1 인증은 유지됩니다.';return;
      }
      sessionStorage.setItem(key,result.token);
      ++authGeneration;invalidateSearch();
      session=result.token;viewerTier=2;showUpgrade();
      window.dispatchEvent(new CustomEvent('beagu:participation-authenticated',
        {detail:{token:result.token,level:2,provisional:checked.provisional===true}}));
      window.dispatchEvent(new Event('beagu:level-state-change'));
      if($('searchInput').value.trim()||$('regionSelect').value)void search(true);
    }catch(_){message.textContent='코드를 확인해 주세요. 기존 Lv.1 인증은 유지됩니다.';}
    finally{input.value='';submit.disabled=false;}
  });
  function selectMode(nextMode) {
    mode = nextMode;
    $('schoolPanel').hidden = mode !== 'school';
    $('regionPanel').hidden = mode !== 'region';
    // The interest list is independent of the selected search mode.
    $('schoolTab').setAttribute('aria-selected', String(mode === 'school'));
    $('regionTab').setAttribute('aria-selected', String(mode === 'region'));
    search(true);
  }
  $('schoolTab').addEventListener('click', () => selectMode('school'));
  $('regionTab').addEventListener('click', () => selectMode('region'));

  $('regionSelect').addEventListener('change', async () => {
    const region=$('regionSelect').value, select=$('officeSelect');
    const run=++officeLoadSerial;
    select.disabled=true;
    select.replaceChildren(new Option(region?'교육지원청 불러오는 중…':'시도를 먼저 선택하세요',''));
    void search(true);
    if(!region)return;
    try{
      const result=await api('offices',{region});
      if(run!==officeLoadSerial||$('regionSelect').value!==region)return;
      select.replaceChildren(new Option('전체 교육청·교육지원청',''));
      const values=[...new Set(Array.isArray(result.offices)?result.offices:[])].filter(x=>typeof x==='string');
      for(const value of values) select.add(new Option(shortOfficeName(value,region),value));
      select.disabled=false;
    }catch(err){
      if(run!==officeLoadSerial)return;
      if(err.stale)return;
      if(err.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인해주세요.');return;}
      select.replaceChildren(new Option('교육청 목록을 다시 불러오려면 시도를 다시 선택하세요',''));
      select.disabled=true;
    }
  });
  $('officeSelect').addEventListener('change', () => search(true));
  // 지역 찾기만 선택형 정렬을 사용합니다. 서버는 페이지 나누기 전에 정렬합니다.
  $('regionSort').addEventListener('change',()=>{
    if(!SORTS.has($('regionSort').value)||($('regionSort').value==='housing_price_won'&&viewerTier<2)){showUpgrade();return;}
    // "조회수" defaults to most viewed first; the arrow still toggles either direction.
    if(['view_count','like_count','game_points'].includes($('regionSort').value)){
      sortDirection='desc';
      updateSortDirection();
    }
    void search(true);
  });
  $('regionSortDirection').addEventListener('click',()=>{
    sortDirection=sortDirection==='asc'?'desc':'asc';
    updateSortDirection();
    void search(true);
  });
  updateSortDirection();
  $('searchInput').addEventListener('input', () => {
    clearTimeout(timer); timer = setTimeout(() => search(true), 250);
  });
  $('searchInput').addEventListener('keydown',event=>{
    if(event.key!=='Enter'||event.isComposing||!$('searchInput').value.trim())return;
    event.preventDefault();clearTimeout(timer);void search(true,true);
  });
  $('prevPage').addEventListener('click', () => { page = Math.max(0, page - 1); search(false); });
  $('nextPage').addEventListener('click', () => { page++; search(false); });

  function addRow(host,label,value,comparison=null){
    const div=make('div','data-row');
    const factKey=String(comparison?.factKey||'');
    const official=comparison?.group==='편집본 공식 학교정보';
    const domain=comparison?.group==='2025년 조사 영역별 점수 · 응답 표본 참고';
    const schoolOnly=official&&(comparison?.schoolOnly===true||
      ['establishment_type','vice_principals','lead_teachers','meal_place','milk_lunch'].includes(factKey));
    if(schoolOnly){
      div.classList.add('beagu-school-only-row');
      const key=make('span','beagu-school-only-label',label);
      const val=make('strong','beagu-school-only-value');
      const presence=['vice_principals','lead_teachers','milk_lunch'].includes(factKey);
      const symbol=presence&&['O','X'].includes(String(value).trim())?String(value).trim():null;
      if(symbol){
        const pill=make('span','beagu-ox-pill is-'+(symbol==='O'?'yes':'no'),symbol);
        pill.setAttribute('aria-label',symbol==='O'?'있음':'없음');
        val.append(pill,make('span','beagu-school-only-meaning',symbol==='O'?'있음':'없음'));
      }else val.textContent=String(value||'자료 없음');
      div.append(key,val);
    }else if(official||domain){
      div.classList.add('beagu-comparison-row');
      div.append(make('h5','compare-label',label));
      const grid=make('div','compare-grid');
      const kind=domain?'평균':comparison?.comparisonKind==='mode'?'최빈 보기':'평균';
      for(const [name,v,role] of [
        ['우리 학교',value,'school'],
        ['지역 '+kind,comparison?.regionalAverage||'비교 자료 없음','regional'],
        ['전국 '+kind,comparison?.nationalAverage||'비교 자료 없음','national']
      ]){
        const cell=make('div','compare-value '+role);
        cell.append(make('span','compare-value-label',name),make('strong','compare-value-text',v));
        grid.append(cell);
      }
      div.append(grid);
      if(Number.isInteger(comparison?.referenceYear))
        div.append(make('small','beagu-compare-source',comparison.referenceYear+'년 자료 기준 · '+(domain?'승인된 학교별 점수 평균 참고값':'검수된 학교 집계값')));
    }else{
      div.append(make('span','',label),make('strong','',value));
    }
    host.append(div);
  }

  function asPublicPercentiles(school) {
    try { return BeaguPublic.values(publicIndex.get(String(school.school_id))); }
    catch (_) { return [null, null, null]; }
  }
  function isDuplicatePublicPercentile(metric, year, value) {
    if (value === null || typeof metric?.label !== 'string' || typeof metric?.value !== 'string') return false;
    if (!metric.label.includes(String(year)) || !metric.label.includes('백분위')) return false;
    const match = metric.value.trim().match(/^(\d{1,3}(?:\.\d+)?)\s*%$/);
    return !!match && Math.abs(Number(match[1]) - value) < 0.005;
  }

  // Reviewed aggregated historical benchmarks. A region's result must never be
  // represented as this particular school's response.
  function loadGeographyComparisons(year,region){
    if(![2023,2024,2025].includes(year)||typeof region!=='string'||
       !/^[가-힣A-Za-z·\s]{2,24}$/.test(region))return Promise.resolve(null);
    const cacheKey=year+'|'+region;
    if(geographyComparisons.has(cacheKey))return geographyComparisons.get(cacheKey);
    const promise=api('survey_comparisons',{year,region}).then(result=>{
      if(Number(result.year)!==year||result.region!==region||!result.items||
         typeof result.items!=='object'||Array.isArray(result.items))throw Error('BAD_COMPARISON_RESULT');
      return result;
    }).catch(error=>{geographyComparisons.delete(cacheKey);throw error;});
    geographyComparisons.set(cacheKey,promise);
    return promise;
  }
  function verifiedOptions(year,questionId){
    const authoritative=window.BeaguHistoricalQuestionnaire?.[String(year)]?.[questionId];
    if(Array.isArray(authoritative)&&authoritative.length)return {values:authoritative,source:'verified'};
    const additional=window.BeaguHistoricalAdditionalObserved?.[String(year)]?.[questionId];
    if(Array.isArray(additional)&&additional.length)return {values:additional,source:'observed'};
    const observed=year===2025?window.Beagu2025ObservedChoices?.[questionId]:null;
    if(Array.isArray(observed)&&observed.length)return {values:observed,source:'observed'};
    return {values:[],source:'missing'};
  }
  // One card per original question: school / region / nation together with
  // the verified rounded distribution. No separate duplicated question list.
  function renderHistoricalBenchmarks(host,year,school,modes,comparison,loadStatus,selections=[]){
    const questions=window.BeaguHistoricalOriginalQuestions?.[String(year)]||{};
    const qids=Object.keys(questions).filter(id=>/^Q\d{2}$/.test(id)).sort();
    if(!qids.length)return;
    const section=make('section','data-section beagu-question-section');
    const header=make('div','beagu-questions-header');
    header.append(make('h4','','문항별 결과'),make('span','beagu-question-count',qids.length+'개 문항'));
    section.append(header);
    section.append(make('p','beagu-question-intro',
      '학교별 검증된 선택 결과를 표시합니다. 전국·지역은 참여 표본의 참고값입니다.'));
    const details=make('details','beagu-source-note');
    details.append(make('summary','','자료 해석 안내'));
    details.append(make('p','',
      '학교 고유 결과는 별도 공개 심사를 통과한 경우에만 표시합니다. 그 외에는 학교가 속한 시도 및 전국의 자발적 참여 표본 집계값을 참고값으로 제공합니다. 지역·전국 기준값은 해당 학교의 응답이나 모집단 전체의 대표값이 아닙니다. 응답 건수와 보기별 분포·비율은 표시하지 않습니다. 2025년 행정업무·학교행사 문항의 체크 목록은 해당 학교 응답에서 확인된 항목의 합집합으로, 모든 응답자가 같은 항목을 선택했다는 뜻은 아닙니다. 응답이 하나인 학교에서는 표시값이 그 응답과 같을 수 있습니다.'));
    section.append(details);
    const all=comparison?.items&&typeof comparison.items==='object'?comparison.items:{};
    const nationalCount=qids.filter(id=>typeof all[id]?.national?.mean==='string'||typeof all[id]?.national?.mode==='string').length;
    const regionalCount=qids.filter(id=>typeof all[id]?.regional?.mean==='string'||typeof all[id]?.regional?.mode==='string').length;
    const overview=make('p','beagu-comparison-status',
      loadStatus==='loading'?'전국·지역 비교값을 불러오는 중…':
      loadStatus==='error'?'비교값 연결 실패 · 다른 연도를 선택한 뒤 다시 시도하세요':
      '전국 '+nationalCount+'/'+qids.length+' · 지역 '+regionalCount+'/'+qids.length+' 문항 비교');
    overview.setAttribute('role','status');
    section.append(overview);
    const vetted=new Map((Array.isArray(modes)?modes:[])
      .filter(d=>Number(d.year)===year&&/^Q\d{2}$/.test(String(d.questionId||''))&&
        typeof d.modeOption==='string'&&d.modeOption.length>0)
      .map(d=>[d.questionId,d.modeOption]));
    const region=String(school?.sido_standard||school?.sido||'지역');
    // Review-approved checkbox choices are a school-level union of selected
    // original options, never an individual answer or raw response combination.
    const selectedOptions=new Map((Array.isArray(selections)?selections:[])
      .filter(item=>year===2025&&item?.year===2025&&['Q03','Q04'].includes(item.questionId)
        &&Array.isArray(item.selectedOptions)&&item.selectedOptions.length>0
        &&item.selectedOptions.every(v=>typeof v==='string'&&v.trim().length>0&&v.length<=180))
      .map(item=>[item.questionId,[...new Set(item.selectedOptions)]]));
    const answerBadge=(value)=>{
      // Transform only exact yes/no/unknown choice labels. Explanatory
      // phrases such as "조금 있다" are never collapsed into O/X.
      const v=String(value||'').trim().replace(/[.!]$/,'');
      if(v==='있다')return {symbol:'O',label:'있다',kind:'yes'};
      if(v==='없다')return {symbol:'X',label:'없다',kind:'no'};
      if(v==='모름'||v==='잘 모름'||v==='잘모름')return {symbol:'?',label:'모름',kind:'unknown'};
      return null;
    };
    const circledOption=value=>{
      if(typeof value!=='string')return null;
      const raw=value.trim();
      // Never convert numeric scores, rates, dates, quantities or measurement units.
      if(/(?:점|%|명|명당|원|㎡|학급|개|년|월|일)$/.test(raw))return null;
      const circles=['','①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
      const exact=raw.match(/^([1-9]|10)\s*[,，.]?$/);
      if(exact)return circles[Number(exact[1])];
      const labelled=raw.match(/^([1-9]|10)\s*[.)、]\s*(\S[\s\S]*)$/);
      if(labelled)return circles[Number(labelled[1])]+' '+labelled[2];
      if(/^(?:10|[1-9])(?:\s*[,，]\s*(?:10|[1-9]))+$/.test(raw))
        return raw.split(/\s*[,，]\s*/).map(x=>circles[Number(x)]).join(' ');
      return null;
    };
    // A stored school choice may be "1 1회미만" although the original
    // questionnaire option is "① 1회미만". Require an exact option match,
    // so scores, counts, dates and unrelated free text are never reformatted.
    const circledCatalogOption=(value,options)=>{
      if(typeof value!=='string'||!Array.isArray(options)||!options.length)return null;
      const match=value.trim().match(/^(10|[1-9])\s+(\S[\s\S]*)$/);
      if(!match)return null;
      const circle=['','①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'][Number(match[1])];
      const label=match[2].trim();
      const normalize=text=>text.replace(/\s+/g,'').trim();
      const exact=options.some(option=>{
        if(typeof option!=='string')return false;
        const original=option.trim().match(/^([①②③④⑤⑥⑦⑧⑨⑩])\s*(\S[\s\S]*)$/);
        return original&&original[1]===circle&&normalize(original[2])===normalize(label);
      });
      return exact?circle+' '+label:null;
    };
    const list=make('div','beagu-question-list');
    const blocks=[];
    for(const id of qids){
      const block=make('article','historical-question-row');
      const question=conciseQuestion(questions[id]);
      const title=make('h5','beagu-question-title');
      title.append(make('span','beagu-question-number',id),document.createTextNode(question));
      block.append(title);
      const comparisonValues=all[id]||{};
      const optionData=verifiedOptions(year,id);
      const benchmark=m=>{
        if(!m||typeof m!=='object')return null;
        const preferred=m.kind==='most_frequent'||m.kind==='mode'?m.mode||m.mean:m.mean||m.mode;
        return typeof preferred==='string'&&preferred.length<=180?preferred:null;
      };
      const checkboxQuestion=year===2025&&(id==='Q03'||id==='Q04');
      const checked=checkboxQuestion?selectedOptions.get(id)||null:null;
      const cells=[
        ['우리 학교',checkboxQuestion?(checked?.length?'확인된 체크 항목':''):vetted.get(id)||null,'school'],
        [region,benchmark(comparisonValues.regional),'region'],
        ['전국',benchmark(comparisonValues.national),'nation']
      ];
      const grid=make('div','historical-benchmark-grid');
      for(const [label,value,role] of cells){
        const cell=make('div','historical-benchmark-value '+role);
        const top=make('span','beagu-benchmark-label',label);
        const hasValue=typeof value==='string'&&!!value.trim();
        const display=hasValue?value:role==='school'?
          (checkboxQuestion?'검증된 체크 항목 없음':'학교별 문항 집계 미공개'):'비교 자료 없음';
        let val;
        if(role==='school'&&checkboxQuestion&&checked?.length){
          val=make('ul','beagu-selected-options');
          val.setAttribute('aria-label','해당 학교 응답에서 체크된 항목');
          for(const choice of checked){
            const li=make('li','beagu-selected-choice');
            li.append(make('span','beagu-selected-mark','✓'),document.createTextNode(choice));
            val.append(li);
          }
        }else{
          const ordinal=role==='school'&&!checkboxQuestion
            ? (circledOption(value)??circledCatalogOption(value,optionData.values)) :null;
          const displayValue=ordinal??display;
          const flag=answerBadge(value);
          if(flag){
            val=make('div','beagu-benchmark-result beagu-answer-symbol');
            const pill=make('span','beagu-ox-pill is-'+flag.kind,flag.symbol);
            pill.setAttribute('aria-label',flag.label);
            val.append(pill,make('span','beagu-ox-text',flag.label));
          }else{
            val=make('strong','beagu-benchmark-result',displayValue);
          }
        }
        if(!hasValue)cell.classList.add('is-unavailable');
        cell.append(top,val);
        grid.append(cell);
      }
      block.append(grid);
      if(optionData.values.length){
        const optionTitle=make('h6','beagu-options-title',
          optionData.source==='verified'?'원본 설문 보기':'원자료에서 확인된 보기 (전체 목록 미확인)');
        const optionList=make('ul','historical-answer-choices');
        for(const value of optionData.values){
          if(typeof value!=='string'||value.length>180)continue;
          optionList.append(make('li','',value));
        }
        if(checkboxQuestion){
          const folded=make('details','beagu-checkbox-original-options');
          folded.append(make('summary','','전체 설문 보기 확인'));
          folded.append(optionTitle,optionList);
          block.append(folded);
        }else{
          block.append(optionTitle,optionList);
        }
      }else{
        block.append(make('p','beagu-options-empty',
          '해당 문항의 원본 선택지는 아직 검증되지 않았습니다.'));
      }
      blocks.push(block);
      list.append(block);
    }
    if(qids.length>14){
      const finder=make('div','beagu-question-finder');
      const input=make('input','beagu-question-input');
      input.type='search';
      input.placeholder='문항 검색';
      input.setAttribute('aria-label',year+'년 문항 검색');
      const count=make('span','beagu-question-match','전체 '+qids.length+'개');
      const empty=make('p','beagu-question-empty','일치하는 문항이 없습니다.');
      empty.hidden=true;
      input.addEventListener('input',()=>{
        const q=input.value.trim().toLocaleLowerCase('ko-KR');
        let visible=0;
        for(const block of blocks){
          const match=!q||block.textContent.toLocaleLowerCase('ko-KR').includes(q);
          block.hidden=!match;
          if(match)visible++;
        }
        count.textContent=q?'검색 '+visible+'개':'전체 '+qids.length+'개';
        empty.hidden=visible!==0;
      });
      finder.append(input,count);
      section.append(finder,empty);
    }
    section.append(list);
    host.append(section);
  }

  function renderYear(host, year, rows, publicValue, schoolId, modes=[], school=null,comparison=null,loadStatus='loading',selections=[],results2026=[],viewerTier=1) {
    host.replaceChildren();
    if(year===2026&&![1,2].includes(Number(viewerTier))){host.append(make('p','beagu-year-release-note','2026 배구지수는 Lv.1 이상 승인 자료만 공개합니다.'));return;}
    const heading=make('div','beagu-year-header');
    heading.append(make('h3','beagu-year-title',year+'년 조사 결과'));
    heading.append(make('span','beagu-year-caption',year===2026?'승인된 최신 자료':'문항·학교정보 비교'));
    host.append(heading);
    if(year===2026&&Number(viewerTier)===1){
      host.append(make('p','beagu-year-release-note','Lv.1 · 공개 승인된 2026 조사자료'));
    }
    if(year===2026&&Number(viewerTier)>=2){
      host.append(make('p','beagu-year-release-note',
        'Lv.2 · 2026년 최신 조사: 유효 응답이 1건인 학교도 최종 공개 승인 대상입니다. 다만 공개 근거·소표본 재식별 검토가 완료된 학교별 결과만 표시합니다.'));
    }
    // Fail closed on refresh errors. Never preserve an old 2026 school answer
    // after the signed API cannot re-confirm that the exact version is approved.
    if(year===2026 && loadStatus==='error'){
      host.append(make('p','beagu-year-error',
        '최신 공개 승인 상태를 확인하지 못했습니다. 2026년 학교별 결과를 숨기고 다시 확인할 수 있습니다.'));
      const retry=make('button','year-2026-button','2026년 승인 결과 다시 확인');
      retry.type='button';
      retry.addEventListener('click',async()=>{
        retry.disabled=true;
        try{
          const fresh=await api('school',{schoolId:String(schoolId)});
          const owner=host.closest('.school-detail');
          const sync=owner&&approved2026Views.get(owner);
          if(sync)sync(fresh,false);
          else renderYear(host,2026,fresh.rows,null,schoolId,fresh.schoolQuestionModes,null,null,
            'ready',fresh.schoolQuestionSelections,fresh.schoolQuestionResults2026,Number(fresh.level));
        }catch(e){
          if(e.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인해주세요.');return;}
          retry.disabled=false;
        }
      });
      host.append(retry);
      return;
    }
    // Lv.1 results expand inside the selected search card; no page change.
    if(year === 2026) {
      const vetted = metrics2026(rows,viewerTier);
      const hasQuestions=window.Beagu2026ApprovedResults?.render(host,results2026,{level:viewerTier});
      if(vetted.length) {
        const section=make('section','beagu-approved-section');
        BeaguDetailGroups.appendGrouped(section,vetted,(body,m)=>{
          if(Number(viewerTier)>=2 && window.Beagu2026Lv2Bars?.appendMetric?.(body,m))return;
          addRow(body,m.label,metricValue(m));
        });
        section.querySelectorAll('.beagu-detail-group').forEach(group=>{group.open=true;});
        host.append(section);
      } else if(!hasQuestions) {
        host.append(make('p','beagu-year-empty',
          Number(viewerTier)>=2
            ?'2026년 조사 자료를 확인 중입니다. 응답 1건인 학교도 승인 대상이지만, 이 학교는 아직 공개 근거·재식별 검토 및 최종 승인이 완료되지 않아 결과가 표시되지 않습니다.'
            :'2026년 공개된 학교별 조사 결과가 없습니다. 아직 참여하지 않았거나 집계·검수 및 공개 대기 중일 수 있습니다.'));
        const survey=make('a','beagu-year-survey-link','2026 조사 참여하기');
        survey.href='https://forms.gle/TPyCakK6Sj2zchRy7';
        survey.target='_blank';
        survey.rel='noopener noreferrer';
        survey.setAttribute('aria-label','2026 배구지수 설문조사 참여하기 (새 창)');
        host.append(survey);
        host.append(make('p','beagu-year-survey-help',
          '이미 참여하셨다면 공개 승인 이후 결과가 표시됩니다.'));
      }
      const reload = make('button','year-2026-button','2026년 승인 결과 새로고침');
      reload.type='button';
      reload.addEventListener('click',async()=>{
        reload.disabled=true;
        reload.textContent='승인 결과 확인 중...';
        try {
          const fresh=await api('school',{schoolId:String(schoolId)});
          const owner=host.closest('.school-detail');
          const sync=owner&&approved2026Views.get(owner);
          if(sync)sync(fresh,false);
          else renderYear(host,2026,fresh.rows,null,schoolId,fresh.schoolQuestionModes,null,null,
            'ready',fresh.schoolQuestionSelections,fresh.schoolQuestionResults2026,Number(fresh.level));
        } catch(e) {
          if(e.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인해주세요.');return;}
          const owner=host.closest('.school-detail');
          const sync=owner&&approved2026Views.get(owner);
          if(sync)sync(null,true);
          else renderYear(host,2026,[],null,schoolId,[],null,null,'error',[],[],viewerTier);
        }
      });
      host.append(reload);
      return;
    }
    // The already-visible year grid above carries the public percentile; do
    // not repeat the same value as a second section in the expanded detail.
    const yearRows=(Array.isArray(rows)?rows:[]).filter(row=>
      Number(row.year)===year && Number(row.access_level)<=Number(viewerTier));
    const releasedMetrics=[];
    let hadRestricted=false,hadMismatch=false;
    for(const row of yearRows){
      if(row.insufficient){hadRestricted=true;continue;}
      // Only display sanitized summary.metrics released by the signed API.
      for(const metric of Array.isArray(row.summary?.metrics)?row.summary.metrics:[]){
        if(typeof metric?.label!=='string'||typeof metric?.value!=='string')continue;
        if(metric.factKey==='district_housing_price_mean'&&Number(viewerTier)<2)continue;
        if(Number(viewerTier)===1&&year!==2025&&(metric.key==='percentile'||/백분위/.test(metric.label)))continue;
        if(isDuplicatePublicPercentile(metric,year,publicValue))continue;
        if(metric.label.includes(String(year))&&metric.label.includes('백분위')&&publicValue!==null)
          hadMismatch=true;
        releasedMetrics.push({
          label:metric.label,value:metric.factKey==='district_housing_price_mean'?BeaguSchoolSearchCard.formatHousingPrice(metric.value):metric.value,group:metric.group,
          nationalAverage:metric.factKey==='district_housing_price_mean'&&metric.nationalAverage!=null?BeaguSchoolSearchCard.formatHousingPrice(metric.nationalAverage):metric.nationalAverage,regionalAverage:metric.factKey==='district_housing_price_mean'&&metric.regionalAverage!=null?BeaguSchoolSearchCard.formatHousingPrice(metric.regionalAverage):metric.regionalAverage,
          comparisonKind:metric.comparisonKind,referenceYear:metric.referenceYear,
          factKey:metric.factKey,schoolOnly:metric.schoolOnly
        });
      }
    }
    if(releasedMetrics.length||hadRestricted||hadMismatch){
      const section=make('section','data-section beagu-approved-section');
      section.append(make('h4','','학교별 승인 자료'));
      if(year===2025 && releasedMetrics.some(m=>m.group==='2025년 조사 영역별 점수 · 응답 표본 참고')){
        section.append(make('p','beagu-source-caption',
          '영역별 점수는 참여 응답을 요약한 참고값으로, 학교 전체 교사의 의견을 대표하지 않습니다.'));
      }
      BeaguDetailGroups.appendGrouped(section,releasedMetrics,(body,m)=>addRow(body,m.label,m.value,m));
      // Explain the direction of the domain scores where the scores appear.
      // Only the 2025 '분야별 점수' group receives this short note.
      const domainBody=section.querySelector('.beagu-detail-group[data-topic="domains"] .beagu-detail-body');
      if(domainBody){
        domainBody.insertBefore(
          make('p','beagu-domain-score-note','점수가 높을수록 교사 부담이 증가합니다.'),
          domainBody.firstChild
        );
      }
      section.querySelectorAll('.beagu-detail-group').forEach(group=>{group.open=true;});
      if(hadMismatch)section.append(make('p','beagu-source-caption','출처별 백분위 값이 달라 원본 검수가 필요합니다.'));
      if(hadRestricted)section.append(make('p','beagu-source-caption','일부 세부 항목은 승인 범위에 따라 제공되지 않습니다.'));
      host.append(section);
    }
    renderHistoricalBenchmarks(host,year,school,modes,comparison,loadStatus,selections);
  }


  function metrics2026(rows,viewerTier=1) {
    return (Array.isArray(rows) ? rows : []).filter(r => Number(r.year) === 2026 && Number(r.access_level)>=1 && Number(r.access_level)<=Number(viewerTier))
      .flatMap(r => Array.isArray(r.summary?.metrics) ? r.summary.metrics : [])
      .filter(m => !/^Q(?:31|51)(?:$|[._-])/.test(String(m?.key||'')) && typeof m?.label === 'string' && (typeof m.value === 'number' || typeof m.value === 'string') && !/응답|관측|표본|횟수|회수/i.test(m.label));
  }
  function percentile2026(rows) {
    for (const m of metrics2026(rows)) {
      if (m.key !== 'percentile') continue;
      const n=Number(m.value);
      if (Number.isFinite(n) && n>=0 && n<=100) return n;
    }
    return null;
  }
  function metricValue(m) { return String(m.value)+(m.unit && !String(m.value).endsWith(m.unit) ? m.unit : ''); }
  function percentilePanel(school) {
    const id=String(school.school_id);
    const index=publicIndex.get(id),current=current2026.get(id);
    return BeaguSchoolSearchCard.percentiles({
      publicValues:asPublicPercentiles(school),
      statuses:index?.statuses || [],
      publicError:publicLoadError,
      value2026:current?.value ?? null,
      common2026:null, // Representative mean uses only existing public 2023–2025 values.
      status2026:current?.status || 'loading',
      locked:false,viewerTier
    });
  }
  // Independently public official-source facts are shown to verified Lv.1 and Lv.2. The existing
  // card and survey disclosure remain unchanged; no survey approvals are implied.
  // Reuse the three existing facts, not a second expandable profile.
  // Source years are explicit. The historical sort cache uses 2024 teacher
  // ratios; the 2026 full-staff projection is NOT a certified elementary
  // teacher denominator and must not silently replace those ratios.
  function renderOfficial2026(card,profile,status,school){
    if(![1,2].includes(viewerTier)||Number(card.dataset.accessLevel)!==viewerTier)return;
    const facts=card.querySelector('.glory-facts');
    if(!facts)return;
    const official=officialBasicsIndex.get(String(school?.school_id));
    const ranked=school?.staticFactsOnly===true;
    const ready=!ranked&&profile?.source_year===2026;
    const number=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
    const legacy=(v,max)=>v!==null&&v!==undefined&&v!==''&&number(Number(v),max)?Number(v):null;
    const fields=[
      ['student_count',official?.student_count??(ready&&number(profile.student_count,100000)?profile.student_count:null),ranked?null:legacy(school?.student_count,100000),Number(school?.student_reference_year),'명'],
      ['male_teacher_ratio',official?.male_teacher_ratio??(ready&&profile.ratio_basis==='ELEMENTARY_TEACHER_CERTIFIED'&&number(profile.male_teacher_ratio,100)?profile.male_teacher_ratio:null),ranked?null:legacy(school?.male_teacher_ratio,100),2024,'%'],
      ['junior_teacher_ratio',official?.second_grade_teacher_ratio??(ready&&profile.ratio_basis==='ELEMENTARY_TEACHER_CERTIFIED'&&number(profile.second_grade_teacher_ratio,100)?profile.second_grade_teacher_ratio:null),ranked?null:legacy(school?.junior_teacher_ratio,100),2024,'%'],
      ['teacher_total',official?.teacher_total??null,null,2026,'명']
    ];
    if(!facts.querySelector('[data-fact-key="teacher_total"]')){
      const item=make('div','glory-fact');item.dataset.factKey='teacher_total';
      item.append(make('span','glory-fact-label','교원 수'),make('strong','glory-fact-value','자료 없음'));facts.append(item);
    }
    let all2026=true;
    for(const [key,latest,previous,previousYear,unit] of fields){
      const item=facts.querySelector('[data-fact-key="'+key+'"]');
      if(!item)continue;
      const value=latest!==null?latest:previous;
      const year=latest!==null?2026:previousYear;
      const known=Number.isInteger(year)&&year>=2000&&year<=2026;
      if(value===null||year!==2026)all2026=false;
      item.querySelector('.glory-fact-value').textContent=value===null?'자료 없음':value.toLocaleString('ko-KR',{maximumFractionDigits:2})+unit;
      let source=item.querySelector('.glory-fact-year');
      if(!source){source=make('span','glory-fact-year');item.append(source);}
      source.textContent=value===null?'공식 자료 미확인':known?year+'년 기준':'기준연도 미확인';
    }
    let heading=card.querySelector('.official-school-basics-2026');
    if(!heading){heading=make('h3','official-school-basics-2026');facts.before(heading);}
    heading.textContent=all2026?'2026 학교 기본정보':'학교 기본정보';
    heading.title=official?'학교알리미 2026 공식 자료':ranked?'2026년 정적 공개 자료 기준':status==='UNAVAILABLE'?'2026 공식자료 조회 실패':status==='LOADING'?'2026 공식자료 확인 중':'확인된 기준연도의 세 가지 지표만 표시';
  }
  function loadPagePercentiles(list,requestId){
    const ids=[...new Set(list.map(s=>String(s.school_id)).filter(id=>/^[A-Z0-9]{7}$/.test(id)))];
    if(!ids.length)return;
    const refresh=()=>{
      if(serial!==requestId)return;
      for(const school of list){
        const id=String(school.school_id);
        for(const card of $('results').querySelectorAll('.school-card')){
          if(card.dataset.schoolId!==id)continue;
          const old=card.querySelector('.percentile-panel');
          if(old){
            old.replaceWith(percentilePanel(school));
            BeaguSchoolSearchCard.updateRecordedYears(card);
          }
          const history=card.querySelector('.beagu-yearly-percentiles');
          if(history)history.replaceWith(yearlyPercentileHistory(school,viewerTier));
          break;
        }
      }
    };
    api('percentiles',{schoolIds:ids}).then(result=>{
      if(serial!==requestId)return;
      for(const id of ids){
        const n=result.values?.[id];
        current2026.set(id,[1,2].includes(viewerTier)&&typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100
          ?{status:'published',value:n,common:typeof result.common2026?.[id]==='number'&&result.common2026[id]===n?n:null}:{status:'unpublished'});
      }
      refresh();
      if([1,2].includes(viewerTier)){
        for(const card of $('results').querySelectorAll('.school-card')){
          const id=card.dataset.schoolId;
          if(ids.includes(id))renderOfficial2026(card,result.official2026?.[id]||null,
            result.official2026_status==='UNAVAILABLE'?'UNAVAILABLE':'OK',list.find(s=>String(s.school_id)===id));
        }
      }
    }).catch(err=>{
      if(serial!==requestId)return;
      if(err.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인하세요.');return;}
      for(const id of ids)current2026.set(id,{status:'error'});
      refresh();
      if([1,2].includes(viewerTier))for(const card of $('results').querySelectorAll('.school-card'))
        if(ids.includes(card.dataset.schoolId))renderOfficial2026(card,null,'UNAVAILABLE',list.find(s=>String(s.school_id)===card.dataset.schoolId));
    });
  }
  function yearlyPercentileHistory(school,tier){
    const section=make('section','beagu-yearly-percentiles');
    section.append(make('h3','school-history-heading','연도별 배구지수 백분위'));
    const historical=asPublicPercentiles(school),current=current2026.get(String(school.school_id));
    const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
    const values=[1,2].includes(tier)?[...historical,valid(current?.value)?current.value:null]:historical.slice(0,3);
    const years=[1,2].includes(tier)?YEARS:[2023,2024,2025];
    const grid=make('div','percentile-grid');
    for(const year of years){
      const cell=make('div','percentile-cell');cell.dataset.year=String(year);
      const value=values[year-2023];
      const label=valid(value)?value.toFixed(1)+'%':year===2026?
        (current?.status==='error'?'불러오기 실패':current?.status==='unpublished'?'미공개':'확인 중'):'자료 없음';
      cell.append(make('span','',year+'년'),make('strong','',label));grid.append(cell);
    }
    section.append(grid);
    if(typeof percentileChart==='function'){
      const chart=make('div','percentile-graph');
      // Generated only from validated numeric values and fixed year labels.
      chart.style.cssText='width:100%;max-width:440px;margin:0 auto';
      chart.innerHTML=percentileChart(values,{blank2026:!valid(values[3])});
      section.append(chart);
    }
    section.append(make('p','beagu-school-basic-note','연도마다 조사 문항과 비교 기준이 다르므로 백분위를 직접적인 추세로 해석하지 않습니다.'));
    return section;
  }
  function showDetails(host,rows,school,modes=[],selections=[],results2026=[],viewerTier=1) {
    if(![1,2].includes(viewerTier)){host.replaceChildren(make('p','beagu-detail-feedback','Lv.1 인증 후 상세조회할 수 있습니다.'));return;}
    const facilities=make('section','beagu-facilities');
    window.BeaguSchoolFacilities?.render(facilities,modes,results2026,viewerTier);
    if(!window.BeaguSchoolFacilities)facilities.hidden=true;
    host.replaceChildren(facilities,yearlyPercentileHistory(school,viewerTier));
    const allowedYears=[1,2].includes(viewerTier)?YEARS:[];
    const section=make('section','detail beagu-history-detail');
    const vals=asPublicPercentiles(school);
    const prefix='beagu-history-'+String(school.school_id);
    section.append(make('h3','school-history-heading','연도별 상세자료'));
    const tabs=make('div','year-tabs');
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','조사 연도 선택');
    const content=make('div','school-year-details');
    content.id=prefix+'-panel';
    content.setAttribute('role','tabpanel');
    content.tabIndex=0;
    let currentYear=null;
    let latest2026Status='ready';
    const readyByYear=new Map();
    function markSelectedYear(year){
      const card=host.closest('.school-card');
      card?.querySelectorAll('.percentile-cell').forEach(cell=>
        cell.classList.toggle('is-current-year',Number(cell.dataset.year)===year));
    }
    function choose(year){
      if(!allowedYears.includes(year))return;
      currentYear=year;
      for(const button of tabs.children){
        const selected=Number(button.dataset.year)===year;
        button.setAttribute('aria-selected',String(selected));
        button.tabIndex=selected?0:-1;
        if(selected)content.setAttribute('aria-labelledby',button.id);
      }
      markSelectedYear(year);
      const draw=(data,status)=>{
        content.removeAttribute('aria-busy');
        renderYear(content,year,rows,viewerTier===1&&year!==2025?null:vals[year-2023]??null,
          school.school_id,modes,school,data,status,selections,results2026,viewerTier);
      };
      if(year===2026){draw(null,latest2026Status);return;}
      if(readyByYear.has(year)){draw(readyByYear.get(year),'ready');return;}
      const region=String(school.sido_standard||school.sido||'');
      content.setAttribute('aria-busy','true');
      const busy=make('p','beagu-detail-feedback','선택한 연도 결과를 불러오는 중…');
      busy.setAttribute('role','status');
      content.replaceChildren(busy);
      loadGeographyComparisons(year,region).then(result=>{
        if(currentYear!==year||!content.isConnected||host.hidden||!session)return;
        readyByYear.set(year,result);
        draw(result,'ready');
      }).catch(error=>{
        if(error.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인해주세요.');return;}
        if(currentYear===year&&content.isConnected&&!host.hidden)draw(null,'error');
      });
    }
    for(const [index,year] of allowedYears.entries()){
      const button=make('button','',year===2026&&Number(viewerTier)>=1?'2026년 · 최신':year+'년');
      button.id=prefix+'-tab-'+year;
      button.type='button';
      button.dataset.year=String(year);
      button.setAttribute('role','tab');
      button.setAttribute('aria-controls',content.id);
      button.setAttribute('aria-selected','false');
      button.tabIndex=-1;
      button.addEventListener('click',()=>choose(year));
      button.addEventListener('keydown',event=>{
        let next=null;
        if(event.key==='ArrowRight')next=allowedYears[(index+1)%allowedYears.length];
        else if(event.key==='ArrowLeft')next=allowedYears[(index+allowedYears.length-1)%allowedYears.length];
        else if(event.key==='Home')next=allowedYears[0];
        else if(event.key==='End')next=allowedYears[allowedYears.length-1];
        if(next===null)return;
        event.preventDefault();
        choose(next);
        Array.from(tabs.children).find(b=>Number(b.dataset.year)===next)?.focus();
      });
      tabs.append(button);
    }
    section.append(tabs,content);
    host.append(section);
    approved2026Views.set(host,(fresh,failed)=>{
      if(failed){
        rows=(Array.isArray(rows)?rows:[]).filter(row=>Number(row.year)!==2026);
        results2026=[];
        latest2026Status='error';
      }else{
        rows=Array.isArray(fresh?.rows)?fresh.rows:[];
        modes=Array.isArray(fresh?.schoolQuestionModes)?fresh.schoolQuestionModes:[];
        selections=Array.isArray(fresh?.schoolQuestionSelections)?fresh.schoolQuestionSelections:[];
        results2026=Array.isArray(fresh?.schoolQuestionResults2026)?fresh.schoolQuestionResults2026:[];
        viewerTier=Number(fresh?.level)||viewerTier;
        latest2026Status='ready';
      }
      window.BeaguSchoolFacilities?.render(facilities,modes,results2026,viewerTier);
      if(currentYear===2026)choose(2026);
    });
    // A school can have approved historical question distributions even when
    // it has no separately released summary metrics or percentile.
    // Select its most recent available survey year instead of a blank 2025 tab.
    const reviewedYears=new Set((Array.isArray(modes)?modes:[])
      .filter(item=>/^Q\d{2}$/.test(String(item?.questionId||'')) &&
        typeof item?.modeOption==='string'&&item.modeOption.length>0)
      .map(item=>Number(item.year)));
    if(results2026.length)reviewedYears.add(2026);
    const firstAvailable=[2026,2025,2024,2023].find(year=>
      reviewedYears.has(year)||
      (Array.isArray(rows)?rows:[]).some(row=>
        Number(row.year)===year&&Number(row.access_level)<=viewerTier&&
        (Array.isArray(row.summary?.metrics)?row.summary.metrics:[]).length>0));
    // Lv.2 opens newest reviewed data. Never bypass the signed publication gate.
    choose([1,2].includes(viewerTier)&&(current2026.get(String(school.school_id))?.status==='published'||firstAvailable===2026)?2026:2025);
  }

  function render(list, total, sortValue='school_name_asc') {
    current2026=new Map();
    visiblePageSchools=Array.isArray(list)?list:[];
    const host = $('results'); host.dataset.searchMode=mode; host.replaceChildren();
    const pages = Math.ceil(total / LIMIT);
    $('resultCount').textContent = `검색 결과 ${total.toLocaleString()}개${pages > 1 ? ` · ${page * LIMIT + 1}~${page * LIMIT + list.length}번째` : ''}`;
    $('pager').hidden = pages <= 1;
    $('pageInfo').textContent = `${page + 1} / ${pages || 1}`;
    $('prevPage').disabled = page === 0;
    $('nextPage').disabled = page + 1 >= pages;
    if (!list.length) { host.append(make('div','empty','검색 결과가 없습니다.')); return; }
    for (const school of list) {
      const {card,open:button,detail,experience}=BeaguSchoolSearchCard.createCard(school,{
        level:viewerTier,
        percentile:percentilePanel(school),
        sortBy:mode==='region'&&sortValue.startsWith('housing_price_won_')?'school_name_asc':sortValue
      });
      if([1,2].includes(viewerTier))renderOfficial2026(card,null,'LOADING',school);
      let housing=null;
      if(mode!=='region'&&viewerTier>=2){
      housing=make('section','beagu-housing-preview');
      housing.append(make('strong','beagu-housing-label','공동주택 평균 공시가격'));
      const amount=make('div','beagu-housing-amount');
      amount.textContent=BeaguSchoolSearchCard.formatHousingPrice(school.housing_price_won);
      housing.append(amount,make('p','beagu-housing-note',
        '해당 학교가 위치한 행정동의 공동주택 평균 공시가격입니다. 학교 자체나 개별 주택의 가격이 아닙니다.'));
      // Existing level-specific housing information belongs in detailed view.
      }
      const trigger=button;
      if(!trigger||!detail)throw Error('LV1_HISTORY_PANEL_MISSING');
      async function toggleHistory(event){
        const opening=detail.hidden;
        detail.hidden=!opening;
        trigger.setAttribute('aria-expanded',String(opening));
        trigger.textContent=opening?'접기':'상세조회';
        trigger.setAttribute('aria-label',String(school.school_name||'학교')+' 역대 조사결과 '+(opening?'접기':'펼치기'));
        if(!opening||detail.dataset.loaded||detail.dataset.loading==='1')return;
        const action=window.BeaguSearchTelemetry?.selected(String(school.school_id),1,'search-lv1',event);
        detail.dataset.loading='1';
        detail.setAttribute('aria-busy','true');
        detail.replaceChildren(make('p','beagu-detail-feedback','상세 결과를 불러오는 중…'));
        const detailTask=window.BeaguLoading?.start('역대 조사결과를 불러오는 중…');
        try{
          const data=await api('school',{schoolId:school.school_id});
          await loaded;
          // The signed-session API enforces access rights and release status.
          if(!detail.isConnected)return;
          showDetails(detail,data.rows,school,data.schoolQuestionModes,data.schoolQuestionSelections,data.schoolQuestionResults2026,Number(data.level));
          if(housing)detail.prepend(housing);
          const reportFooter=make('div','school-report-footer');reportFooter.append(BeaguSchoolSearchCard.createReportFlag(school));detail.append(reportFooter);const stories=window.BeaguLockerSchoolLinks?.create(String(school.school_id),true);if(stories)detail.append(stories);window.BeaguLockerSchoolLinks?.refresh();
          detail.dataset.loaded='1';
          if(action)window.BeaguSearchTelemetry?.detailViewed(String(school.school_id),1,'search-lv1',action);
        }catch(error){
          if(error.unauthorized){loggedOut('인증이 만료되었습니다. 다시 입력하세요.');return;}
          detail.replaceChildren(make('p','beagu-detail-feedback is-error','불러오지 못했습니다. 접었다가 다시 펼치면 재시도합니다.'));
        }finally{
          delete detail.dataset.loading;
          detail.removeAttribute('aria-busy');
          window.BeaguLoading?.finish(detailTask);
        }
      }
      trigger.addEventListener('click',toggleHistory);
      const recorded=['2023','2024','2025'].filter(y=>
        historicalPresenceByYear[y]?.has(String(school.school_id)));
      BeaguSchoolSearchCard.updateRecordedYears(card,recorded);
      host.append(card);
    }
    loadPagePercentiles(list,serial);
    if (window.BeaguSchoolMBTI) void BeaguSchoolMBTI.decorateCards(host,session);
    void window.BeaguSchoolLikes?.refreshCards(host);
    void window.BeaguSchoolViewCounts?.refreshCards(host);
    void window.BeaguSchoolGamePoints?.refreshCards(host);
    window.BeaguLockerSchoolLinks?.refresh();
  }
  // Existing public directory and signed verification only; no new server dependencies.
  async function localPublicRank(q,region,office,sort,direction,request){
    const checked=await api('verify');
    if(![1,2].includes(Number(checked.level))||Number(checked.level)<level){const e=Error('AUTH_REQUIRED');e.unauthorized=true;throw e;}
    await Promise.all([loaded,basicsReady]);
    if(request!==serial){const e=Error('STALE_SEARCH');e.stale=true;throw e;}
    if(sort==='beagu_percentile_2025'&&!publicStaticAvailable)throw Error('PUBLIC_DATA_UNAVAILABLE');
    if(!['beagu_percentile_2025','game_points'].includes(sort)&&!officialBasicsAvailable)throw Error('OFFICIAL_BASICS_UNAVAILABLE');
    const rows=[],seen=new Set(),size=500;
    let total=null;
    for(let from=0;from===0||from<total;from+=size){
      if(request!==serial){const e=Error('STALE_SEARCH');e.stale=true;throw e;}
      let query=supabaseClient.from('schools').select('school_id,school_name,sido,sido_standard,support_office,address,establishment,status',{count:'exact'}).eq('status','운영');
      if(q)query=query.ilike('school_name','%'+q.replace(/[%_\\]/g,'')+'%');
      if(region)query=query.eq('sido_standard',region);
      if(office)query=query.eq('support_office',office);
      const result=await query.order('school_id',{ascending:true}).range(from,from+size-1);
      if(result.error)throw result.error;
      if(!Array.isArray(result.data)||!Number.isSafeInteger(result.count)||result.count<0||result.count>10000||(total!==null&&result.count!==total))throw Error('DIRECTORY_CHANGED');
      total=result.count;
      if(result.data.length!==Math.min(size,Math.max(0,total-from)))throw Error('INCOMPLETE_DIRECTORY');
      for(const school of result.data){const id=String(school.school_id);if(!/^[A-Z0-9]{7}$/.test(id)||seen.has(id))throw Error('DIRECTORY_CHANGED');seen.add(id);rows.push(school);}
    }
    if(rows.length!==total)throw Error('INCOMPLETE_DIRECTORY');
    const ordered=sort==='game_points'
      ?window.BeaguSchoolGamePoints.rank(rows,await window.BeaguSchoolGamePoints.readTotals(rows.map(s=>s.school_id)),direction)
      :window.BeaguPublicSchoolBasics2026.rank(rows,sort,direction,officialBasicsIndex,publicIndex);
    if(request!==serial){const e=Error('STALE_SEARCH');e.stale=true;throw e;}
    return {schools:ordered.slice(page*LIMIT,(page+1)*LIMIT),total};
  }
  // Public-directory sorts contain no protected prices. Hydrate only the visible
  // Lv.2 page through the existing signed search API; match by exact school ID.
  async function hydrateHousing(list,request){
    if(viewerTier<2)return;
    const pending=list.filter(s=>!Object.prototype.hasOwnProperty.call(s,'housing_price_won'));
    for(let i=0;i<pending.length;i+=4){
      if(request!==serial||viewerTier<2)return;
      await Promise.all(pending.slice(i,i+4).map(async school=>{
        try{
          const region=String(school.sido_standard||school.sido||'');
          for(let p=0;p<10;p++){
            const result=await api('ranked_schools',{searchText:school.school_name,region,office:String(school.support_office||''),sort:'school_name',direction:'asc',page:p});
            if(request!==serial||viewerTier<2)return;
            const match=(result.schools||[]).find(r=>String(r.school_id)===String(school.school_id));
            if(match){school.housing_price_won=match.housing_price_won??null;return;}
            if((p+1)*LIMIT>=Number(result.total||0))return;
          }
        }catch(err){if(err.unauthorized||err.stale)throw err;/* no fabricated price */}
      }));
    }
  }
  async function search(reset,explicitEnter=false) {
    if (reset) page = 0;
    if(!session || $('searchPanel').hidden)return;
    const q = mode === 'school' ? $('searchInput').value.trim() : '';
    const region = mode === 'region' ? $('regionSelect').value : '';
    const office = mode === 'region' ? $('officeSelect').value : '';
    const request = ++serial;
    if ((mode === 'school' && !q) || (mode === 'region' && !region)) {
      visiblePageSchools=[];
      $('results').replaceChildren(); $('resultCount').textContent = ''; $('pager').hidden = true; return;
    }
    $('resultCount').textContent = '검색 중...';
    const searchTask=window.BeaguLoading?.start('학교 검색 결과를 불러오는 중…');
    const perfStarted=performance.now();let perfSucceeded=false;
    try {
      const sortValue=mode==='region'&&SORTS.has($('regionSort').value)&&(viewerTier>=2||$('regionSort').value!=='housing_price_won')?`${$('regionSort').value}_${sortDirection}`:'school_name_asc';
      const sort=sortValue.replace(/_(?:asc|desc)$/,'');
      const direction=sortValue.endsWith('_desc')?'desc':'asc';
      const response=(sort==='game_points'||window.BeaguPublicSchoolBasics2026.metricKeys.has(sort))?await localPublicRank(q,region,office,sort,direction,request):await api('ranked_schools',{searchText:q,region,office,sort,direction,page});
      await basicsReady;
      const data=Array.isArray(response.schools)?response.schools:[];
      const count=Number(response.total)||0;
      if(viewerTier>=2)await hydrateHousing(data,request);
      if (request !== serial) return;
      if(explicitEnter&&q&&count===1&&data.length===1)
        window.BeaguSearchTelemetry?.searchConfirmed(String(data[0].school_id),1,'search-lv1');
      // Do not wait for 750KB public snapshot before drawing the selected schools.
      render(data,count,sortValue);
      perfSucceeded=true;
      void (async()=>{
        await Promise.all([loaded,historicalPresenceReady]);
        if(request!==serial)return;
        if(!publicStaticAvailable&&!data.some(s=>s.staticFactsOnly)){
          try{await recoverPublicIndex(data)}
          catch(e){publicLoadError=true;console.warn('Lv.1 백분위 DB 재조회 실패',e)}
        }
        if(request!==serial)return;
        // Never close a detail the teacher already expanded while auxiliary data loaded.
        if($('results').querySelector('.glory-detail-trigger[aria-expanded="true"]')){
          loadPagePercentiles(data,request);return;
        }
        render(data,count,sortValue);
      })().catch(error=>console.warn('레벨1 공개 보조자료 표시 실패',error));
    } catch (error) {
      if (request !== serial || error.stale) return;
      if(error.unauthorized){loggedOut('인증이 만료되었습니다. 참여코드로 다시 로그인해주세요.');return;}
      console.error(error);
      $('resultCount').textContent = '';
      $('results').replaceChildren(make('div', 'empty', '검색에 실패했습니다.'));
    } finally {
      if(request===serial)
        window.BeaguPerf?.record('school_search',performance.now()-perfStarted,perfSucceeded);
      window.BeaguLoading?.finish(searchTask);
    }
  }
  // Poll ONLY reviewed/approved public data. An on-form-submit event is not
  // itself a release; server review and the 2026 24-hour cooldown still apply.
  // Never poll private Google Sheets or expose school-specific response counts.
  async function refreshApproved2026OnScreen(){
    if(![1,2].includes(viewerTier)||refreshingReleased2026||!session||$('searchPanel').hidden||
       document.visibilityState!=='visible'||!visiblePageSchools.length)return;
    refreshingReleased2026=true;
    const requestId=serial;
    try{
      // A single signed batch request refreshes 2026 cards on the current page.
      loadPagePercentiles(visiblePageSchools,requestId);
      const details=[...$('results').querySelectorAll('.school-card')].filter(card=>{
        const detail=card.querySelector('.school-detail');
        return detail&&!detail.hidden&&detail.dataset.loaded==='1'&&
          detail.querySelector('.year-tabs button[data-year="2026"][aria-selected="true"]')&&
          detail.querySelector('.school-year-details');
      });
      // Refresh only actively expanded 2026 panels; never overwrite other-year tabs.
      await Promise.all(details.map(async card=>{
        const id=String(card.dataset.schoolId||'');
        if(!/^[A-Z0-9]{7}$/.test(id))return;
        try{
          const fresh=await api('school',{schoolId:id});
          if(serial!==requestId||!card.isConnected||!session)return;
          const detail=card.querySelector('.school-detail');
          const tab=detail?.querySelector('.year-tabs button[data-year="2026"][aria-selected="true"]');
          const content=detail?.querySelector('.school-year-details');
          if(!detail||detail.hidden||!tab||!content)return;
          const sync=approved2026Views.get(detail);
          if(sync)sync(fresh,false);
          else renderYear(content,2026,fresh.rows,null,id,fresh.schoolQuestionModes,null,null,
            'ready',fresh.schoolQuestionSelections,fresh.schoolQuestionResults2026,Number(fresh.level));
        }catch(error){
          if(error.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인해주세요.');return;}
          if(serial!==requestId||!card.isConnected||!session)return;
          // A network failure may coincide with a withdrawn school release.
          // Clear the in-memory 2026 snapshot, including tab-switch reuse.
          const detail=card.querySelector('.school-detail');
          approved2026Views.get(detail)?.(null,true);
          console.warn('2026 승인 상태 재확인 실패 · 과거 승인값 숨김',error);
        }
      }));
      if(serial===requestId&&session&&window.BeaguSchoolMBTI){
        window.BeaguSchoolMBTI.invalidateCache?.();
        await window.BeaguSchoolMBTI.decorateCards($('results'),session);
      }
    }finally{refreshingReleased2026=false;}
  }
  // Google Forms responses are privately ingested independently. This timer
  // only detects *newly approved* publications on a visible authenticated page.
  window.setInterval(()=>{void refreshApproved2026OnScreen()},60000);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void refreshApproved2026OnScreen();
  });
  (async () => {
    if (!session) { loggedOut(); return; }
    const generation=authGeneration, verifyingToken=session;
    try {
      const state = await api('verify');
      if(generation!==authGeneration||session!==verifyingToken)return;
      if ([1,2].includes(Number(state.level)) && Number(state.level) >= level) {viewerTier=Number(state.level);loggedIn();}
      else loggedOut('현재 코드가 이 등급에 미달합니다.');
    } catch (_) { if(generation===authGeneration&&session===verifyingToken)loggedOut('인증을 다시 진행해주세요.'); }
  })();
})();
