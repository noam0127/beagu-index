import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>readFileSync(p,'utf8');
const policy=read('release-policy.html');
assert.match(policy,/<title>자료 공개·열람 기준 \| 배구지수<\/title>/);
for(const key of ['Lv.0','Lv.1','2023','2024','2025','2026',
                   '13문항','Q51','소표본','자유서술','미승인',
                   '자료 없음','검수 중','미공개','불러오기 실패'])
 assert.ok(policy.includes(key),'missing disclosure: '+key);
assert.ok(policy.indexOf('2023 → 2024 → 2025 → 2026')>=0,'Year order must be ascending');
assert.doesNotMatch(policy,/data\/raw|beagu_private|service_role|sb_secret_|p_password|survey_answers/i);
assert.doesNotMatch(policy,/\b(?:2026년)?\s*학교별\s*(?:총점|전국순위)\b/);
assert.doesNotMatch(policy,/<script[^>]+src=/,'No tracking or restricted server client on static policy page');

for(const p of ['search.html','search-lv1.html',
                 'school-report.html','statistics.html']){
 const h=read(p);
 assert.doesNotMatch(h,/href="release-policy\.html"/,'Removed policy navigation must stay hidden: '+p);
 assert.ok(existsSync('release-policy.html'));
}
const index=read('index.html');
const search=read('search.html');
const lv1=read('js/level-search.js');
const lv2=read('js/lv2-edited-search.js');
assert.match(index,/<a class="data-access-link" href="search\.html">자료 열람<\/a>/,'Unified homepage entry');
assert.doesNotMatch(index,/href="search-lv[12]\.html"/,'No separate level button');
assert.match(search,/id="searchInput"/,'Lv.0 public browser restored');
assert.match(search,/href="search-lv1\.html"/,'Lv.1 entry from Lv.0');
assert.match(read('search-lv2.html'),/url=\.\/search-lv1\.html/,'Legacy Lv.2 route redirects to Lv.1');
assert.match(policy,/href="search\.html"/,'Public level remains accessible');
assert.doesNotMatch(index,/1,000명 달성 시 2026 배구지수 자료를 공개합니다\./);
assert.doesNotMatch(index,/href="challenge\.html"/,'Do not add a home-to-challenge button');
assert.match(index,/https:\/\/forms\.gle\/TPyCakK6Sj2zchRy7/);
const challenge=read('challenge.html');
assert.doesNotMatch(challenge,/Lv\.2|step-3|cafe\.naver\.com/,'Level 2 promotion must be absent from challenge page');
assert.match(challenge,/id="capture"/);
assert.match(challenge,/id="loungeLink"/);
assert.match(challenge,/id="participantNo"/);
assert.match(search,/locked:true/,'Lv.0 must not expose restricted 2026');
assert.match(lv1,/api\('school', \{schoolId:school\.school_id\}\)/);
assert.match(lv1,/const YEARS = \[2023, 2024, 2025, 2026\]/);
assert.doesNotMatch(policy,/href="search-lv2\.html"/);
assert.match(lv2,/beagu-level-api/);
assert.match(lv2,/beagu-edited-api-v1/);
assert.doesNotMatch(index,/service_role|sb_secret_/);
assert.match(read('js/percentile-chart.js'),/No cross-year line/);

const sql=read('supabase/08_xp_search_install.sql');
assert.match(sql,/SECURITY DEFINER/);
assert.match(sql,/REVOKE ALL ON public\.school_search_events FROM PUBLIC,anon,authenticated/);
assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/search_confirmed/);
assert.match(sql,/school_selected/);
assert.match(sql,/detail_viewed/);
assert.doesNotMatch(sql,/GRANT\s+SELECT\s+ON\s+public\.school_search_events\s+TO\s+anon/i);
console.log('PASS: 9th release policy, publication safeguards, navigation, ordinal and protected event logs');
