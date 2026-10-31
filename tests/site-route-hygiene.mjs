import {readFileSync,existsSync} from 'node:fs';
import {Script} from 'node:vm';
import assert from 'node:assert/strict';

const read=path=>readFileSync(path,'utf8');
const stats=read('statistics.html');
const tableJS=read('js/statistics-table.js');
const oldResult=read('result.html');
const survey=read('survey.html');
const oldChallenge=read('js/challenge.html');
const css=read('styles/statistics.css');
const original=read('\u200bcss/statistics.css');

assert.equal(css,original,'Canonical statistics CSS must preserve existing design');
assert.match(stats,/href="styles\/statistics\.css\?v=20261031-canonical7"/);
assert.doesNotMatch(stats,/href="css\//,'Broken statistics CSS link must not reappear');
assert.match(stats,/src="js\/statistics-table\.js\?v=20261031-routes7"/);
assert.match(stats,/id="dialogReportLink" href="search\.html"/);
assert.match(tableJS,/dialogReportLink'\)\.href='school-report\.html\?school_id='/);
assert.ok(stats.indexOf('value="2023"')<stats.indexOf('value="2024"'));
assert.ok(stats.indexOf('value="2024"')<stats.indexOf('value="2025"'));
assert.ok(stats.indexOf('value="2025"')<stats.indexOf('value="2026"'));
assert.match(stats,/<option value="2026" disabled>/,'Do not imply unapproved 2026 values exist');
assert.match(stats,/기존 Lv\.0 공개본/,'Keep public-only snapshot disclaimer');
assert.match(tableJS,/public-lv0-percentiles-v1\.2\.json/,'No restricted data access in statistics');

assert.match(oldResult,/location\.replace\(target\)/,'Legacy URLs must forward');
assert.match(oldResult,/params\.get\('school_id'\)\|\|params\.get\('school'\)/);
assert.match(oldResult,/destination\.searchParams\.set\('school_id',school\)/);
assert.match(oldResult,/\^\\d\{7\}\$/,'School identifier must be validated');
assert.match(oldResult,/beaguVisitReady/,'Legacy result page visit tracking must be retained');
assert.match(oldResult,/js\/visit-stats\.js/);
assert.match(oldResult,/school-report\.html/);
assert.match(oldResult,/name="robots" content="noindex,follow"/);
assert.doesNotMatch(oldResult,/향후 회원 등급|과거 배구지수[^\n]*잠금/,'Outdated result messages removed');
assert.match(survey,/school-report\.html\?school_id=\$\{encodeURIComponent\(selectedSchool\.school_id\)\}/);
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
