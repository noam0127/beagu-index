import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const home=read('index.html');
const report=read('school-report.html');
const sync=read('scripts/beagu-2026-noon-sync.gs');
const edge=read('supabase/functions/beagu-2026-public-count-ingest/index.ts');
const lv1=read('js/level-search.js');
const guide=read('docs/2026-live-aggregate-setup.md');

assert.doesNotThrow(()=>new Script(sync));
assert.equal(home.includes('data-beagu-2026-form-count'),false,'No public response count element');
assert.equal(home.includes('2026-form-count.js'),false,'No public response count JavaScript');
assert.equal(home.includes('2026 본조사 응답 현황'),false,'No survey response totals on home');
assert.ok(home.includes('data-xp-progress'),'Existing separate challenge XP retained');
assert.equal(report.includes("['학교별 응답자'"),false,'School respondent card removed');
assert.equal(report.includes('meta.textContent=Number.isSafeInteger(Number(n))'),false,'No public school question N value');
assert.ok(sync.includes('scanned-prelaunch-undated'),'Private sync excludes pre-launch and invalid dates');
assert.ok(sync.includes('BEAGU_2026_INGEST_TOKEN'),'Token required for private sync');
assert.ok(sync.includes('onBeagu2026FormSubmitted'),'Form-submit handler retained');
assert.ok(sync.includes('function installBeagu2026Sync()'),'One-click owner setup available');
assert.ok(sync.includes('setupBeagu2026BatchTrigger();'),'Periodic recovery trigger retained');
assert.ok(edge.includes('INGEST_NOT_CONFIGURED'),'Missing secret fails closed');
assert.ok(edge.includes('UNAUTHORIZED'),'Invalid secret denied');
assert.ok(edge.includes('body.source_spreadsheet_id!==sourceId'),'Source sheet validated');
// Historical school identifiers may be returned by the authenticated GET
// route. The POST storage path must still persist national totals only.
const getStart=edge.indexOf("if(req.method==='GET'){");
const postStart=edge.indexOf("let raw='';let bytes=0;",getStart);
assert.ok(getStart>=0&&postStart>getStart,'Separate historical GET and national-count POST paths');
const authStart=edge.indexOf("return send(401,{error:'UNAUTHORIZED'})");
assert.ok(authStart>=0&&authStart<getStart,'Historical GET requires ingest authentication');
const post=edge.slice(postStart);
assert.doesNotMatch(post,/school_id|school_name|support_office|original_sido/,'POST must not reference school identities');
assert.doesNotMatch(post,/\.\.\.body\b|\.upsert\(\s*body\b/,'Never forward arbitrary submitted fields to storage');
assert.match(post,/official_submission_rows:body\.official_submission_rows/);
assert.match(post,/new_unique_schools:body\.new_unique_schools/);
assert.match(post,/publish_policy:'national_cumulative_counts_only_v2'/);
assert.ok(lv1.includes('문항별 결과')&&lv1.includes('최신 공개 승인 상태를 확인하지 못했습니다. 2026년 학교별 결과를 숨기고'),'Question detail retains fail-closed approval status');
assert.ok(report.includes("const check=await tierCall('verify')"));
assert.ok(guide.includes('`beagu_2026_public_progress` (일반 사용자 접근 불가)')&&guide.includes('익명 INSERT/UPDATE 불가'),'Documented private progress and anonymous write restrictions retained');
console.log('PASS: survey counts hidden, internal ingestion authenticated, legacy school privacy retained');
