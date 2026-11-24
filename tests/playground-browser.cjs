/* Real Chromium, exact candidate assets, intercepted network only. No deployed test website. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const origin='http://playground.invalid';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json'};
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
 try{
  for(const width of [320,390,768,1440]){
   for(const tier of [0,1,2]){
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
    try{
     await context.addInitScript(({origin,tier})=>{if(location.origin===origin&&tier)sessionStorage.setItem('beagu-level-session-v1','a'.repeat(64))},{origin,tier});
     await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname.endsWith('/functions/v1/beagu-level-api')&&url.hostname.endsWith('.supabase.co')){
       const headers={'access-control-allow-origin':origin,'access-control-allow-headers':'content-type,x-beagu-session','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json'};
       if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
       const action=route.request().postDataJSON()?.action;
       if(action==='verify'&&tier&&route.request().headers()['x-beagu-session']==='a'.repeat(64))return route.fulfill({status:200,headers,body:JSON.stringify({level:tier,provisional:false})});
       return route.fulfill({status:401,headers,body:'{}'});
      }
      if(url.origin!==origin)return route.abort();
      const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if(!relative||relative.includes('..'))return route.abort();
      // Actual hub and all its local dependencies; target navigation is intercepted
      // as a harmless landing marker to avoid executing existing games or services.
      if(relative.endsWith('.html')&&relative!=='games.html')return route.fulfill({contentType:mime['.html'],body:'<!doctype html><title>Navigation fixture</title><p>Target reached</p>'});
      try{return route.fulfill({status:200,contentType:mime[path.extname(relative)]||'application/octet-stream',body:await fs.readFile(path.join(process.cwd(),relative))})}catch{return route.fulfill({status:404,body:''})}
     });
     const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.goto(origin+'/games.html');
     await page.waitForFunction(level=>document.querySelector('#beaguLevelState')?.dataset.level===String(level),tier);
     assert.equal(await page.locator('article[data-game]').count(),4);
     assert.equal(await page.locator('article[data-status="coming-soon"] a,article[data-status="coming-soon"] button').count(),0);
     assert.equal(await page.locator('.beagu-core-nav a:visible').count(),5);
     const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,columns:getComputedStyle(document.querySelector('.playground-grid')).gridTemplateColumns.split(' ').length}));
     assert.ok(dims.scroll<=dims.width+1,'horizontal overflow '+JSON.stringify(dims));assert.equal(dims.columns,width<=600?1:2);
     await page.locator('#beaguLevelState').click();
     await page.locator('#beaguParticipationOverlay').waitFor({state:'visible'});
     assert.equal(await page.locator('#beaguParticipationTitle').innerText(),tier===1?'레벨2에 도전하세요!':tier===2?'참여 인증 정보':'참여코드 입력');
     await page.keyboard.press('Escape');
     await page.locator('#beaguParticipationOverlay').waitFor({state:'hidden'});
     for(const [game,route,history] of [['volleyball','teacher-volleyball.html','volleyball_25'],['survival','teacher-run.html','teacher_run_retirement']]){
      const card=page.locator('[data-game="'+game+'"]');
      await card.locator('.playground-primary').click();assert.equal(new URL(page.url()).pathname,'/'+route);
      await page.goto(origin+'/games.html');
      await page.locator('[data-game="'+game+'"] .playground-secondary').click();assert.equal(new URL(page.url()).searchParams.get('game'),history);
      await page.goto(origin+'/games.html');
     }
     assert.deepEqual(errors,[]);console.log('PASS viewport='+width+' tier='+tier);
    }finally{await context.close()}
   }
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
