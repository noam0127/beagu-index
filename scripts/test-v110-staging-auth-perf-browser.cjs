/* Isolated dev-branch browser regression. Real local Chromium rendering;
 * FAKE Lv1/Lv2 and performance HTTP. Never writes any real backend records.
 * Not a verified Lv3 signup or live Render E2E. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const origin='http://127.0.0.1:8132';
const endpoint='https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-level-api';
const performanceEndpoint='https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-perf-ingest-v1';
const productionHosts=new Set(['baeguindex.com','www.baeguindex.com',
 'snvzwrexuqavnfvzgxqj.supabase.co','forms.gle','forms.google.com','docs.google.com']);
const LV1='LV1TESTCODE12',LV2='BG26-ABCD-ABCD-ABCD-ABCD-ABCD';
const TOKEN1='a'.repeat(64),TOKEN2='b'.repeat(64);
const cors={
 'access-control-allow-origin':origin,
 'access-control-allow-methods':'POST, OPTIONS',
 'access-control-allow-headers':'content-type, x-beagu-session',
 'content-type':'application/json'
};
const fulfill=(route,status,data)=>route.fulfill({status,headers:cors,body:JSON.stringify(data)});
async function fixture(page,tracker){
 await page.route(endpoint,route=>{
  const req=route.request();
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  let body={};try{body=req.postDataJSON()}catch{}
  const tok=req.headers()['x-beagu-session']||'';
  if(body.action==='login'){
   if(body.code===LV1){tracker.level=1;tracker.token=TOKEN1;return fulfill(route,200,{token:TOKEN1,level:1,provisional:false})}
   if(body.code===LV2){tracker.level=2;tracker.token=TOKEN2;return fulfill(route,200,{token:TOKEN2,level:2,provisional:false})}
   return fulfill(route,401,{error:'INVALID_CODE'});
  }
  if(body.action==='verify'){
   if(tok&&tok===tracker.token)return fulfill(route,200,{level:tracker.level,provisional:false,expires_at:'2026-11-21T20:00:00+09:00'});
   return fulfill(route,401,{error:'AUTH_REQUIRED'});
  }
  if(body.action==='logout'){tracker.token='';tracker.level=0;return fulfill(route,200,{ok:true})}
  return fulfill(route,403,{error:'ACCESS_DENIED'});
 });
}
async function view(page,path){
 await page.goto(origin+'/'+path,{waitUntil:'domcontentloaded',timeout:22000});
 await page.locator('#beaguLevelState').waitFor({state:'visible',timeout:10000});
}
async function open(page){
 await page.locator('#beaguLevelState').click({timeout:8000});
 await page.locator('#beaguParticipationOverlay').waitFor({state:'visible'});
 assert.equal(await page.locator('#beaguParticipationTitle').innerText(),'참여코드 입력');
 const fit=await page.locator('.beagu-participation-dialog').boundingBox();
 const size=page.viewportSize();
 assert(fit&&fit.x>=-1&&fit.x+fit.width<=size.width+1,'Modal must fit mobile width');
 assert(fit.y>=-1&&fit.y+fit.height<=size.height+1,'Modal must fit viewport height');
}
async function login(page,code){
 await open(page);
 await page.locator('#beaguParticipationCode').fill(code);
 await page.locator('#beaguParticipationSubmit').click();
 await page.locator('#beaguParticipationOverlay').waitFor({state:'hidden',timeout:10000});
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 await fs.mkdir('artifacts/participation-auth',{recursive:true});
 try{
  for(const cfg of [
   {name:'desktop',width:1365,height:900,mobile:false},
   {name:'mobile',width:390,height:844,mobile:true}
  ]){
   const ctx=await browser.newContext({
    viewport:{width:cfg.width,height:cfg.height},isMobile:cfg.mobile,
    deviceScaleFactor:1,hasTouch:cfg.mobile
   });
   // No third-party traffic, real Auth calls or writing to staging Supabase.
   // The browser is real Chromium, but backend success/failure states are mocked.
   const realExternal=[];
   await ctx.route('**/*',route=>{
     let u;try{u=new URL(route.request().url());}catch{return route.abort()}
     if(u.origin===origin)return route.continue();
     realExternal.push({host:u.hostname,path:u.pathname,method:route.request().method()});
     return route.abort();
   });
   const page=await ctx.newPage();
   const performanceEvents=[];
   await page.route(performanceEndpoint,route=>{
     const req=route.request();
     if(req.method()==='OPTIONS')return route.fulfill({
       status:204,headers:{'access-control-allow-origin':origin,
         'access-control-allow-methods':'POST,OPTIONS',
         'access-control-allow-headers':'content-type'}});
     assert.equal(req.method(),'POST');
     const sample=req.postDataJSON();
     performanceEvents.push({sample,headers:req.headers()});
     return route.fulfill({status:200,headers:{'access-control-allow-origin':origin,
       'content-type':'application/json'},body:JSON.stringify({ok:true,accepted:true})});
   });
   // Keep this browser E2E fully offline with respect to real account Auth.
   // Only a local mock client is needed to render the Lv2 dialog; no signup is sent.
   await page.addInitScript(()=>{
    window.supabase={createClient:()=>({auth:{
      getSession:async()=>({data:{session:null},error:null}),
      getUser:async()=>({data:{user:null},error:null}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
    }})};
   });
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const tracker={level:0,token:''};
   await fixture(page,tracker);
   await view(page,'index.html');
   // Validate the new staging-only perf gateway from an ACTUAL browser.
   const perfReady=await page.evaluate(()=>({
     present:typeof window.BeaguPerf?.record==='function',
     backend:typeof SUPABASE_URL==='string' ? SUPABASE_URL : null
   }));
   assert.equal(perfReady.backend,'https://ycwuugggqbunlbwuzvbx.supabase.co');
   assert.equal(perfReady.present,true);
   await page.evaluate(()=>window.BeaguPerf.record('navigation',157,true));
   await page.waitForTimeout(180);
   const browserPerf=performanceEvents.find(x=>x.sample?.duration_ms===157);
   assert(browserPerf,'No browser performance event reached the isolated mocked gateway');
   assert.deepEqual(Object.keys(browserPerf.sample).sort(),
     ['duration_ms','ok','operation','page','visitor']);
   assert.equal(browserPerf.sample.page,'index');
   assert.equal(browserPerf.sample.operation,'navigation');
   assert.equal(browserPerf.sample.ok,true);
   assert(!('authorization' in browserPerf.headers),'RUM must never forward Auth JWT');
   assert(performanceEvents.every(x=>JSON.stringify(x.sample).indexOf('email')===-1));
   await open(page);
   await page.locator('#beaguParticipationCode').fill('INVALIDCODE12');
   await page.locator('#beaguParticipationSubmit').click();
   assert.match(await page.locator('#beaguParticipationMessage').innerText(),/참여코드/);
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.0');
   await page.locator('[data-beagu-close]').click();
   await login(page,LV1);
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.1');
   await view(page,'statistics.html');
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.dataset.level==='1');
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.1');
   await open(page);
   assert.equal(await page.locator('#beaguParticipationDetail').isVisible(),true);
   await page.locator('#beaguParticipationLogout').click();
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.dataset.level==='0');
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.0');
   await login(page,LV2);
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.2');
   await view(page,'postit.html');
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.dataset.level==='2');
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.2');
   await view(page,'challenge.html');
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.dataset.level==='2');
   // Lv2 alone upgrades the Challenge action into account login.
   await page.waitForFunction(()=>document.querySelector('#challengeAccessPanel [data-beagu-participation-status]')?.textContent==='로그인하기');
   await page.locator('#challengeAccessPanel [data-beagu-participation-status]').click();
   await page.locator('#challengeMemberOverlay').waitFor({state:'visible',timeout:10000});
   assert.equal(await page.locator('#challengeMemberTitle').innerText(),'Lv2 로그인');
   const memberFit=await page.locator('#challengeMemberDialog').boundingBox();
   assert(memberFit&&memberFit.x>=-1&&memberFit.x+memberFit.width<=cfg.width+1,'Member login modal fits mobile width');
   await page.locator('#challengeMemberClose').click();
   await page.locator('#beaguLevelState').click();
   await page.locator('#beaguParticipationOverlay').waitFor({state:'visible'});
   await page.screenshot({path:'artifacts/participation-auth/'+cfg.name+'-lv2.png',fullPage:false});
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#beaguParticipationOverlay').isHidden(),true);
   // Explicitly record what is and is not proven: Lv3 is NOT minted by
   // mocking a Lv2 participation code. Real verified email signup remains NO-GO.
   assert.equal(await page.locator('#challengeMemberTitle').count(),1);
   assert(!realExternal.some(r=>productionHosts.has(r.host)),
      'A production host was requested: '+JSON.stringify(realExternal));
   assert(!realExternal.some(r=>r.host==='ycwuugggqbunlbwuzvbx.supabase.co'&&
      (r.path.includes('/auth/')||r.path.includes('link_member'))),
      'Test must not call live email authentication or link members');
   const authErrors=errors.filter(e=>e.includes('beagu-participation-auth-v2'));
   assert.deepEqual(authErrors,[],'No shared UI exceptions');
   await ctx.close();
  }
  console.log('PASS: desktop/mobile local Chromium Lv0 rejection, simulated Lv1/Lv2 code login, cross-page persistence and revocation'); 
  console.log('PASS: browser RUM uses mocked isolated staging gateway, never forwards Auth headers or production data'); 
  console.log('NOT PROVEN: real email account, actual Lv3 or Render deployment, genuine user/MFA browser E2E');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
