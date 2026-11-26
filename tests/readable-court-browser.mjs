import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const origin='http://127.0.0.1:8124';
const browser=await chromium.launch({headless:true});
const fixture={school_id:'7003915',school_name:'검증초등학교',region:'부산',visitors:20,growth:3};
async function contrast(locator,label){
 const result=await locator.evaluate(el=>{
   const parse=s=>s.match(/[\d.]+/g)?.map(Number)||[];
   const rgb=el=>parse(getComputedStyle(el).backgroundColor);
   let bg=[];for(let e=el;e;e=e.parentElement){const v=rgb(e);if(v.length>=3&&(v.length===3||v[3]===1)){bg=v;break;}}
   const fg=parse(getComputedStyle(el).color);
   const L=v=>v.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
   const a=L(fg),b=L(bg);return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),fg,bg};
 });
 assert.ok(result.bg.length>=3&&result.ratio>=4.5,label+': '+JSON.stringify(result));
}
try{
 for(const colorScheme of ['light','dark'])for(const width of [375,1280]){
  const context=await browser.newContext({colorScheme,viewport:{width,height:900}});
  try{
   await context.route('**/*',async r=>{
    const u=new URL(r.request().url());if(u.origin===origin)return r.continue();
    if(u.pathname.endsWith('/beagu-school-interest-v1'))return r.fulfill({status:r.request().method()==='OPTIONS'?204:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json'},body:r.request().method()==='OPTIONS'?'':JSON.stringify({rising:[fixture]})});
    return r.abort();
   });
   const page=await context.newPage();await page.goto(origin+'/index.html');
   const purpose=page.locator('.beagu-survey-purpose');
   assert.ok(await purpose.evaluate(e=>e.previousElementSibling?.tagName==='H1'&&e.parentElement.querySelector('h1').getBoundingClientRect().bottom<=e.getBoundingClientRect().top&&e.getBoundingClientRect().bottom<=e.parentElement.querySelector('.survey-totals').getBoundingClientRect().top+1),'purpose must be immediately below title');
   assert.equal(await purpose.locator('.beagu-q50-row').count(),11);
   for(const sel of ['#beaguQ50Title','.beagu-q50-eyebrow','.beagu-q50-question','.beagu-q50-highlight>strong','.beagu-q50-highlight>span','.beagu-q50-highlight>small','.beagu-q50-results h3','.beagu-q50-row-label>span','.beagu-q50-row-label>strong>small','.beagu-q50-source','.beagu-q50-purpose p','.beagu-survey-fold>summary'])await contrast(purpose.locator(sel).first(),colorScheme+' '+sel);
   await purpose.locator('summary').click();await contrast(purpose.locator('.beagu-survey-fold>p').first(),colorScheme+' disclosure');
   for(const url of ['search.html','search-lv1.html']){
    await page.goto(origin+'/'+url);
    const link=page.locator('#beaguInterest .beagu-interest-link').first();
    await link.waitFor({state:'visible'});
    const check=async state=>{for(const sel of ['strong','small','.beagu-interest-rank'])await contrast(link.locator(sel),colorScheme+' '+url+' '+state+' '+sel)};
    await check('normal');await link.hover();await check('hover');
    await page.mouse.down();try{await check('active')}finally{await page.mouse.move(0,0);await page.mouse.up()}
    await page.keyboard.press('Tab');await link.focus();await check('focus');
    assert.ok((await link.getAttribute('href')).includes('school_id='+fixture.school_id));
   }
   console.log('PASS contrast and purpose order '+colorScheme+' '+width);
  }finally{await context.close()}
 }
}finally{await browser.close()}
