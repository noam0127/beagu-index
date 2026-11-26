import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:320,height:740}});
 await page.setContent('<!doctype html><meta charset="utf-8"><main><section id="f" hidden></section></main>');
 await page.addStyleTag({content:fs.readFileSync('styles/school-facilities-v11126.css','utf8')});
 for(const p of ['js/historical-questionnaire-choices.js','js/2025-observed-choices.js','js/2026-questionnaire-options-v1.2.js','js/school-facilities-v11126.js'])await page.addScriptTag({content:fs.readFileSync(p,'utf8')});
 await page.evaluate(()=>{const c=window.Beagu2026Questionnaire;const results=['Q27','Q32','Q33','Q40','Q46','Q47','Q48'].flatMap(q=>c[q].rows.map((_,row)=>({questionId:q,row,values:[c[q].columns[row%2?1:0]]})));results.push({questionId:'Q37',row:-1,values:['배구','탁구']},{questionId:'Q35',row:-1,values:['수학여행·기타 숙박체험']});window.BeaguSchoolFacilities.render(document.querySelector('#f'),[{year:2025,questionId:'Q31',modeOption:'있다'},{year:2025,questionId:'Q32',modeOption:'없다'}],results,2,[{year:2025,questionId:'Q03',selectedOptions:['교과서 구입']}]);});
 assert.equal(await page.locator('.beagu-facts-year').count(),2);
 assert.equal(await page.locator('.beagu-facts-group-title').count()>5,true);
 assert.equal(await page.locator('.is-absent .beagu-facility-icon').first().evaluate(n=>getComputedStyle(n).filter),'grayscale(1)');
 for(const width of [320,375,768,1280]){await page.setViewportSize({width,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.evaluate(()=>window.BeaguSchoolFacilities.render(document.querySelector('#f'),[{year:2025,questionId:'Q31',modeOption:'있다'}],[{questionId:'Q27',row:0,values:['있다']}],1));
 assert.equal(await page.locator('.beagu-facts-year').count(),1);
 assert.match(await page.locator('.beagu-facts-year-title').innerText(),/2025년/);
 await page.evaluate(()=>window.BeaguSchoolFacilities.render(document.querySelector('#f'),[],[],0));
 assert.equal(await page.locator('#f').isVisible(),false);
 console.log('PASS: grouped annual facts, mobile/desktop layout, gray negatives and tier changes');
}finally{await browser.close();}
