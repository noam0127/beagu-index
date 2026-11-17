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
  let session = sessionStorage.getItem(key) || '';
  let mode = 'school', page = 0, timer, serial = 0;
  const LIMIT = 20;
  const YEARS = [2023, 2024, 2025, 2026];
  const conciseQuestion=value=>String(value||'').replace(
    /^\s*\(\d+\s*[~～〜\-–]\s*\d+\)\s*아래는\s*있다\s*,\s*없다\s*혹은\s*모름을\s*체크해\s*주세요\s*/u,
    ''
  ).trim();
  // Exact education office names come from the verified schools table.
  let officeLoadSerial=0;
  const SORTS=new Set(['school_name_asc','school_name_desc','address_asc','address_desc','beagu_percentile_2025_desc','student_count_desc','housing_price_won_desc']);
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
  let historicalPresenceByYear={};
  const geographyComparisons=new Map(); // approved national/province benchmarks; never school responses

  const historicalPresenceReady=fetch('data/public-2023-2025-school-records-v2.json?v=20261118',{cache:'no-cache'})
    .then(r=>{if(!r.ok)throw new Error('과거 조사 기록 파일 조회 실패');return r.json()})
    .then(data=>{
      const years=data?.schoolIdsByYear;
      if(!years||!['2023','2024','2025'].every(y=>Array.isArray(years[y])&&
          years[y].every(id=>typeof id==='string'&&/^[A-Z0-9]{7}$/.test(id))))return;
      historicalPresenceByYear=Object.fromEntries(
        ['2023','2024','2025'].map(y=>[y,new Set(years[y])]));
    }).catch(e=>{console.warn('조사 기록이 표시되지 않아도 기존 검색은 유지됩니다.',e)});

  const loaded = fetch('data/public-lv0-percentiles-v1.2.json?v=20261031-empirical2025', {cache:'force-cache'})
    .then(r => { if (!r.ok) throw new Error('PUBLIC_DATA_UNAVAILABLE'); return r.json(); })
    .then(data => { publicIndex = BeaguPublic.buildIndex(data); publicStaticAvailable = true; })
    .catch(error => { console.warn('공개 백분위 파일 미응답, 승인 DB를 사용합니다.', error); });

  async function recoverPublicIndex(list) {
    if(publicStaticAvailable || !list.length) return;
    const ids=[...new Set(list.map(s=>String(s.school_id))
      .filter(id=>id.length===7 && [...id].every(c=>c>='0'&&c<='9')))];
    if(!ids.length) return;
    const {data,error}=await supabaseClient.from('beagu_school_report_yearly')
      .select('school_id,survey_year,percentile').in('school_id',ids)
      .eq('publication_status','PUBLISHED').in('survey_year',[2023,2024,2025]).limit(100);
    if(error) throw error;
    for(const id of ids) {
      const values=[null,null,null],statuses=['NO_PUBLISHED_VALUE','NO_PUBLISHED_VALUE','NO_PUBLISHED_VALUE'];
      for(const row of data||[]) {
        if(String(row.school_id)!==id || row.percentile===null) continue;
        const i=[2023,2024,2025].indexOf(Number(row.survey_year)),n=Number(row.percentile);
        if(i>=0 && Number.isFinite(n) && n>=0 && n<=100){
          values[i]=n;statuses[i]='EXISTING_PUBLIC_VALUE_PRESERVED';
        }
      }
      publicIndex.set(id,{percentiles:values,statuses});
    }
    publicLoadError=false;
  }

  function loggedOut(message = '') {
    session = '';
    geographyComparisons.clear();
    sessionStorage.removeItem(key);
    $('loginPanel').hidden = false;
    $('searchPanel').hidden = true;
    $('loginMessage').textContent = message;
  }
  function loggedIn() {
    $('loginPanel').hidden = true;
    $('searchPanel').hidden = false;
  }
  async function api(action, payload = {}) {
    const response = await fetch(base, {
      method: 'POST', cache: 'no-store',
      headers: {'Content-Type':'application/json', 'X-Beagu-Session':session},
      body: JSON.stringify({action, ...payload})
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      const error = new Error('인증 만료'); error.unauthorized = true; throw error;
    }
    if (!response.ok) throw new Error(data.error || '서버 오류');
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
      if (data.level < level) {
        $('loginMessage').textContent = '이 등급에서 사용할 수 없는 참여코드입니다.';
        return;
      }
      session = data.token;
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
  function selectMode(nextMode) {
    mode = nextMode;
    $('schoolPanel').hidden = mode !== 'school';
    $('regionPanel').hidden = mode !== 'region';
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
      if(err.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인해주세요.');return;}
      select.replaceChildren(new Option('교육청 목록을 다시 불러오려면 시도를 다시 선택하세요',''));
      select.disabled=true;
    }
  });
  $('officeSelect').addEventListener('change', () => search(true));
  // 지역 찾기만 선택형 정렬을 사용합니다. 서버는 페이지 나누기 전에 정렬합니다.
  $('regionSort').addEventListener('change',()=>{
    if(SORTS.has($('regionSort').value))void search(true);
  });
  $('searchInput').addEventListener('input', () => {
    clearTimeout(timer); timer = setTimeout(() => search(true), 250);
  });
  $('searchInput').addEventListener('keydown',event=>{
    if(event.key!=='Enter'||event.isComposing||!$('searchInput').value.trim())return;
    event.preventDefault();clearTimeout(timer);void search(true,true);
  });
  $('prevPage').addEventListener('click', () => { page = Math.max(0, page - 1); search(false); });
  $('nextPage').addEventListener('click', () => { page++; search(false); });

  function addRow(host, label, value, comparison = null) {
    const div = make('div', 'data-row');
    if (!comparison || comparison.group!=='편집본 공식 학교정보') {
      div.append(make('span', '', label), make('strong', '', value));
      host.append(div);
      return;
    }
    div.style.cssText='display:block;padding:14px 0';
    const heading=make('div','compare-label',label);
    heading.style.cssText='font-weight:700;margin-bottom:8px';
    const grid=make('div','compare-grid');
    grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;width:100%';
    const kind=comparison.comparisonKind==='mode'?'최빈 보기':'평균';
    for (const [name,v] of [
      ['우리 학교',value],
      ['전국 '+kind,comparison.nationalAverage||'비교 자료 없음'],
      ['지역 '+kind,comparison.regionalAverage||'비교 자료 없음']
    ]) {
      const cell=make('div','compare-value');
      cell.style.cssText='border:1px solid #dce6f5;border-radius:10px;padding:10px;min-width:0';
      const labelNode=make('span','',name);
      labelNode.style.cssText='display:block;font-size:12px;color:#63758f;margin-bottom:4px';
      const valueNode=make('strong','',v);
      valueNode.style.cssText='display:block;font-size:16px;overflow-wrap:anywhere';
      cell.append(labelNode,valueNode);grid.append(cell);
    }
    div.append(heading,grid);
    if(Number.isInteger(comparison.referenceYear)) {
      const note=make('small','detail-note',comparison.referenceYear+'년 자료 기준 · 검수된 학교들만 집계한 비교값');
      note.style.cssText='display:block;margin-top:6px;font-size:11px';
      div.append(note);
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
  function renderHistoricalBenchmarks(host,year,school,distributions,comparison,loadStatus){
    const questions=window.BeaguHistoricalOriginalQuestions?.[String(year)]||{};
    const qids=Object.keys(questions).filter(id=>/^Q\d{2}$/.test(id)).sort();
    if(!qids.length)return;
    const section=make('section','data-section');
    section.append(make('h4','','역대 문항별 결과 · 전국·지역 비교'));
    const intro=make('p','detail-note',
      '학교 고유 결과는 별도 공개 심사를 통과한 경우에만 표시합니다. 그 외에는 학교가 속한 시도 및 전국의 검증된 집계값을 참고값으로 제공합니다. 지역·전국 기준값은 해당 학교의 응답이 아닙니다.');
    intro.style.cssText='margin:8px 0 14px;line-height:1.6';
    section.append(intro);
    const all=comparison?.items&&typeof comparison.items==='object'?comparison.items:{};
    const nationalCount=qids.filter(id=>typeof all[id]?.national?.mean==='string'||typeof all[id]?.national?.mode==='string').length;
    const regionalCount=qids.filter(id=>typeof all[id]?.regional?.mean==='string'||typeof all[id]?.regional?.mode==='string').length;
    const overview=make('p','detail-note',
      loadStatus==='loading'?'승인된 전국·지역 비교값을 확인하는 중…':
      loadStatus==='error'?'비교값 연결에 실패했습니다. 연도를 다시 선택하면 재조회합니다.':
      '확인된 비교 문항: 전국 '+nationalCount+'/'+qids.length+' · 지역 '+regionalCount+'/'+qids.length);
    overview.style.cssText='margin:8px 0 14px;font-weight:600';
    section.append(overview);
    const vetted=new Map((Array.isArray(distributions)?distributions:[])
      .filter(d=>Number(d.year)===year && /^Q\d{2}$/.test(String(d.questionId||'')) &&
        typeof d.modeOption==='string'&&Array.isArray(d.roundedDistribution))
      .map(d=>[d.questionId,d.modeOption]));
    const region=String(school?.sido_standard||school?.sido||'지역');
    for(const id of qids){
      const block=make('article','historical-question-row');
      block.style.cssText='margin:12px 0;padding:14px;border:1px solid #dbe5f3;border-radius:12px;background:#fff';
      const header=make('h5','',id+' · '+conciseQuestion(questions[id]));
      header.style.cssText='font-size:14px;line-height:1.65;margin:0 0 10px;color:#1d314e;overflow-wrap:anywhere';
      block.append(header);
      const comparisonValues=all[id]||{};
      const benchmark=m=>{
        if(!m||typeof m!=='object')return null;
        const preferred=m.kind==='most_frequent'||m.kind==='mode'?m.mode||m.mean:m.mean||m.mode;
        return typeof preferred==='string'&&preferred.length<=180?preferred:null;
      };
      const cells=[
        ['우리 학교',vetted.get(id)||null,'school'],
        [region+' 참고값',benchmark(comparisonValues.regional),'region'],
        ['전국 참고값',benchmark(comparisonValues.national),'nation']
      ];
      const grid=make('div','historical-benchmark-grid');
      grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px';
      for(const [label,value,role] of cells){
        const cell=make('div','historical-benchmark-value '+role);
        cell.style.cssText='border:1px solid #e2e8f0;border-radius:9px;padding:10px;min-width:0;overflow-wrap:anywhere';
        const top=make('span','',label);
        top.style.cssText='display:block;font-size:11px;color:#62758d;margin-bottom:5px';
        const hasValue=typeof value==='string'&&value.trim();
        const display=hasValue?value:role==='school'?'학교별 문항 집계 미공개':'비교 자료 없음';
        const val=make('strong','',display);
        val.style.cssText='display:block;font-size:13px;line-height:1.5;color:'+(hasValue?'#142a47':'#748299');
        cell.append(top,val);grid.append(cell);
      }
      block.append(grid);
      const optionData=verifiedOptions(year,id);
      if(optionData.values.length){
        const title=make('div','',optionData.source==='verified'?'원본 설문 보기':'원자료에서 확인된 보기 (전체 목록 미확인)');
        title.style.cssText='font-size:12px;font-weight:700;margin:13px 0 4px;color:#425675';
        const list=make('ul','historical-answer-choices');
        list.style.cssText='padding-left:18px;margin:0;font-size:12px;line-height:1.7;color:#59677b';
        for(const value of optionData.values){
          if(typeof value!=='string'||value.length>180)continue;
          const li=make('li','',value);list.append(li);
        }
        block.append(title,list);
      }else{
        const note=make('p','detail-note','해당 문항의 원본 선택지는 아직 검증되지 않았습니다.');
        note.style.cssText='margin:10px 0 0;font-size:12px';
        block.append(note);
      }
      section.append(block);
    }
    host.append(section);
  }

  function renderYear(host, year, rows, publicValue, schoolId, distributions=[], school=null,comparison=null,loadStatus='loading') {
    host.replaceChildren();
    host.append(make('h3', '', `${year}년 조사 결과`));
    // The unified school report contains the verified original question titles
    // and clearly labels unavailable or privacy-restricted answer aggregates.
    // This link does not grant access or expose any private response records.
    if(/^[A-Z0-9]{7}$/.test(String(schoolId))){
      const allQuestions=make('a','question-catalog-link',year+'년 전체 조사 문항·공개 상태 보기');
      allQuestions.href='school-report.html?school_id='+encodeURIComponent(String(schoolId))+'&year='+year;
      allQuestions.style.cssText='display:block;margin:12px 0 18px;padding:12px 14px;border:1px solid #b9cbea;border-radius:10px;color:#1d4ed8;text-decoration:none;font-weight:700;background:#f8fbff';
      host.append(allQuestions);
    }
    if(year === 2026) {
      const vetted = metrics2026(rows);
      if(vetted.length) {
        BeaguDetailGroups.appendGrouped(host,vetted,(body,m)=>addRow(body,m.label,metricValue(m)));
      } else {
        host.append(make('p','detail-note','2026년 학교별 문항 결과는 아직 공개 승인되지 않았습니다. 실시간 원응답은 공개하지 않습니다.'));
      }
      const reload = make('button','year-2026-button','2026년 승인 결과 새로고침');
      reload.type='button';
      reload.addEventListener('click',async()=>{
        reload.disabled=true;
        reload.textContent='승인 결과 확인 중...';
        try {
          const fresh=await api('school',{schoolId:String(schoolId)});
          renderYear(host,2026,fresh.rows,null,schoolId);
        } catch(e) {
          if(e.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인해주세요.');return;}
          reload.disabled=false;
          reload.textContent='다시 조회하기';
          host.append(make('p','detail-note','연결 오류로 최신 승인 결과를 확인하지 못했습니다.'));
        }
      });
      host.append(reload);
      return;
    }
    const yearRows = (Array.isArray(rows) ? rows : []).filter(row =>
      Number(row.year) === year && Number(row.access_level) === level
    );
    // Public value is loaded from the separately vetted Lv.0 dataset.
    const legacy = make('div', 'data-section');
    legacy.append(make('h4', '', '기존 공개 백분위'));
    addRow(legacy, `${year}년 전국 백분위`, publicValue === null ? '자료 없음' : publicValue.toFixed(1) + '%');
    host.append(legacy);
    // Only safety-checked, coarsened school distributions supplied by the
    // signed-session API are rendered. No raw responses or respondent counts.
    const vetted=(Array.isArray(distributions)?distributions:[]).filter(d=>
      Number(d?.year)===year && /^Q\d{2}$/.test(String(d?.questionId||'')) &&
      typeof d.modeOption==='string' && Array.isArray(d.roundedDistribution));
    if(vetted.length){
      const section=make('section','data-section');
      section.append(make('h4','','학교별 검증 설문 응답 분포'));
      section.append(make('p','detail-note','원본과 학교를 대조하고 소수 응답을 검토한 항목만 표시합니다. 비율은 10% 단위로 반올림해 합계가 100%와 다를 수 있습니다.'));
      for(const item of vetted){
        const card=make('div','section-card');
        const names=window.BeaguHistoricalOriginalQuestions?.[String(year)]||{};
        card.append(make('h4','',item.questionId+' · '+conciseQuestion(names[item.questionId]||'원본 질문 확인 필요')));
        addRow(card,'학교별 최다 선택 보기',item.modeOption);
        const d=make('div','question-distribution');
        for(const answer of item.roundedDistribution){
          const pct=Number(answer?.pct);
          if(typeof answer?.label!=='string'||!Number.isInteger(pct)||pct<0||pct>100||pct%10!==0)continue;
          const row=make('div','',answer.label+' · 약 '+pct+'%');
          row.style.cssText='margin:6px 0;font-size:13px;color:#334155';
          const track=make('div','');
          track.style.cssText='height:7px;margin:3px 0 10px;border-radius:6px;background:#e8eef8;overflow:hidden';
          const bar=make('div','');
          bar.style.cssText='height:100%;width:'+pct+'%;background:#2563eb;border-radius:6px';
          track.append(bar);d.append(row,track);
        }
        card.append(d);section.append(card);
      }
      host.append(section);
    }
    renderHistoricalBenchmarks(host,year,school,distributions,comparison,loadStatus);
    const section = make('div', 'data-section');
    section.append(make('h4', '', 'Lv.1 승인 통계'));
    if (!yearRows.length) {
      section.append(make('p', 'detail-note', '해당 연도에 추가로 공개 승인된 학교 통계가 없습니다.'));
      host.append(section);
      return;
    }
    let count = 0, hadRestricted = false, hadMismatch = false;
    const releasedMetrics=[];
    for (const row of yearRows) {
      if (row.insufficient) { hadRestricted = true; continue; }
      // The edge function only emits a curated summary.metrics array.
      // NEVER use the underlying database's historical_values, survey_summary,
      // raw school rows, rankings, or unsanitized source keys.
      for (const metric of Array.isArray(row.summary?.metrics) ? row.summary.metrics : []) {
        if (typeof metric?.label !== 'string' || typeof metric?.value !== 'string') continue;
        if (isDuplicatePublicPercentile(metric, year, publicValue)) continue;
        if (metric.label.includes(String(year)) && metric.label.includes('백분위') && publicValue !== null)
          hadMismatch = true;
        releasedMetrics.push({label:metric.label,value:metric.value,group:metric.group,nationalAverage:metric.nationalAverage,regionalAverage:metric.regionalAverage,comparisonKind:metric.comparisonKind,referenceYear:metric.referenceYear});
        count++;
      }
    }
    BeaguDetailGroups.appendGrouped(section,releasedMetrics,(body,m)=>addRow(body,m.label,m.value,m));
    if (hadMismatch) section.append(make('p', 'detail-note', '백분위 출처별 값이 달라 원본 검수가 필요합니다. 임의로 합치지 않았습니다.'));
    if (hadRestricted) section.append(make('p', 'detail-note', '승인 범위에 따라 일부 세부 항목은 공개하지 않습니다.'));
    if (!count && !hadRestricted) section.append(make('p', 'detail-note', '추가 승인 통계가 없습니다. 위의 기존 공개 백분위를 참고하세요.'));
    if (year === 2025) section.append(make('p', 'detail-note', '영역별 점수는 해당 연도 조사 방식에 따른 참고자료입니다.'));
    else section.append(make('p', 'detail-note', '학교별 상세 문항 결과는 공개 승인된 집계만 표시합니다. 미검수 문항은 제공하지 않습니다.'));
    host.append(section);
  }


  function metrics2026(rows) {
    return (Array.isArray(rows) ? rows : []).filter(r => Number(r.year) === 2026 && Number(r.access_level) === 1)
      .flatMap(r => Array.isArray(r.summary?.metrics) ? r.summary.metrics : [])
      .filter(m => typeof m?.label === 'string' && (typeof m.value === 'number' || typeof m.value === 'string') && !/응답|관측|표본|횟수|회수/i.test(m.label));
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
      status2026:current?.status || 'loading',
      locked:false
    });
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
          if(old)old.replaceWith(percentilePanel(school));
          break;
        }
      }
    };
    api('percentiles',{schoolIds:ids}).then(result=>{
      if(serial!==requestId)return;
      for(const id of ids){
        const n=result.values?.[id];
        current2026.set(id,typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100
          ?{status:'published',value:n}:{status:'unpublished'});
      }
      refresh();
    }).catch(err=>{
      if(serial!==requestId)return;
      if(err.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인하세요.');return;}
      for(const id of ids)current2026.set(id,{status:'error'});
      refresh();
    });
  }
  function showDetails(host, rows, school, distributions=[]) {
    host.replaceChildren();
    const section=make('section','detail');
    const vals=asPublicPercentiles(school);
    const profile = make('section', 'school-profile');
    profile.append(make('h3', '', '학교 기본정보'));
    for (const [label, value] of [
      ['학교명', school.school_name],
      ['시도', school.sido_standard || school.sido],
      ['교육지원청', school.support_office],
      ['주소', school.address],
      ['설립유형', school.establishment],
      ['학교급', school.school_kind]
    ]) addRow(profile, label, value || '자료 없음');
    section.append(profile);

    // Surface the already approved Lv.1 school-size facts before the history tabs.
    // Values are received only from the session-validated Edge Function.
    const published=(Array.isArray(rows)?rows:[])
      .filter(r=>[2024,2025].includes(Number(r.year))&&Number(r.access_level)===1)
      .flatMap(r=>(Array.isArray(r.summary?.metrics)?r.summary.metrics:[])
        .filter(m=>m.group==='편집본 공식 학교정보'&&typeof m.label==='string'&&typeof m.value==='string')
        .map(m=>({year:Number(r.year),label:m.label,value:m.value,group:m.group,nationalAverage:m.nationalAverage,regionalAverage:m.regionalAverage,comparisonKind:m.comparisonKind,referenceYear:m.referenceYear})));
    const schoolScale=[];
    const seen=new Set();
    for(const year of [2025,2024]){
      for(const fact of published.filter(x=>x.year===year)){
        if(seen.has(fact.label))continue;
        seen.add(fact.label);
        schoolScale.push({...fact,group:'학교 기본·교직원·시설 정보'});
      }
    }
    if(schoolScale.length){
      BeaguDetailGroups.appendGrouped(section,schoolScale,(body,m)=>addRow(body,m.label,m.value,{...m,group:'편집본 공식 학교정보'}));
    }else{
      section.append(make('p','detail-note','이 학교의 추가 승인 규모정보는 아직 없습니다. 과거 백분위는 아래에서 확인할 수 있습니다.'));
    }




    section.append(make('h3', 'school-history-heading', '연도별 상세자료 · 2023~2026'));
    const tabs = make('div', 'year-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '2023년부터 2026년까지 결과 연도 선택');
    const content = make('div', 'school-year-details');
    content.setAttribute('role', 'tabpanel');
    let currentYear=null;
    const readyByYear=new Map();
    function choose(year) {
      currentYear=year;
      for (const button of tabs.children) {
        button.setAttribute('aria-selected', String(Number(button.dataset.year) === year));
      }
      const draw=(data,status)=>renderYear(content,year,rows,vals[year-2023]??null,
        school.school_id,distributions,school,data,status);
      if(year===2026){draw(null,'ready');return;}
      if(readyByYear.has(year)){draw(readyByYear.get(year),'ready');return;}
      const region=String(school.sido_standard||school.sido||'');
      draw(null,'loading');
      loadGeographyComparisons(year,region).then(result=>{
        if(currentYear!==year||!content.isConnected||host.hidden||!session)return;
        readyByYear.set(year,result);
        draw(result,'ready');
      }).catch(error=>{
        if(error.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인해주세요.');return;}
        if(currentYear===year&&content.isConnected&&!host.hidden)draw(null,'error');
      });
    }
    for (const year of YEARS) {
      const button = make('button', '', year + '년');
      button.type = 'button';
      button.dataset.year = String(year);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
      button.addEventListener('click', () => choose(year));
      tabs.append(button);
    }
    section.append(tabs, content);
    if (window.BeaguSchoolMBTI) section.append(BeaguSchoolMBTI.createDetail(String(school.school_id), session));

    section.append(make('p', 'detail-note',
      '연도별 조사 문항·산정 기준이 다릅니다. 2025년 백분위는 8개 영역 종합값을 조사 비교집단 1,458개교에서 재산출한 값으로, 이전 연도와 직접 비교하지 마세요.'));
    host.append(section);
    const firstAvailable = [2025, 2024, 2023].find(year =>
      (Array.isArray(rows) ? rows : []).some(row =>
        Number(row.year) === year && Number(row.access_level) === level &&
        (Array.isArray(row.summary?.metrics) ? row.summary.metrics : []).length > 0
      )
    );
    choose(firstAvailable || 2025);
  }

  function render(list, total, sortValue='school_name_asc') {
    current2026=new Map();
    const host = $('results'); host.replaceChildren();
    const pages = Math.ceil(total / LIMIT);
    $('resultCount').textContent = `검색 결과 ${total.toLocaleString()}개${pages > 1 ? ` · ${page * LIMIT + 1}~${page * LIMIT + list.length}번째` : ''}`;
    $('pager').hidden = pages <= 1;
    $('pageInfo').textContent = `${page + 1} / ${pages || 1}`;
    $('prevPage').disabled = page === 0;
    $('nextPage').disabled = page + 1 >= pages;
    if (!list.length) { host.append(make('div','empty','검색 결과가 없습니다.')); return; }
    for (const school of list) {
      const {card,open:button,detail}=BeaguSchoolSearchCard.createCard(school,{
        level:1,
        percentile:percentilePanel(school)
      });
      // Only show the chosen metric when sorting a regional list; values come from the existing authenticated sort API.
      if(mode==='region'){
        const metricSort={
          beagu_percentile_2025_desc:['2025 배구지수',school.beagu_percentile_2025,v=>Number(v).toFixed(2)+'%'],
          student_count_desc:['학생 수',school.student_count,v=>Number(v).toLocaleString('ko-KR')+'명'],
          housing_price_won_desc:['공동주택 평균 공시가격',school.housing_price_won,v=>Number(v).toLocaleString('ko-KR')+'원']
        }[sortValue];
        if(metricSort){
          const [label,value,format]=metricSort;
          const numeric=value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
          card.append(make('div','sort-result',label+' · '+(numeric?format(value):'자료 없음')));
        }
      }
      const recorded=['2023','2024','2025'].filter(y=>
        historicalPresenceByYear[y]?.has(String(school.school_id)));
      if(recorded.length)card.append(make('div','sort-result',recorded.join(' · ')+'년 조사 기록 있음'));
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', async (event) => {
        if (!detail.hidden) {
          detail.hidden = true;
          button.textContent = '🔍 연도별 상세 기록 보기';
          button.setAttribute('aria-expanded', 'false');
          return;
        }
        const action=window.BeaguSearchTelemetry?.selected(String(school.school_id),1,'search-lv1',event);
        detail.hidden = false;
        button.textContent = '상세보기 접기';
        button.setAttribute('aria-expanded', 'true');
        if (detail.dataset.loaded) return;
        detail.textContent = '불러오는 중...';
        const detailTask=window.BeaguLoading?.start('학교 상세자료를 불러오는 중…');
        try {
          const data = await api('school', {schoolId:school.school_id});
          await loaded;
          // The server enforces the session's authorization and release_status.
          showDetails(detail, data.rows, school, data.schoolDistributions);
          detail.dataset.loaded = '1';
          if(action)window.BeaguSearchTelemetry?.detailViewed(String(school.school_id),1,'search-lv1',action);
        } catch (error) {
          if (error.unauthorized) { loggedOut('인증이 만료되었습니다. 다시 입력하세요.'); return; }
          detail.textContent = '자료를 불러오지 못했습니다. 다시 열람해 주세요.';
        } finally {
          window.BeaguLoading?.finish(detailTask);
        }
      });
      host.append(card);
      // A unique school search should show the approved tier data immediately.
      if (list.length === 1 && total === 1) button.click();
    }
    loadPagePercentiles(list,serial);
    if (window.BeaguSchoolMBTI) void BeaguSchoolMBTI.decorateCards(host,session);
  }
  async function search(reset,explicitEnter=false) {
    if (reset) page = 0;
    const q = mode === 'school' ? $('searchInput').value.trim() : '';
    const region = mode === 'region' ? $('regionSelect').value : '';
    const office = mode === 'region' ? $('officeSelect').value : '';
    const request = ++serial;
    if ((mode === 'school' && !q) || (mode === 'region' && !region)) {
      $('results').replaceChildren(); $('resultCount').textContent = ''; $('pager').hidden = true; return;
    }
    $('resultCount').textContent = '검색 중...';
    const searchTask=window.BeaguLoading?.start('학교 검색 결과를 불러오는 중…');
    try {
      const sortValue=mode==='region'&&SORTS.has($('regionSort').value)?$('regionSort').value:'school_name_asc';
      const sort=sortValue.replace(/_(?:asc|desc)$/,'');
      const direction=sortValue.endsWith('_desc')?'desc':'asc';
      const response=await api('ranked_schools',{searchText:q,region,office,sort,direction,page});
      const data=Array.isArray(response.schools)?response.schools:[];
      const count=Number(response.total)||0;
      if (request !== serial) return;
      await Promise.all([loaded,historicalPresenceReady]);
      if (request !== serial) return;
      if(!publicStaticAvailable) {
        try { await recoverPublicIndex(data||[]); }
        catch(e){ publicLoadError=true; console.warn('Lv.1 백분위 DB 재조회 실패',e); }
      }
      if (request !== serial) return;
      if(explicitEnter&&q&&count===1&&Array.isArray(data)&&data.length===1)
        window.BeaguSearchTelemetry?.searchConfirmed(String(data[0].school_id),1,'search-lv1');
      render(data || [], count || 0, sortValue);
    } catch (error) {
      if (request !== serial) return;
      if(error.unauthorized){loggedOut('인증이 만료되었습니다. 참여코드로 다시 로그인해주세요.');return;}
      console.error(error);
      $('resultCount').textContent = '';
      $('results').replaceChildren(make('div', 'empty', '검색에 실패했습니다.'));
    } finally {
      window.BeaguLoading?.finish(searchTask);
    }
  }
  (async () => {
    if (!session) { loggedOut(); return; }
    try {
      const state = await api('verify');
      if (state.level >= level) loggedIn();
      else loggedOut('현재 코드가 이 등급에 미달합니다.');
    } catch (_) { loggedOut('인증을 다시 진행해주세요.'); }
  })();
})();
