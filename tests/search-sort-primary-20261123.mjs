import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=path=>readFileSync(path,'utf8');

test('Lv.0 and unified Lv.1/Lv.2 cards receive their actual sort key',()=>{
 const publicJs=load('search.html');
 const levelJs=load('js/level-search.js');
 const builder=load('js/school-search-card-v1.js');
 assert.match(publicJs,/sortBy:mode==='region'\?publicSort\.value:'school_name'/);
 assert.match(levelJs,/sortBy:sortValue/);
 assert.match(builder,/addSortPrimary\(card,school,sortBy,level\)/);
 assert.match(builder,/card\.querySelector\('\.school-name'\)\.after\(primary\)/);
 for(const field of ['address','student_count','beagu_percentile_2025','view_count','junior_teacher_ratio','male_teacher_ratio','housing_price_won'])
  assert.ok(builder.includes("case '"+field+"'"),field);
});

test('public and Lv.1 card-level restrictions protect Lv.2 price',()=>{
 const builder=load('js/school-search-card-v1.js');
 const api=load('supabase/functions/beagu-level-api/index.ts');
 assert.match(builder,/level===0&&key!=='address'/);
 assert.match(builder,/level<2&&key==='housing_price_won'/);
 assert.match(api,/Number\(session\.access_level\)>=2\?',housing_price_won':''/);
});

test('Lv.2 locked preview navigates to challenge; cached scripts are revised',()=>{
 const level=load('js/level-search.js');
 assert.match(level,/unlock\.href='challenge\.html'/);
 assert.doesNotMatch(level,/\$\('lv2UpgradeCard'\)\.scrollIntoView/);
 for(const page of ['search.html','search-lv1.html']){
  const html=load(page);
  assert.match(html,/school-search-card-v1\.js\?v=20261123-sort-primary1/);
  assert.match(html,/school-search-card-v1\.css\?v=20261123-sort-primary1/);
 }
});
