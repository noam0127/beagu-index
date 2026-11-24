/* Desktop/mobile browser flow for the real public pages, with a
 * network-intercepted fake AUTH API. Never reads or writes actual codes. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const origin='http://127.0.0.1:8124';
const endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api';
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
 await page.locator('#beaguEntryLegacy').click();
 const level=await page.locator('#beaguLevelState').getAttribute('data-level');
 assert.equal(await page.locator('#beaguParticipationTitle').innerText(),level==='1'?'레벨2에 도전하세요!':level==='2'?'참여 인증 정보':'참여코드 입력');
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
   const page=await ctx.newPage();
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
   await open(page);
   await page.locator('#beaguParticipationCode').fill('INVALIDCODE12');
   await page.locator('#beaguParticipationSubmit').click();
   assert.match(await page.locator('#beaguParticipationMessage').innerText(),/참여코드/);
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.0');
   await page.locator('[data-beagu-close]').click();
   await login(page,LV1);
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.textContent==='Lv.1');
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.1');
   await view(page,'statistics.html');
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.dataset.level==='1');
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.textContent==='Lv.1');
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.1');
   await open(page);
   assert.equal(await page.locator('#beaguParticipationDetail').isVisible(),true);
   await page.locator('#beaguParticipationLogout').click();
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.dataset.level==='0');
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.0');
   await login(page,LV2);
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.textContent==='Lv.2');
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.2');
   await view(page,'postit.html');
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.dataset.level==='2');
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.textContent==='Lv.2');
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.2');
   await view(page,'challenge.html');
   await page.waitForFunction(()=>document.getElementById('beaguLevelState')?.dataset.level==='2');
   // Challenge remains a code-only surface; account entry is a separate page.
   await page.waitForFunction(()=>document.querySelector('#challengeAccessPanel [data-beagu-participation-status]')?.textContent.includes('Lv2 · 챌린지 달성'));
   await page.locator('#challengeAccessPanel [data-beagu-participation-status]').click();
   await page.locator('#beaguParticipationOverlay').waitFor({state:'visible'});
   assert.equal(await page.locator('#challengeMemberOverlay').count(),0);
   assert.equal(await page.locator('#beaguAccountEntryTitle').isVisible(),true);
   await page.screenshot({path:'artifacts/participation-auth/'+cfg.name+'-lv2.png',fullPage:false});
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#beaguParticipationOverlay').isHidden(),true);
   const authErrors=errors.filter(e=>e.includes('beagu-participation-auth-v2'));
   assert.deepEqual(authErrors,[],'No shared UI exceptions');
   await ctx.close();
  }
  console.log('PASS: desktop/mobile Lv0 rejection, Lv1 and Lv2 auth, cross-page persistence, detail and revoke');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
