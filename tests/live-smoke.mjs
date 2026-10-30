/**
 * 배구지수 운영 사이트 스모크 테스트: Node.js 22, 별도 npm 패키지 불필요.
 * - 참여코드/서버 비밀키 사용하지 않음
 * - 쓰기 요청 없음(단, 인증 거부 확인을 위한 POST만 전송)
 * - 성공 시 GitHub 원본과 배포 자산 일치 + 미인증 접근 차단만 입증
 * - 실제 유효 참여코드 로그인 및 승인된 자료 렌더링은 검증 대상 외
 */
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
    'index.html', 'search-lv1.html', 'search-lv2.html',
    'js/level-search.js', 'js/lv2-edited-search.js',
    'js/release-ui.js', 'js/site-config.js', 'css/release.css',
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

  const html1 = responses.get('search-lv1.html')||'';
  const html2 = responses.get('search-lv2.html')||'';
  const home = responses.get('index.html')||'';
  const level1 = responses.get('js/level-search.js')||'';
  const level2 = responses.get('js/lv2-edited-search.js')||'';
  check('홈에서 Lv.1·Lv.2로 연결', home.includes('search-lv1.html') && home.includes('search-lv2.html'));
  check('두 HTML의 JS 연결', html1.includes('js/level-search.js') && html2.includes('js/lv2-edited-search.js'));
  check('Lv.1 최신 승인 통계 렌더러 연결', level1.includes('beagu-level-api') && level1.includes('BeaguReleaseUI.latest(host, rows, 1)') && level1.includes('2025'));
  check('Lv.2 schema 경로 및 공개 필드 제한', level2.includes("fetch('lv2-edited-column-schema.json'") && !level2.includes("fetch('data/lv2-edited-column-schema.json'") && level2.includes('RELEASED_KEYS') && level2.includes('releasedFields'));

  try {
    const schema = JSON.parse(responses.get('lv2-edited-column-schema.json')||'null');
    const ok = schema && [2023,2024,2025].every(y => Array.isArray(schema.years?.[String(y)]));
    check('Lv.2 3개년 열 설명 JSON 정상', Boolean(ok));
  } catch(e) { check('Lv.2 3개년 열 설명 JSON 정상', false, e.message); }
  try {
    const publicData = JSON.parse(responses.get('data/public-lv0-percentiles-v1.2.json')||'null');
    check('공개 백분위 JSON 무결성', publicData?.publication_status==='LV0_EXISTING_PUBLIC_SCOPE' && Array.isArray(publicData.rows) && publicData.rows.length>0);
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
    const headers = {
      'Content-Type':'application/json',
      'Origin':ORIGIN,
      'apikey':publishable,
    };
    const unauthorized = [
      ['Lv.1 verify 미인증 차단','beagu-level-api',{action:'verify'}],
      ['Lv.1 school 미인증 차단','beagu-level-api',{action:'school',schoolId:'0000000'}],
      ['Lv.2 school 미인증 차단','beagu-edited-api-v1',{action:'school',schoolId:'0000000'}],
    ];
    for (const [name,fn,body] of unauthorized) {
      try {
        const response=await request(`${SUPABASE}/functions/v1/${fn}`,{method:'POST',headers,body:JSON.stringify(body)});
        const result=await response.json().catch(()=>({}));
        // Gateway 401과 구별되도록 앱 자체 에러 메시지까지 검증.
        check(name,response.status===401 && result.error==='AUTH_REQUIRED',`HTTP ${response.status}; code=${String(result.error||'없음').slice(0,32)}`);
      } catch(e) { check(name,false,e.message); }
    }

    for(const table of ['beagu_level_data','beagu_edited_school_rows','beagu_level_codes','beagu_level_sessions','beagu_release_metrics_v2','beagu_metric_catalog','beagu_login_budget']) {
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
