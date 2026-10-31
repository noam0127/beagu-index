/**
 * 배구지수 운영 사이트 스모크 테스트: Node.js 22, 별도 npm 패키지 불필요.
 * - 참여코드/서버 비밀키 사용하지 않음
 * - 쓰기 요청 없음(단, 인증 거부 확인을 위한 POST만 전송)
 * - 성공 시 GitHub 원본과 배포 자산 일치 + 미인증 접근 차단만 입증
 * - 실제 유효 참여코드 로그인 및 승인된 자료 렌더링은 검증 대상 외
 */
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext, Script } from 'node:vm';
import { setTimeout as sleep } from 'node:timers/promises';

const ORIGIN = (process.env.BEAGU_ORIGIN || 'https://baeguindex.com').replace(/\/$/, '');
const SUPABASE = (process.env.SUPABASE_URL || 'https://snvzwrexuqavnfvzgxqj.supabase.co').replace(/\/$/, '');
const WAIT = Math.max(0, Math.min(300, Number(process.env.BEAGU_DEPLOY_WAIT_SECONDS || '0')));
const status = [];
const check = (name, ok, info = '') => {
  status.push({name,ok,info});
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${info ? ` | ${info}` : ''}`);
};
const hash = data => createHash('sha256').update(data).digest('hex');
const fail = message => { throw new Error(message); };

async function request(url, options = {}) {
  const { timeout = 15000, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(timeout),
    headers: { 'Cache-Control':'no-cache', ...(rest.headers||{}) }
  });
  return response;
}

async function readLive(relative) {
  const result = await request(`${ORIGIN}/${relative}`);
  if (!result.ok) fail(`HTTP ${result.status} (${relative})`);
  return Buffer.from(await result.arrayBuffer());
}

async function main() {
  console.log(`배구지수 운영 점검 대상: ${ORIGIN}`);
  console.log('참여코드와 세션 토큰은 요청하지 않습니다.');

  // 사이트의 실제 캐시/배포 파일이 GitHub 체크아웃 버전과 일치하는지 검사.
  const assets = [
    'index.html', 'search.html', 'search-lv1.html', 'search-lv2.html', 'school-report.html',
    'js/master-percentiles-v1.2.js', 'js/visit-stats.js', 'js/percentile-chart.js',
    'js/level-search.js', 'js/lv2-edited-search.js',
    'js/school-mbti-v1.js', 'styles/school-mbti-v1.css',
    'js/school-search-card-v1.js', 'styles/school-search-card-v1.css',
    'js/school-detail-groups-v1.js', 'styles/school-detail-groups-v1.css',
    'statistics.html', 'styles/statistics.css', 'js/statistics-table.js',
    'result.html', 'survey.html', 'js/challenge.html',
    'lv2-edited-column-schema.json', 'data/public-lv0-percentiles-v1.2.json'
  ];
  const responses = new Map();
  const deploymentDeadline = Date.now() + WAIT * 1000;
  for (const relative of assets) {
    try {
      await access(relative);
      const expected = await readFile(relative);
      let lastError;
      for (;;) {
        try {
          const actual = await readLive(relative);
          if (hash(actual) !== hash(expected)) {
            lastError = new Error(`배포 버전 불일치: local=${hash(expected).slice(0,12)} live=${hash(actual).slice(0,12)}`);
          } else {
            responses.set(relative, actual.toString('utf8'));
            lastError = undefined;
            break;
          }
        } catch (e) { lastError = e; }
        if (Date.now() >= deploymentDeadline) break;
        await sleep(10000);
      }
      if (lastError) throw lastError;
      check(`배포 자산 일치: ${relative}`, true);
    } catch (e) { check(`배포 자산 일치: ${relative}`, false, e.message); }
  }

  const report = responses.get('school-report.html')||'';
  const html0 = responses.get('search.html')||'';
  const html1 = responses.get('search-lv1.html')||'';
  const html2 = responses.get('search-lv2.html')||'';
  const home = responses.get('index.html')||'';
  const level1 = responses.get('js/level-search.js')||'';
  const level2 = responses.get('js/lv2-edited-search.js')||'';
  const visitStats = responses.get('js/visit-stats.js')||'';
  const mbtiJS = responses.get('js/school-mbti-v1.js')||'';
  const chartJS=responses.get('js/percentile-chart.js')||'';
  check('2023~2026 연도 UI 오름차순',
    report.includes('for(const year of [2023,2024,2025,2026])') &&
    level1.includes('const YEARS = [2023, 2024, 2025]') &&
    level2.includes('const years=[2023,2024,2025]') &&
    (responses.get('js/school-search-card-v1.js')||'').includes('for(const i of [0,1,2,3])'));
  check('연도별 개별 백분위 · 연결선 없는 도표',
    chartJS.includes('function percentileChart(') &&
    chartJS.includes('No cross-year line') &&
    !chartJS.includes('values[i - 1]') &&
    !chartJS.includes('x[i - 1]'));

  check('Lv.1·Lv.2·학교상세 방문집계 페이지명 유효화',
    visitStats.includes("'search-lv1','search-lv2','school-report','statistics'") &&
    visitStats.includes("page = ['index','search','result','survey','challenge']"));
  check('Lv.0·Lv.1·Lv.2 공통 학교검색 카드 연결',
    [html0,html1,html2].every(h=>h.includes('js/school-search-card-v1.js') && h.includes('styles/school-search-card-v1.css')) &&
    [html0,level1,level2].every(h=>h.includes('BeaguSchoolSearchCard.createCard')) &&
    (responses.get('js/school-search-card-v1.js')||'').includes('function createCard('));
  const groupJS=responses.get('js/school-detail-groups-v1.js')||'';
  check('Lv.1·Lv.2 승인 상세정보 접기/펼치기',
    [html1,html2].every(h=>h.includes('js/school-detail-groups-v1.js')&&h.includes('styles/school-detail-groups-v1.css')) &&
    groupJS.includes("document.createElement('details')") &&
    groupJS.includes('details.open=false') &&
    level1.includes('BeaguDetailGroups.appendGrouped') &&
    level2.includes('BeaguDetailGroups.appendGrouped') &&
    !html0.includes('js/school-detail-groups-v1.js'));
  const statsHTML=responses.get('statistics.html')||'';
  const statsCSS=responses.get('styles/statistics.css')||'';
  const statsScript=responses.get('js/statistics-table.js')||'';
  const legacyResult=responses.get('result.html')||'';
  const legacyChallenge=responses.get('js/challenge.html')||'';
  const legacySurvey=responses.get('survey.html')||'';
  check('통계표 CSS 경로 정상 및 공개 데이터 유지',
    statsHTML.includes('styles/statistics.css?v=20261031-canonical7') &&
    !statsHTML.includes('href="css/statistics.css') &&
    statsCSS.includes('.table-frame') &&
    statsScript.includes('public-lv0-percentiles-v1.2.json') &&
    statsHTML.includes('dialogReportLink'));
  check('구형 결과 페이지 → 현재 학교 상세 연결',
    legacyResult.includes("location.replace(target)") &&
    legacyResult.includes("beaguVisitReady") &&
    legacySurvey.includes('school-report.html?school_id=') &&
    legacyChallenge.includes("../challenge.html"));
  check('학교 홈페이지 링크가 검색 결과에서 제거됨',
    ![html0,html1,html2,level1,level2,report].some(h=>h.includes('🌐 학교 홈페이지')));
  check('홈에서 Lv.1·Lv.2로 연결', home.includes('search-lv1.html') && home.includes('search-lv2.html'));
  check('두 HTML의 JS 연결', html1.includes('js/level-search.js') && html2.includes('js/lv2-edited-search.js'));
  check('학교 MBTI Lv.1·Lv.2 공통 자산 연결',
    [html1,html2].every(h=>h.includes('js/school-mbti-v1.js')&&h.includes('styles/school-mbti-v1.css')) &&
    level1.includes('BeaguSchoolMBTI.createDetail') && level2.includes('BeaguSchoolMBTI.createDetail') &&
    mbtiJS.includes('beagu-school-culture-v1'));
  for (const file of ['js/percentile-chart.js','js/school-search-card-v1.js','js/school-detail-groups-v1.js','js/school-mbti-v1.js','js/level-search.js','js/lv2-edited-search.js','js/statistics-table.js']) {
    try { new Script(responses.get(file)||''); check('JS 문법 검증: '+file,true); }
    catch(e) { check('JS 문법 검증: '+file,false,e.message); }
  }
  check('Lv.1 승인 통계 전용 코드', level1.includes('beagu-level-api') && level1.includes('summary?.metrics') && level1.includes('2025'));
  check('상세화면에 학교수치 직접 REST 조회 없음',
    report.includes('beagu-level-api') &&
    !report.includes("from('beagu_school_report_official_facts')") &&
    !report.includes("from('beagu_school_report_official_categories')"));
  check('Lv.2 schema 경로 및 공개 필드 제한', level2.includes("fetch('lv2-edited-column-schema.json'") && !level2.includes("fetch('data/lv2-edited-column-schema.json'") && level2.includes('RELEASED_KEYS') && level2.includes('releasedFields'));

  try {
    const schema = JSON.parse(responses.get('lv2-edited-column-schema.json')||'null');
    const ok = schema && [2023,2024,2025].every(y => Array.isArray(schema.years?.[String(y)]));
    check('Lv.2 3개년 열 설명 JSON 정상', Boolean(ok));
  } catch(e) { check('Lv.2 3개년 열 설명 JSON 정상', false, e.message); }
  try {
    const publicData = JSON.parse(responses.get('data/public-lv0-percentiles-v1.2.json')||'null');
    check('공개 백분위 JSON 무결성', publicData?.publication_status==='LV0_EXISTING_PUBLIC_SCOPE' && Array.isArray(publicData.rows) && publicData.rows.length>0);
    // Catch the exact 2026-10-31 production regression: the parser rejected
    // a valid public v1.3 percentile export because it only accepted v1.2.
    try {
      const parser=await readFile('js/master-percentiles-v1.2.js','utf8');
      const scope={};
      runInNewContext(parser,scope,{timeout:1500});
      const idx=scope.BeaguPublic.buildIndex(publicData);
      const published2025=publicData.rows.filter(r=>r.percentiles?.[2]!==null).length;
      check('웹 백분위 파서와 현재 데이터 버전 호환',
        idx.size===publicData.rows.length && published2025===1294,
        '학교 '+idx.size+'개, 2025 공개 '+published2025+'개교');
    } catch(e) { check('웹 백분위 파서와 현재 데이터 버전 호환',false,String(e.message)); }
  } catch(e) { check('공개 백분위 JSON 무결성', false, e.message); }

  // 공개 사이트에서 쓰는 publishable key만 사용. service_role/secret은 읽지 않음.
  let publishable = '';
  try {
    const conf = (await readLive('js/supabase-config.js')).toString('utf8');
    const match = conf.match(/sb_publishable_[A-Za-z0-9_-]+/);
    if (!match) throw new Error('공개 publishable key 없음');
    publishable = match[0];
    check('공개 Supabase 설정 로드', true);
  } catch (e) { check('공개 Supabase 설정 로드', false, e.message); }

  if (publishable) {
    try {
      const publicResponse=await request(
        `${SUPABASE}/rest/v1/beagu_school_report_yearly?select=school_id,survey_year,percentile&publication_status=eq.PUBLISHED&limit=1`,
        {headers:{apikey:publishable,Origin:ORIGIN}}
      );
      const publicRows=await publicResponse.json().catch(()=>null);
      check('공개 백분위 REST 조회 가능 — 대용량 파일 실패 시 복구',
        publicResponse.ok && Array.isArray(publicRows) && publicRows.length===1 &&
        Number.isFinite(Number(publicRows[0].percentile)),
        `HTTP ${publicResponse.status}`);
    } catch(e) {check('공개 백분위 REST 조회 가능 — 대용량 파일 실패 시 복구',false,e.message)}
    const headers = {
      'Content-Type':'application/json',
      'Origin':ORIGIN,
      'apikey':publishable,
    };
    const unauthorized = [
      ['Lv.1 verify 미인증 차단','beagu-level-api',{action:'verify'}],
      ['Lv.1 school 미인증 차단','beagu-level-api',{action:'school',schoolId:'0000000'}],
      ['Lv.2 school 미인증 차단','beagu-edited-api-v1',{action:'school',schoolId:'0000000'}],
      ['Lv.1 이상 학교 MBTI 미인증 차단','beagu-school-culture-v1',{action:'batch',schoolIds:['0000000']}],
    ];
    for (const [name,fn,body] of unauthorized) {
      try {
        const response=await request(`${SUPABASE}/functions/v1/${fn}`,{method:'POST',headers,body:JSON.stringify(body)});
        const result=await response.json().catch(()=>({}));
        // Gateway 401과 구별되도록 앱 자체 에러 메시지까지 검증.
        check(name,response.status===401 && result.error==='AUTH_REQUIRED',`HTTP ${response.status}; code=${String(result.error||'없음').slice(0,32)}`);
      } catch(e) { check(name,false,e.message); }
    }

    for(const table of ['beagu_level_data','beagu_edited_school_rows','beagu_level_codes','beagu_level_sessions','beagu_release_metrics_v2',
      'beagu_school_report_official_facts','beagu_school_report_official_categories']) {
      try {
        const url=`${SUPABASE}/rest/v1/${table}?select=*&limit=1`;
        const response=await request(url,{headers:{apikey:publishable,Origin:ORIGIN}});
        const data=await response.json().catch(()=>null);
        const safe = [401,403,404].includes(response.status) || (response.ok && Array.isArray(data) && data.length===0);
        check(`직접 REST 비공개: ${table}`,safe,`HTTP ${response.status}; ${response.ok && Array.isArray(data)?data.length+'행':''}`);
      } catch(e) {check(`직접 REST 비공개: ${table}`,false,e.message);}
    }
  } else {
    check('미인증 서버·REST 보안 검증',false,'공개 설정 파일을 읽지 못해 실행되지 않았음');
  }

  const passed=status.filter(x=>x.ok).length,failed=status.length-passed;
  console.log(`\n결과: 통과 ${passed} / 실패 ${failed} / 전체 ${status.length}`);
  console.log('주의: 유효 참여코드 로그인·Lv.1→Lv.2 권한 상승 거부·학교 상세화면 렌더링은 별도 수동 검증이 필요합니다.');
  if(failed) process.exitCode=1;
}
await main();
