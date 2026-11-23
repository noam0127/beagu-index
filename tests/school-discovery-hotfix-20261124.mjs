import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Lv0 search no longer advertises property price and shows public rising schools',()=>{
  const html=read('search.html');
  assert.doesNotMatch(html,/value="housing_price_won"/);
  assert.match(html,/id="beaguInterest" data-interest-locked="false"/);
  assert.match(html,/js\/beagu-school-interest-v1\.js\?v=20261124-public-home1/);
});
test('Level2 challenge-linked instruction and removed one-response notice',()=>{
  const lv1=read('search-lv1.html');
  const dialog=read('js/beagu-participation-auth-v2.js');
  assert.match(lv1,/<a href="challenge\.html">나의 조사링크<\/a>를 공유하고 Lv\.2참여코드를 활성화하세요/);
  assert.doesNotMatch(lv1,/응답 1건인 학교도 심사 및 최종 승인 대상/);
  assert.match(dialog,/link\.href='challenge\.html'/);
  assert.match(read('js/level-search.js'),/viewerTier>=2/);
  assert.doesNotThrow(()=>new Script(dialog));
});
test('Home 2 published picks change every 12 Korean hours',()=>{
  const html=read('index.html');
  const js=read('js/beagu-home-schools-v1.js');
  assert.match(html,/data-today-high/);
  assert.match(html,/data-today-low/);
  assert.match(js,/const HOUR=3600000,PERIOD=12\*HOUR,SEOUL_OFFSET=9\*HOUR/);
  assert.match(js,/percentiles\?\.\[2\]/);
  assert.match(js,/row\.percentile>=90/);
  assert.match(js,/row\.percentile<=10/);
  assert.doesNotMatch(js,/beagu_2026_answer|survey_responses|2026-approved/i);
  assert.doesNotThrow(()=>new Script(js));
  const values=JSON.parse(read('data/public-lv0-percentiles-v1.2.json')).rows;
  const named=JSON.parse(read('data/public-compare-school-directory-v1.json')).rows;
  const validNames=new Set(named.map(x=>String(x[0])));
  const approved=values.filter(r=>validNames.has(String(r.school_id))&&typeof r.percentiles?.[2]==='number');
  assert.ok(approved.filter(r=>r.percentiles[2]>=90).length>2);
  assert.ok(approved.filter(r=>r.percentiles[2]<=10).length>2);
});
test('Rising carousel never guesses a school and protects anonymous counts',()=>{
  const edge=read('supabase/functions/beagu-school-interest-v1/index.ts');
  const js=read('js/beagu-school-interest-v1.js');
  assert.match(edge,/if \(!token\) return publicSchool/);
  assert.match(edge,/if \(token\)/);
  assert.match(js,/school-report\.html\?school_id=/);
  assert.match(js,/search-lv1\.html\?school_id=/);
  assert.match(js,/},3000\)/);
  assert.match(js,/},900000\)/);
  assert.doesNotThrow(()=>new Script(js));
});

test('Live anonymous ranking API returns schools without private visitor counts',async()=>{
  const url='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-school-interest-v1';
  const response=await fetch(url,{
    method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json','Origin':'https://baeguindex.com'},
    body:'{}',signal:AbortSignal.timeout(15000)
  });
  assert.equal(response.status,200,'Anonymous ranking must be accessible after Edge deployment');
  const result=await response.json();
  assert.ok(Array.isArray(result.rising),'Ranking response must expose a public list');
  for(const school of result.rising){
    assert.match(String(school.school_id),/^[0-9]{7}$/);
    assert.equal(typeof school.school_name,'string');
    assert.equal(Object.hasOwn(school,'visitors'),false,'Anonymous visitors must be hidden');
    assert.equal(Object.hasOwn(school,'growth'),false,'Anonymous growth counts must be hidden');
  }
});
