import {readFileSync,existsSync} from 'node:fs';
import {Script} from 'node:vm';
import assert from 'node:assert/strict';

const read=path=>readFileSync(path,'utf8');
const stats=read('statistics.html');
const loaderJS=read('js/statistics-directory-v2.js');
const compareJS=read('js/statistics-compare.js');
const oldResult=read('result.html');
const survey=read('survey.html');
const oldChallenge=read('js/challenge.html');
const css=read('styles/statistics.css');
const original=read('\u200bcss/statistics.css');

assert.equal(css,original,'Canonical statistics CSS must preserve existing design');
assert.match(stats,/href="styles\/statistics\.css\?v=20261031-canonical7"/);
assert.doesNotMatch(stats,/href="css\//,'Broken statistics CSS link must not reappear');
assert.match(stats,/src="js\/statistics-directory-v2\.js\?v=20261118-gjjn2025"/);
assert.match(stats,/src="js\/statistics-compare\.js\?v=20261118-c5"/);
assert.match(stats,/href="styles\/statistics-compare\.css\?v=20261118-c5"/);
assert.match(stats,/id="compareScroll"/);
assert.match(stats,/id="compareSuggestions"/);
assert.match(stats,/id="compareSelections"/);
assert.match(stats,/id="compareHeading">학교 비교하기/);
assert.match(stats,/id="compareResults"/);
assert.doesNotMatch(stats,/학교·연도 비교표/);
assert.match(stats,/<a href="statistics\.html" aria-current="page">비교하기<\/a>/);
assert.match(stats,/<span class="beagu-unified-name">BAEGU<span class="beagu-unified-name-accent">INDEX<\/span><\/span>/);
assert.doesNotMatch(stats,/id="dataTable"|id="schoolRows"|전체 학교 목록/);
assert.doesNotMatch(stats,/id="(regionSelect|officeSelect|yearSelect|dataTable|schoolRows|mobileCards|infoDialog)"/,'Removed filters and directory must stay absent');
assert.doesNotMatch(stats,/전체 학교 목록|학교별 상세정보.*상세보기/);
assert.match(loaderJS,/beagu:statistics-ready/);
assert.match(loaderJS,/public-lv0-percentiles-v1\.2\.json/,'No private summary access');
assert.match(compareJS,/public-statistics-question-catalog-v1\.json/);
assert.match(compareJS,/loadApprovedSchool/,'Authenticated approved data loading must be available');
assert.match(compareJS,/beagu-level-api/,'Detailed approved values must remain authenticated');
assert.match(stats,/id="compareLv1AuthPanel"/,'Lv.1 comparison form must be present');
assert.match(stats,/id="compareLv1Form"/);
assert.match(stats,/id="compareLv1Code" type="password"/);
assert.match(stats,/id="compareLv1SignedIn"/);
assert.match(stats,/id="compareLv1Logout"/);
assert.match(compareJS,/authRequest\('login'/,'Authentication must use existing server');
assert.match(compareJS,/authRequest\('verify'/,'Saved sessions must be verified before use');
assert.match(compareJS,/sessionStorage\.setItem\(SESSION_KEY,token\)/);
assert.match(compareJS,/sessionStorage\.removeItem\(SESSION_KEY\)/);
assert.match(compareJS,/state\.approvedBySchool\.clear\(\)/,'Protected cached values must clear on logout');
assert.match(compareJS,/epoch===state\.authEpoch && token===state\.sessionToken/,'Stale fetches must not repopulate cached results');

assert.match(stats,/2023—2026/,'Compare now supports four years');
assert.match(stats,/class="compare-heading-phrase">나란히 비교<\/span>/,'Heading phrase must stay on one line');
assert.doesNotMatch(stats,/class="intro-tags"|class="compare-auth-help"/,'Crossed-out copy removed');
assert.match(compareJS,/const YEARS = \[2023, 2024, 2025, 2026\]/);
assert.match(compareJS,/eq\('publication_status','PUBLISHED'\)/,'2026 public values require publication');
assert.match(compareJS,/beagu_school_report_yearly/,'2026 values must use RLS-protected annual table');
assert.match(compareJS,/public2026Checked/,'Do not invent missing 2026 results');
const questionCatalog=JSON.parse(read('data/public-statistics-question-catalog-v1.json'));
assert.equal(questionCatalog.years['2026'].items.length,50,'Include verified 2026 Q01-Q50 only');
assert.ok(!questionCatalog.years['2026'].items.some(item=>item.id==='Q51'),'Exclude free text');


assert.match(oldResult,/location\.replace\(target\)/,'Legacy URLs must forward');
assert.match(oldResult,/params\.get\('school_id'\)\|\|params\.get\('school'\)/);
assert.match(oldResult,/destination\.searchParams\.set\('school_id',school\)/);
assert.match(oldResult,/\^\[A-Z0-9\]\{7\}\$/,'School identifier must be validated');
assert.match(oldResult,/beaguVisitReady/,'Legacy result page visit tracking must be retained');
assert.match(oldResult,/js\/visit-stats\.js/);
assert.match(oldResult,/school-report\.html/);
assert.match(oldResult,/name="robots" content="noindex,follow"/);
assert.doesNotMatch(oldResult,/향후 회원 등급|과거 배구지수[^\n]*잠금/,'Outdated result messages removed');
assert.match(survey,/school-report\.html\?school_id=/,'Legacy school link remains available');
assert.doesNotMatch(survey,/submit_survey|TEST 1|테스트 응답 제출/,'No public test survey write path');
assert.match(survey,/2026 배구지수 공식 설문/,'Public survey goes to official form');
assert.doesNotMatch(survey,/href="result\.html\?school=/,'Legacy survey no longer links to outdated result');

assert.match(oldChallenge,/new URL\('\.\.\/challenge\.html',location\.href\)/);
assert.match(oldChallenge,/location\.replace\(destination\.href\)/);
assert.match(oldChallenge,/destination\.search=location\.search/);
assert.match(oldChallenge,/destination\.hash=location\.hash/);
assert.match(oldChallenge,/name="robots" content="noindex,follow"/);
assert.ok(read('challenge.html').includes('js/challenge.js'),'Original challenge remains functional');

// Every active canonical page must resolve its own local JS and CSS paths.
// Explicitly fail if the invisible U+200B directory sneaks into visible URLs.
for(const page of ['index.html','search.html','search-lv1.html','search-lv2.html',
  'school-report.html','statistics.html','result.html','survey.html','challenge.html']){
 const html=read(page);
 assert.doesNotMatch(html,/\u200bcss\//,'Invisible Unicode path in '+page);
 const assets=[];
 for(const match of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)/g))
   assets.push(match[1]);
 for(const match of html.matchAll(/<script\b[^>]*src=["']([^"']+)/g))
   assets.push(match[1]);
 for(const ref of assets){
   if(/^(https?:)?\/\//.test(ref))continue;
   const relative=decodeURIComponent(ref.split('?')[0].split('#')[0]).replace(/^\.\//,'');
   assert.ok(relative&&!relative.startsWith('/')&&!relative.includes('..'),'Unsafe asset path: '+ref);
   assert.ok(existsSync(relative),page+' missing asset '+ref);
 }
 for(const match of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)){
   // Embedded application/json catalogs are data, not executable JS.
   const openTag=match[0].slice(0,match[0].indexOf('>')+1);
   if(/\btype=["'](?:application\/json|application\/ld\+json)["']/.test(openTag))continue;
   if(match[1].trim())assert.doesNotThrow(()=>new Script(match[1],{filename:page}),page+' invalid inline JS');
 }
}
for(const file of ['js/statistics-table.js','js/visit-stats.js'])
 assert.doesNotThrow(()=>new Script(read(file),{filename:file}));
console.log('PASS: statistical stylesheet, canonical school links, legacy redirects, valid assets and privacy');
