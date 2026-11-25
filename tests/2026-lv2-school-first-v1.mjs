import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('js/level-search.js'),html=read('search-lv1.html'),backend=read('supabase/functions/beagu-level-api/index.ts');
assert.doesNotThrow(()=>new Script(source));
assert.match(source,/const allowedYears=\[1,2\]\.includes\(viewerTier\)\?YEARS:\[\]/);
assert.match(source,/if\(!allowedYears\.includes\(year\)\)return/);
const selection=source.split('\n').find(line=>line.trim().startsWith('choose([1,2].includes(viewerTier)&&'));
assert.ok(selection,'detail year selection must remain tier and publication aware');
const chooseYear=new Function('viewerTier','current2026','school','firstAvailable','choose',selection);
for(const [tier,status,available,expected] of [[0,'published',2026,2025],[1,'published',2026,2026],[1,'unpublished',2025,2025],[2,'published',2025,2026],[2,'unpublished',2026,2026],[2,'unpublished',2024,2025],[2,'error',undefined,2025]]){
 let actual;chooseYear(tier,new Map([['fixture',{status}]]),{school_id:'fixture'},available,y=>{actual=y});assert.equal(actual,expected);
}
assert.match(source,/연도별 상세자료/);
assert.match(source,/응답 1건인 학교도 승인 대상이지만/);
assert.match(source,/공개 근거·소표본 재식별 검토가 완료된 학교별 결과만 표시합니다/);
assert.match(source,/window\.Beagu2026ApprovedResults\?\.render\(host,results2026,\{level:viewerTier\}\)/);
assert.match(backend,/admin\.rpc\('beagu_2026_lv2_released_question_results'/);
assert.match(backend,/level>=2&&lv2Approved2026!==null/);
assert.doesNotMatch(source,/\.from\('beagu_2026_results_snapshot'\)/);
assert.doesNotMatch(source,/\.from\('beagu_2026_qa_ingest_staging'\)/);
assert.match(html,/js\/level-search\.js\?v=[A-Za-z0-9-]+/);
console.log('PASS: Lv2 opens available 2026 first, withheld school results stay private');