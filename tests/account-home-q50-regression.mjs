import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {chromium} from 'playwright';
const read=p=>readFileSync(p,'utf8');
const counts=[237,133,119,95,50,48,48,39,10,3,3];
assert.equal(counts.reduce((a,b)=>a+b,0),785);
const ctx={window:{}};vm.runInNewContext(read('js/school-search-card-v1.js'),ctx);
const format=ctx.window.BeaguSchoolSearchCard.formatHousingPrice;
for(const [v,expected] of [[135000000,'1억 3천 5백만 원'],[272000000,'2억 7천 2백만 원'],[100000000,'1억 원'],[30000000,'3천만 원'],[35000000,'3천 5백만 원'],[null,'자료 없음']])assert.equal(format(v),expected);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8124/')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8124/index.html');
 const q=page.locator('.beagu-q50');
 assert.equal(await q.locator('.beagu-q50-row').count(),11);
 const actual=await q.locator('.beagu-q50-row-label strong').allTextContents();
 assert.deepEqual(actual.map(s=>Number(s.match(/\((\d+)건\)/)[1])),counts);
 assert.deepEqual(actual.map(s=>s.split('%')[0]),counts.map(n=>(n/785*100).toFixed(1)));
 assert.match(await q.innerText(),/유효 응답 785건/);
 for(const width of [320,375,768,1280,1440]){
   await page.setViewportSize({width,height:900});
   assert.ok(await q.isVisible());
   assert.ok(await page.locator('#beagu2026Ranking').isHidden());
   assert.ok(await q.evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=-1&&b.right<=innerWidth+1&&e.scrollWidth<=e.clientWidth+1;}),'Q50 overflow at '+width);
   const parent=page.locator('.beagu-survey-purpose');
   assert.ok(await parent.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Purpose overflow at '+width);
 }
 const details=page.locator('.beagu-survey-purpose > details');
 await details.locator('summary').click();
 assert.match(await details.innerText(),/교육부·교육청의 공식 평가가 아닙니다/);
 console.log('PASS: Q50 785 responses, 11 options, 5 viewport sizes, TOP10 hidden, price formatting and disclosure');
}finally{await browser.close();}
