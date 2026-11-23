import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const lv0=readFileSync('search.html','utf8');
const lv1=readFileSync('search-lv1.html','utf8');
const lv1Script=readFileSync('js/level-search.js','utf8');
const server=readFileSync('supabase/functions/beagu-level-api/index.ts','utf8');

const expected=[
  ['student_count','학생수'],
  ['beagu_percentile_2025','배구지수'],
  ['view_count','조회수'],
  ['junior_teacher_ratio','2정교사비'],
  ['male_teacher_ratio','남교사비']
];
const publicSelect=lv0.match(/<select id="publicSort"[^>]*>([\s\S]*?)<\/select>/);
const tierSelect=lv1.match(/<select id="regionSort"[^>]*>([\s\S]*?)<\/select>/);
assert.ok(publicSelect,'Lv.0 public sort control should remain in region search');
assert.ok(tierSelect,'Lv.1 sort control must remain available after authorization');
const publicOptions=[...publicSelect[1].matchAll(/<option value="([^"]+)"([^>]*)>([^<]*)<\/option>/g)]
  .map(m=>({value:m[1],attrs:m[2],label:m[3]}));
const tierOptions=[...tierSelect[1].matchAll(/<option value="([^"]+)"([^>]*)>([^<]*)<\/option>/g)]
  .map(m=>({value:m[1],attrs:m[2],label:m[3]}));
assert.deepEqual(publicOptions.map(x=>x.value),
  tierOptions.map(x=>x.value).filter(x=>x!=='housing_price_won'),
  'Lv.0 hides the Lv.2 assessed-price option while preserving other sort order');
assert.deepEqual(publicOptions.slice(0,2).map(x=>[x.value,x.label]),
  [['school_name','학교명'],['address','주소']]);
assert.ok(publicOptions.slice(0,2).every(x=>!/\bdisabled\b/.test(x.attrs)),
  'School name and address remain selectable by Lv.0');
assert.equal(publicOptions.length,7,'Two public sorts plus five locked sorts; Lv.2 price teaser removed');
assert.deepEqual(publicOptions.slice(2).map(x=>[x.value,x.label]),
  expected.map(([value,label])=>[value,'🔒 '+label]));
assert.ok(publicOptions.slice(2).every(x=>/\bdisabled\b/.test(x.attrs)),
  'Every restricted sort must be a genuinely disabled native option');
assert.ok(tierOptions.filter(x=>x.value!=='housing_price_won')
  .every(x=>!/\bdisabled\b/.test(x.attrs)),
  'Lv.1 sorts other than assessed price remain unlocked');
assert.ok(/\bdisabled\b/.test(tierOptions.find(x=>x.value==='housing_price_won')?.attrs||''),
  'Lv.2 assessed-price sort is unavailable to Lv.1');
assert.match(publicSelect[0],/aria-describedby="publicSortLevelHelp"/);
assert.match(lv0,/<optgroup label="🔒 Lv\.1 전용 정렬">/);
assert.match(lv0,/id="publicSortLevelHelp"[^>]*>[\s\S]*?href="search-lv1\.html"[\s\S]*?Lv\.1 인증 후 이용<\/a>/);
assert.match(lv0,/<select id="publicSort"[^>]*>/);
assert.match(lv0,/const sortColumn=sortKey\.startsWith\('address'\)\?'address':'school_name'/,
  'Lv.0 continues querying public data with public-only sort columns');
assert.match(lv0,/\.from\('schools'\)/,
  'Lv.0 never sends protected sorting to the Lv.1 authenticated backend');
assert.match(lv1Script,/const SORTS=new Set\(\[[^\]]*'view_count'\]\)/);
assert.match(server,/if\(Number\(session\.access_level\)<1\)return send\(\{error:'ACCESS_DENIED'\},403,origin\)/);
console.log('PASS: Lv.0 hides assessed-price teaser and keeps five disabled Lv.1 sorts');
