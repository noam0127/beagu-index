'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const origin='http://127.0.0.1:8128';
const originText='초등학교에서는 근무 중 직장 스포츠 활동으로 배구를 즐기고, 지역별 대회도 열리는 독특한 문화가 있습니다. 이러한 초등학교 교직문화의 특징을 상징하는 이름으로 배구지수를 선택했습니다.';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 await fs.mkdir('artifacts/landing',{recursive:true});
 try{
  for(const width of [320,390,768,1365]){
   for(const colorScheme of ['light','dark']){
    const ctx=await browser.newContext({viewport:{width,height:900},colorScheme,serviceWorkers:'block',deviceScaleFactor:1});
    await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
    const page=await ctx.newPage();
    const failed=[];page.on('response',r=>{if(r.url().includes('/assets/fonts/pretendard/')&&r.status()>=400)failed.push(r.url())});
    await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
    const hero=page.locator('.beagu-landing-hero');
    await hero.waitFor({state:'visible'});
    assert.equal(await hero.locator('h1').innerText(),'그 학교의 교직문화가 궁금하신가요?');
    const fonts=await page.evaluate(async()=>{const faces=await Promise.all([400,600,700].map(w=>document.fonts.load(w+' 20px Pretendard','선생님 학교')));return faces.map(f=>f.some(x=>x.status==='loaded'))});
    assert.deepEqual(fonts,[true,true,true]);assert.deepEqual(failed,[]);
    const metrics=await page.evaluate(()=>{
     const selectors=['#beaguLandingTitle','.beagu-landing-lead','.beagu-landing-description','.beagu-landing-primary','#beaguQ50Title','.beagu-q50-question','.beagu-name-origin summary'];
     return selectors.map(selector=>{const el=document.querySelector(selector),s=getComputedStyle(el),b=el.getBoundingClientRect();return {selector,size:parseFloat(s.fontSize),family:s.fontFamily,x:b.x,right:b.right,scroll:el.scrollWidth,client:el.clientWidth,height:b.height}});
    });
    for(const m of metrics){assert(m.x>=-1&&m.right<=width+1,JSON.stringify(m));assert(m.scroll<=m.client+2,JSON.stringify(m));assert(m.family.includes('Pretendard'),JSON.stringify(m))}
    assert(metrics[0].size>=32);assert(metrics[1].size>=20);assert(metrics[2].size>=18);assert(metrics[3].size>=20);assert(metrics[3].height>=48);
    assert.equal(await page.locator('.beagu-q50-bars li').count(),11);
    const faq=page.locator('.beagu-name-origin');assert.equal(await faq.getAttribute('open'),null);await faq.locator('summary').click();assert.equal(await faq.locator('p').innerText(),originText);assert.equal(await faq.locator('p').count(),1);await faq.locator('summary').click();
    for(const selector of ['#beaguLevelState','[data-beagu-xp]','[data-cumulative="responses"]','#beaguTodaySchools','#beagu2026Ranking','[data-stat="today"]','.survey-access-link'])assert.equal(await page.locator(selector).count(),1,selector);
    await page.screenshot({path:'artifacts/landing/'+width+'-'+colorScheme+'.png',fullPage:true,animations:'disabled'});
    const cta=hero.locator('a.beagu-landing-primary');assert.equal(await cta.getAttribute('href'),'search.html');
    await Promise.all([page.waitForURL(origin+'/search.html'),cta.click()]);
    await ctx.close();console.log('PASS',width,colorScheme,JSON.stringify(metrics));
   }
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
