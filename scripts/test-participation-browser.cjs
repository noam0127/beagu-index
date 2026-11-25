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
 assert.match(await page.locator('#beaguParticipationTitle').innerText(),/참여코드 입력|레벨2에 도전하세요!|참여 인증 정보/);
 const fit=await page.locator('.beagu-participation-dialog').boundingBox();
 const size=page.viewportSize();
 assert(fit&&fit.x>=-1&&fit.x+fit.width<=size.width+1,'Modal must fit mobile width');
 assert(fit.y>=-1&&fit.y+fit.height<=size.height+1,'Modal must fit viewport height');
}
async function headerState(page,level){
 await page.waitForFunction(n=>document.getElementById('beaguLevelState')?.dataset.level===String(n),level);
 const header=page.locator('.beagu-header-code');
 await header.waitFor({state:level<2?'visible':'hidden'});
 assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.'+level);
 if(level<2){
  const fit=await header.boundingBox(),badge=await page.locator('#beaguLevelState').boundingBox(),size=page.viewportSize();
  assert(fit&&badge&&fit.x>=0&&fit.x+fit.width<=badge.x+1&&badge.x+badge.width<=size.width+1,'Code and level fit adjacent in the header');
  assert(Math.abs(fit.y-badge.y)<=6,'Code and level share the same row');
 }
}
async function login(page,code,expected){
 const field=page.locator('.beagu-header-code input');
 await field.fill(code);
 await page.locator('.beagu-header-code button').click();
 await headerState(page,expected);
}
async function resultSave(page,compact){
 await page.addScriptTag({url:origin+'/js/arcade-result-share-v1.js'});
 await page.evaluate(compact=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=200;
  canvas.getContext('2d').fillRect(0,0,320,200);
  const host=document.createElement('div');host.id='result-save-fixture';host.style.cssText='position:fixed;inset:0;z-index:9999;background:#183751;color:white;';document.body.append(host);
  window.BeaguArcadeResult.create(host,canvas,{compact}).show({game:'테스트',title:'게임 결과',detail:'',metrics:['점수 2500']});
 },compact);
 const button=page.locator('#result-save-fixture .arcade-result-save');await button.waitFor({state:'visible'});
 assert.equal(await button.innerText(),'💾 게임결과 저장');
 await page.waitForFunction(()=>!document.querySelector('#result-save-fixture .arcade-result-save').disabled);
 assert.equal(await page.locator('#result-save-fixture .arcade-result-copy,#result-save-fixture .arcade-result-download').count(),0);
 const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);
 assert.equal(download.suggestedFilename(),'baegu-game-result.png');
 const bytes=await fs.readFile(await download.path());
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 await page.locator('#result-save-fixture').evaluate(n=>n.remove());
}
async function hiddenCards(page){
 for(const card of await page.locator('#lv1QuickAuth,#loginPanel,#compareLv1AuthPanel,#challengeAccessPanel,#lv2UpgradeCard,#compareLv2Upgrade,#playLv2Upgrade').all())assert.equal(await card.isVisible(),false,'Retired body code card must be hidden');
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
   await view(page,'index.html');await headerState(page,0);
   await page.locator('.beagu-header-code input').fill('INVALIDCODE12');
   await page.locator('.beagu-header-code button').click();
   await page.waitForFunction(()=>document.querySelector('.beagu-header-code-feedback')?.textContent.includes('참여코드를 확인해'));
   await headerState(page,0);
   await login(page,LV1,1);
   for(const route of ['search-lv1.html','statistics.html','games.html','challenge.html']){
    await view(page,route);await headerState(page,1);await hiddenCards(page);
   }
   await page.locator('.beagu-header-code input').fill(LV1);
   await page.locator('.beagu-header-code button').click();
   await page.waitForFunction(()=>document.querySelector('.beagu-header-code-feedback')?.textContent.includes('기존 Lv.1 인증은 유지'));
   await headerState(page,1);
   await login(page,LV2,2);
   for(const route of ['index.html','search-lv1.html','statistics.html','games.html','challenge.html','postit.html']){
    await view(page,route);await headerState(page,2);await hiddenCards(page);
   }
   assert.equal(await page.locator('#challengeMemberOverlay').count(),0);
   await view(page,'challenge.html');await headerState(page,2);
   await open(page);
   assert.equal(await page.locator('#beaguParticipationDetail').isVisible(),true);
   assert.equal(await page.locator('#beaguParticipationForm').isHidden(),true);
   await page.screenshot({path:'artifacts/participation-auth/'+cfg.name+'-lv2.png',fullPage:false});
   await page.locator('#beaguParticipationLogout').click();
   await headerState(page,0);await hiddenCards(page);
   for(const route of ['search.html','statistics.html','games.html','challenge.html']){
    await view(page,route);await headerState(page,0);await hiddenCards(page);
    const overlay=page.locator('#beaguParticipationOverlay');
    if(route==='challenge.html'){
     await overlay.waitFor({state:'visible'});
     await page.locator('#beaguParticipationCode').waitFor({state:'visible'});
     await page.keyboard.press('Escape');
     await overlay.waitFor({state:'hidden'});
    }else assert.equal(await overlay.isHidden(),true);
   }
   await page.screenshot({path:'artifacts/participation-auth/'+cfg.name+'-lv0.png',fullPage:false});
   await login(page,LV2,2);
   await open(page);await page.keyboard.press('Escape');
   assert.equal(await page.locator('#beaguParticipationOverlay').isHidden(),true);
   await resultSave(page,false);await resultSave(page,true);
   const authErrors=errors.filter(e=>e.includes('beagu-participation-auth-v2'));
   assert.deepEqual(authErrors,[],'No shared UI exceptions');
   await ctx.close();
  }
  console.log('PASS: desktop/mobile Lv0 rejection, Lv1 and Lv2 auth, cross-page persistence, detail and revoke');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
