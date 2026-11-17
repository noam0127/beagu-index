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
  // Exact education office names come from the verified schools table.
  let selectedSort='school_name',officeLoadSerial=0;
  const SORTS=new Set(['school_name','beagu_percentile_2025','student_count','housing_price_won']);
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
    try {
      const data = await api('login', {code});
      if (data.level < level) {
        $('loginMessage').textContent = '이 등급에서 사용할 수 없는 참여코드입니다.';
        return;
      }
      session = data.token;
      sessionStorage.setItem(key, session);
      $('levelCode').value = '';
      loggedIn();
      $('searchInput').focus();
    } catch (_) {
      $('loginMessage').textContent = '참여코드를 확인해주세요.';
    } finally {
      $('loginButton').disabled = false;
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
      for(const value of values) select.add(new Option(value,value));
      select.disabled=false;
    }catch(err){
      if(run!==officeLoadSerial)return;
      if(err.unauthorized){loggedOut('인증이 만료되었습니다. 다시 로그인해주세요.');return;}
      select.replaceChildren(new Option('교육청 목록을 다시 불러오려면 시도를 다시 선택하세요',''));
      select.disabled=true;
    }
  });
  $('officeSelect').addEventListener('change', () => search(true));
  // Sort is applied by the backend BEFORE pagination. Never sort only the 20 visible cards.
  for(const button of document.querySelectorAll('#sortTabs [data-sort]')){
    button.addEventListener('click',()=>{
      if(!SORTS.has(button.dataset.sort))return;
      selectedSort=button.dataset.sort;
      for(const b of document.querySelectorAll('#sortTabs [data-sort]'))
        b.setAttribute('aria-pressed',String(b===button));
      void search(true);
    });
  }
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
  function renderYear(host, year, rows, publicValue, schoolId) {
    host.replaceChildren();
    host.append(make('h3', '', `${year}년 조사 결과`));
    // The unified school report contains the verified original question titles
    // and clearly labels unavailable or privacy-restricted answer aggregates.
    // This link does not grant access or expose any private response records.
    if(/^\d{7}$/.test(String(schoolId))){
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
    const ids=[...new Set(list.map(s=>String(s.school_id)).filter(id=>/^\d{7}$/.test(id)))];
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
  function showDetails(host, rows, school) {
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
    function choose(year) {
      for (const button of tabs.children) {
        button.setAttribute('aria-selected', String(Number(button.dataset.year) === year));
      }
      renderYear(content, year, rows, vals[year - 2023] ?? null, school.school_id);
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

  function render(list, total) {
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
      const sortValue=selectedSort==='beagu_percentile_2025'
        ?(school.beagu_percentile_2025==null?'자료 없음':Number(school.beagu_percentile_2025).toFixed(2)+'%')
        :selectedSort==='student_count'
        ?(school.student_count==null?'자료 없음':Number(school.student_count).toLocaleString('ko-KR')+'명')
        :selectedSort==='housing_price_won'
        ?(school.housing_price_won==null?'자료 없음':Number(school.housing_price_won).toLocaleString('ko-KR')+'원')
        :null;
      if(sortValue!==null){
        const tag=make('div','sort-result',
          (selectedSort==='beagu_percentile_2025'?'2025 배구지수 백분위'
           :selectedSort==='student_count'?'학생 수'+(school.student_reference_year?' ('+school.student_reference_year+'년 기준)':'')
           :'행정구역 공동주택 평균 공시가격')+' · '+sortValue);
        const meta=card.querySelector('.school-meta')||card.querySelector('.school-name');
        if(meta&&meta.parentNode)meta.insertAdjacentElement('afterend',tag);
        else card.append(tag);
      }
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
        try {
          const data = await api('school', {schoolId:school.school_id});
          await loaded;
          // The server enforces the session's authorization and release_status.
          showDetails(detail, data.rows, school);
          detail.dataset.loaded = '1';
          if(action)window.BeaguSearchTelemetry?.detailViewed(String(school.school_id),1,'search-lv1',action);
        } catch (error) {
          if (error.unauthorized) { loggedOut('인증이 만료되었습니다. 다시 입력하세요.'); return; }
          detail.textContent = '자료를 불러오지 못했습니다. 다시 열람해 주세요.';
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
    try {
      const response=await api('ranked_schools',{searchText:q,region,office,sort:selectedSort,page});
      const data=Array.isArray(response.schools)?response.schools:[];
      const count=Number(response.total)||0;
      if (request !== serial) return;
      await loaded;
      if (request !== serial) return;
      if(!publicStaticAvailable) {
        try { await recoverPublicIndex(data||[]); }
        catch(e){ publicLoadError=true; console.warn('Lv.1 백분위 DB 재조회 실패',e); }
      }
      if (request !== serial) return;
      if(explicitEnter&&q&&count===1&&Array.isArray(data)&&data.length===1)
        window.BeaguSearchTelemetry?.searchConfirmed(String(data[0].school_id),1,'search-lv1');
      render(data || [], count || 0);
    } catch (error) {
      if (request !== serial) return;
      console.error(error);
      $('resultCount').textContent = '';
      $('results').replaceChildren(make('div', 'empty', '검색에 실패했습니다.'));
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
