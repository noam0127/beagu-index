import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read = file => readFileSync(file,'utf8');
const pages=['index.html','challenge.html','search.html','search-lv1.html','school-report.html','statistics.html'];
for(const path of pages){
 const html=read(path);
 assert.doesNotMatch(html,/1,000명 달성 시 2026 배구지수 자료를 공개합니다/,'No threshold-release promise: '+path);
 assert.doesNotMatch(html,/href="release-policy\.html"/,'No public release-policy link: '+path);
}
const xp=read('js/challenge-progress-v1.js');
assert.doesNotMatch(xp,/자료 공개를 준비합니다/);
assert.match(xp,/beagu_get_challenge_progress/,'Challenge is still operational');
const lv1=read('js/level-search.js');
const html=read('school-report.html');
const edge=read('supabase/functions/beagu-level-api/index.ts');
assert.doesNotThrow(()=>new Script(lv1));
for(const match of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)){
 if(match[0].includes('type="application/json"'))continue;
 assert.doesNotThrow(()=>new Script(match[1]),'Invalid inline script');
}
assert.match(edge,/beagu_verified_school_question_distributions_v1/);
assert.match(edge,/release_status','APPROVED_AGGREGATE_ONLY/);
assert.match(edge,/schoolDistributions/);
assert.match(edge,/roundedDistribution/);
assert.match(edge,/N10_CELL3_PATTERNS5_STRICT_MATCH/);
assert.doesNotMatch(edge,/select\('survey_year,question_id,mode_option,rounded_distribution,review_policy,valid_response_rows'\)/,
 'Do not return private N');
assert.match(lv1,/data\.schoolDistributions/);
assert.match(lv1,/10% 단위로 반올림/);
assert.match(html,/r\.schoolDistributions/);
assert.match(html,/data\.roundedDistribution/);
assert.match(html,/10% 단위로 반올림/);
assert.ok(html.includes('const requiredTier=item=>1'));
assert.ok(html.includes('/^Q\\d{2}$/.test(qid)')===false ||
          !html.includes('/^Q\\\\d{2}$/.test(qid)'),'Double-backslash regex must not remain');
console.log('PASS: release-threshold promise and disclosure links removed, protected rounded school distributions only');
