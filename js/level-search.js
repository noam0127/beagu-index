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
  const YEARS = [2023, 2024, 2025];
  const offices = {
    '서울':'강남서초 강동송파 강서양천 남부 동부 동작관악 북부 서부 성동광진 성북강북 중부',
    '부산':'남부 동래 북부 서부 해운대',
    '대구':'군위 남부 달성 동부 서부',
    '인천':'강화 남부 동부 북부 서부',
    '광주':'동부 서부', '대전':'동부 서부', '울산':'강남 강북', '세종':'세종',
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
  const prefixes = {
    '서울':'서울특별시', '부산':'부산광역시', '대구':'대구광역시', '인천':'인천광역시',
    '광주':'전남광주통합특별시광주', '대전':'대전광역시', '울산':'울산광역시',
    '경기':'경기도', '강원':'강원특별자치도', '충북':'충청북도', '충남':'충청남도',
    '전북':'전북특별자치도', '전남':'전남광주통합특별시', '경북':'경상북도',
    '경남':'', '제주':''
  };
  const escape = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const make = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  let publicIndex = new Map(), publicStaticAvailable = false;
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
      const values=[null,null,null];
      for(const row of data||[]) {
        if(String(row.school_id)!==id || row.percentile===null) continue;
        const i=[2023,2024,2025].indexOf(Number(row.survey_year)),n=Number(row.percentile);
        if(i>=0 && Number.isFinite(n) && n>=0 && n<=100) values[i]=n;
      }
      publicIndex.set(id,{percentiles:values});
    }
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
  $('regionSelect').addEventListener('change', () => {
    const region = $('regionSelect').value;
    const select = $('officeSelect');
    select.replaceChildren(new Option(region ? '전체 교육지원청' : '시도를 먼저 선택하세요', ''));
    select.disabled = !region;
    if (region === '재외한국학교') {
      ["일본","중국","대만","베트남","사우디아라비아","인도네시아","싱가포르","태국","필리핀","파라과이","아르헨티나","러시아","이란","이집트","말레이시아","캄보디아"].forEach(country => select.add(new Option(country, country)));
    } else if (region === '세종') {
      select.add(new Option('세종시교육청', '세종특별자치시교육청'));
    } else if (region) {
      for (const name of offices[region].split(' ')) {
        select.add(new Option(name, (prefixes[region] || '') + name + '교육지원청'));
      }
      if (region === '경남') {
        for (const [label, value] of [
          ['마산 (과거 분류)', '마산교육청(폐지)'],
          ['진해 (과거 분류)', '진해교육청(폐지)'],
          ['창원 (과거 분류)', '창원교육청(폐지)']
        ]) select.add(new Option(label, value));
      }
    }
    search(true);
  });
  $('officeSelect').addEventListener('change', () => search(true));
  $('searchInput').addEventListener('input', () => {
    clearTimeout(timer); timer = setTimeout(() => search(true), 250);
  });
  $('prevPage').addEventListener('click', () => { page = Math.max(0, page - 1); search(false); });
  $('nextPage').addEventListener('click', () => { page++; search(false); });

  function addRow(host, label, value) {
    const div = make('div', 'data-row');
    div.append(make('span', '', label), make('strong', '', value));
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
  function renderYear(host, year, rows, publicValue) {
    host.replaceChildren();
    host.append(make('h3', '', `${year}년 조사 결과`));
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
        addRow(section, metric.label, metric.value);
        count++;
      }
    }
    if (hadMismatch) section.append(make('p', 'detail-note', '백분위 출처별 값이 달라 원본 검수가 필요합니다. 임의로 합치지 않았습니다.'));
    if (hadRestricted) section.append(make('p', 'detail-note', '승인 범위에 따라 일부 세부 항목은 공개하지 않습니다.'));
    if (!count && !hadRestricted) section.append(make('p', 'detail-note', '추가 승인 통계가 없습니다. 위의 기존 공개 백분위를 참고하세요.'));
    if (year === 2025) section.append(make('p', 'detail-note', '영역별 점수는 해당 연도 조사 방식에 따른 참고자료입니다.'));
    else section.append(make('p', 'detail-note', '총점·순위·개별 문항은 제공하지 않습니다.'));
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
  function percentilePanel(school,v26=null) {
    const index=publicIndex.get(String(school.school_id));
    return BeaguSchoolSearchCard.percentiles({
      publicValues:asPublicPercentiles(school),
      statuses:index?.statuses || [],
      publicError:!publicStaticAvailable && publicIndex.size===0,
      value2026:v26,
      locked:false
    });
  }
  function loadPagePercentiles(list,requestId){
    const ids=[...new Set(list.map(s=>String(s.school_id)).filter(id=>/^\d{7}$/.test(id)))];
    if(!ids.length)return;
    api('percentiles',{schoolIds:ids}).then(result=>{
      if(serial!==requestId)return;
      for(const school of list){
        const id=String(school.school_id),n=result.values?.[id];
        if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>100)continue;
        for(const card of $('results').querySelectorAll('.school-card')){
          if(card.dataset.schoolId!==id)continue;
          const old=card.querySelector('.percentile-panel');
          if(old)old.replaceWith(percentilePanel(school,n));break;
        }
      }
    }).catch(err=>{if(err.unauthorized&&serial===requestId)loggedOut('인증이 만료되었습니다. 다시 로그인하세요.');});
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
    const facts = make('section', 'school-profile');
    facts.append(make('h3', '', 'Lv.1 승인 학교 규모정보'));
    const published = (Array.isArray(rows) ? rows : [])
      .filter(r => [2024, 2025].includes(Number(r.year)) && Number(r.access_level) === 1)
      .flatMap(r => (Array.isArray(r.summary?.metrics) ? r.summary.metrics : [])
        .filter(m => m.group === '편집본 공식 학교정보' && typeof m.label === 'string' && typeof m.value === 'string')
        .map(m => ({year: Number(r.year), label: m.label, value: m.value})));
    let factsShown = 0;
    for (const label of ['학생 수', '교원 수', '학급 수']) {
      const found = [2025, 2024].map(year => published.find(m => m.year === year && m.label === label)).find(Boolean);
      if (found) {
        addRow(facts, label + ' (' + found.year + '년 편집본)', found.value);
        factsShown++;
      }
    }
    if (!factsShown) facts.append(make('p', 'detail-note', '이 학교의 추가 승인 규모정보는 아직 없습니다. 과거 백분위는 아래에서 확인할 수 있습니다.'));
    section.append(facts);
    if (window.BeaguSchoolMBTI) section.append(BeaguSchoolMBTI.createDetail(String(school.school_id), session));

    const newer = make('button', 'year-2026-button', '2026년 상세보기');
    newer.type = 'button';
    newer.setAttribute('aria-expanded', 'false');
    const currentContent = make('div', 'year-2026-content');
    currentContent.hidden = true;
    function render2026() {
      currentContent.replaceChildren();
      currentContent.append(make('h3', '', '2026년 배구지수'));
      const metrics = metrics2026(rows);
      if (!metrics.length) {
        currentContent.append(make('p', 'detail-note', '2026년 공개 승인 통계가 아직 준비되지 않았습니다.'));
      } else {
        for (const metric of metrics) addRow(currentContent, metric.label, metricValue(metric));
      }
    }
    render2026();
    newer.addEventListener('click', () => {
      currentContent.hidden = !currentContent.hidden;
      newer.setAttribute('aria-expanded', String(!currentContent.hidden));
    });
    section.append(newer, currentContent);

    section.append(make('h3', 'school-history-heading', '과거 상세자료'));
    const tabs = make('div', 'year-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '과거 조사 연도 선택');
    const content = make('div', 'school-year-details');
    content.setAttribute('role', 'tabpanel');
    function choose(year) {
      for (const button of tabs.children) {
        button.setAttribute('aria-selected', String(Number(button.dataset.year) === year));
      }
      renderYear(content, year, rows, vals[year - 2023]);
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
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', async () => {
        if (!detail.hidden) {
          detail.hidden = true;
          button.textContent = '🔍 연도별 상세 기록 보기';
          button.setAttribute('aria-expanded', 'false');
          return;
        }
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
  async function search(reset) {
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
      let query = supabaseClient.from('schools')
        .select('school_id,school_name,sido,sido_standard,support_office,address,establishment,school_kind,status', {count:'exact'})
        .eq('status','운영');
      if (q) query = query.ilike('school_name', `%${q.replaceAll('%','\\%').replaceAll('_','\\_')}%`);
      if (region) query = query.eq('sido_standard', region);
      if (office) query = query.eq('support_office', office);
      const start = page * LIMIT;
      const {data, count, error} = await query.order('address', {ascending:true,nullsFirst:false})
        .order('school_name', {ascending:true}).range(start,start + LIMIT - 1);
      if (request !== serial) return;
      if (error) throw error;
      await loaded;
      if (request !== serial) return;
      if(!publicStaticAvailable) {
        try { await recoverPublicIndex(data||[]); }
        catch(e){ console.warn('Lv.1 백분위 DB 재조회 실패',e); }
      }
      if (request !== serial) return;
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
