import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:320,height:740}});
 await page.setContent('<!doctype html><meta charset="utf-8"><main><section id="basic">학교 기본정보</section><section id="facility" hidden></section><section id="graph">역대 배구지수</section></main>');
 await page.addStyleTag({content:fs.readFileSync('styles/school-facilities-v11126.css','utf8')});
 for(const p of ['js/historical-questionnaire-choices.js','js/2025-observed-choices.js','js/2026-questionnaire-options-v1.2.js','js/school-facilities-v11126.js'])await page.addScriptTag({content:fs.readFileSync(p,'utf8')});
 await page.evaluate(()=>{
  const host=document.querySelector('#facility');
  const results=[];
  const c=window.Beagu2026Questionnaire;
  for(const q of ['Q41','Q42','Q45'])for(let row=0;row<c[q].rows.length;row++)results.push({questionId:q,row,values:[c[q].columns[row%2?0:1]]});
  for(const q of ['Q43','Q44'])results.push({questionId:q,row:-1,values:c[q].options});
  window.BeaguSchoolFacilities.render(host,[{year:2025,questionId:'Q37',modeOption:'없다'}],results,2);
 });
 for(const width of [320,375,768,1280]){
  await page.setViewportSize({width,height:740});
  const layout=await page.evaluate(()=>{
   const f=document.querySelector('#facility'),g=f.querySelector('ul');
   return {visible:!f.hidden,count:g.children.length,overflow:document.documentElement.scrollWidth>innerWidth,grid:getComputedStyle(g).gridTemplateColumns,order:f.previousElementSibling.id==='basic'&&f.nextElementSibling.id==='graph'};
  });
  assert.equal(layout.visible,true);assert.ok(layout.count>=40);assert.equal(layout.overflow,false);assert.equal(layout.order,true);
  if(width<=420)assert.equal(layout.grid.split(' ').length,3);
 }
 await page.evaluate(()=>window.BeaguSchoolFacilities.render(document.querySelector('#facility'),[{year:2025,questionId:'Q37',modeOption:'없다'}],[],1));
 assert.equal(await page.locator('.is-absent').count(),1);
 assert.equal(await page.locator('.is-absent .beagu-facility-icon').evaluate(e=>getComputedStyle(e).filter),'grayscale(1)');
 await page.evaluate(()=>window.BeaguSchoolFacilities.render(document.querySelector('#facility'),[],[],0));
 assert.equal(await page.locator('#facility').isVisible(),false);
 await page.evaluate(()=>{
  const host=document.createElement('div');host.id='annual';
  for(const id of ['Q36','Q37','Q38']){
   const row=document.createElement('article');row.className='historical-question-row';
   const code=document.createElement('span');code.className='beagu-question-number';code.textContent=id;row.append(code);host.append(row);
  }
  document.body.append(host);window.BeaguSchoolFacilities.fold(host,2025);
 });
 assert.equal(await page.locator('#annual details .historical-question-row').count(),2);
 assert.equal(await page.locator('#annual > .historical-question-row').count(),1);
 assert.equal(await page.locator('#annual details').evaluate(e=>e.open),false);
 await page.locator('#annual details summary').click();
 assert.equal(await page.locator('#annual details').evaluate(e=>e.open),true);
 console.log('320/375/768/1280px actual Chromium responsive facility grid and annual disclosure passed');
}finally{await browser.close();}
