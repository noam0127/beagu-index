/* Real local PC/mobile Chromium UI, ALL Auth and Stage Edge HTTP MOCKED.
 * Tests verified-email + original-device + linked Lv2 => server Lv3.
 * NO Supabase credential, email submission, DB write or actual Lv3 E2E.
 */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin='http://127.0.0.1:8132';
const api='https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/';
const participationCode='BG26-QA-ONLY-LV2';
const levelToken='a'.repeat(64);
const originalSecret='c'.repeat(64);
const fakeJWT='qa.jwt.signature-simulated-do-not-use-as-credential';
const cors={
 'access-control-allow-origin':origin,
 'access-control-allow-methods':'GET,POST,OPTIONS',
 'access-control-allow-headers':'authorization,content-type,apikey,x-beagu-session,x-beagu-level-session',
 'content-type':'application/json'
};
const fulfill=(route,status,data)=>route.fulfill({status,headers:cors,body:JSON.stringify(data)});
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const cfg of [
    {name:'desktop',width:1365,height:900,mobile:false},
    {name:'mobile',width:390,height:844,mobile:true}
  ]){
   const ctx=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},
     isMobile:cfg.mobile,deviceScaleFactor:1,hasTouch:cfg.mobile});
   const state={signedIn:false,confirmed:false,linked:false,suspended:false,authSessionAlive:true,accountId:'qa-owner',
     visitorId:'qa-visitor',levelSession:'',revoked:false};
   const realExternal=[];
   await ctx.route('**/*',route=>{
     const u=new URL(route.request().url());
     if(u.origin===origin)return route.continue();
     realExternal.push(u.hostname+u.pathname);
     return route.abort();
   });
   const page=await ctx.newPage();
   page.on('pageerror',e=>{console.error('pageerror',e.message)});
   await page.addInitScript(({jwt})=>{
     const s={signedIn:false,confirmed:false,linked:false,accountId:'qa-owner',
       callbacks:[],signupAttempts:0};
     window.__qaAuth=s;
     window.__qaAuthUpdate=patch=>{
       Object.assign(s,patch);
       for(const cb of s.callbacks)cb('SIGNED_IN',{access_token:jwt});
     };
     window.supabase={createClient:()=>({auth:{
       getSession:async()=>({error:null,data:{session:s.signedIn?{access_token:jwt}:null}}),
       getUser:async()=>({error:null,data:{user:s.signedIn?{
         id:s.accountId,is_anonymous:false,
         email_confirmed_at:s.confirmed?'2026-11-23T00:00:00Z':null
       }:null}}),
       signUp:async()=>{s.signupAttempts++;return {data:{user:{id:'qa-owner'},session:null},error:null}},
       signInWithPassword:async()=>{if(!s.confirmed)return {error:new Error('Email not confirmed')};
         s.signedIn=true;for(const cb of s.callbacks)cb('SIGNED_IN',{access_token:jwt});
         return {data:{session:{access_token:jwt}},error:null}},
       signOut:async()=>{s.signedIn=false;for(const cb of s.callbacks)cb('SIGNED_OUT',null);return {error:null}},
       onAuthStateChange:callback=>{s.callbacks.push(callback);
         return {data:{subscription:{unsubscribe(){}}}}}
     }})};
   },{jwt:fakeJWT});
   await page.route(api+'beagu-level-api',async route=>{
     const req=route.request();
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
     let b={};try{b=req.postDataJSON()}catch(_){}
     if(b.action==='login'){
       if(b.code!==participationCode)return fulfill(route,401,{error:'INVALID_CODE'});
       state.levelSession=levelToken;
       return fulfill(route,200,{token:levelToken,level:2,provisional:false});
     }
     if(b.action==='verify'){
       const token=req.headers()['x-beagu-session'];
       if(token!==state.levelSession||state.revoked)return fulfill(route,401,{error:'AUTH_REQUIRED'});
       const header=req.headers()['authorization'];
       const third=header==='Bearer '+fakeJWT&&state.authSessionAlive&&state.signedIn&&state.confirmed&&
         state.linked&&state.accountId==='qa-owner'&&state.visitorId==='qa-visitor';
       return fulfill(route,200,{level:third?3:2,provisional:false,
         expires_at:'2027-01-01T00:00:00Z'});
     }
     if(b.action==='logout'){state.levelSession='';return fulfill(route,200,{ok:true})}
     return fulfill(route,403,{error:'LEVEL_REQUIRED'});
   });
   await page.route(api+'beagu-postit-api-v1?*',async route=>{
     const req=route.request();
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
     if(req.method()==='GET'){
       const linked=state.signedIn&&state.confirmed&&state.linked&&state.accountId==='qa-owner';
       const suspended=state.signedIn&&state.confirmed&&state.suspended&&state.accountId==='qa-owner';
       return fulfill(route,200,{linked,link_state:linked?'active':suspended?'suspended':'unlinked'});
     }
     return fulfill(route,403,{error:'WRITER_IDENTITY_REQUIRED'});
   });
   await page.route(api+'beagu-postit-api-v1',async route=>{
     if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
     let b={};try{b=route.request().postDataJSON()}catch(_){}
     const authOK=state.authSessionAlive&&state.signedIn&&state.confirmed&&state.accountId==='qa-owner'&&
       route.request().headers()['x-beagu-level-session']===state.levelSession&&
       route.request().headers()['authorization']==='Bearer '+fakeJWT;
     const deviceOK=b.deviceSecret===originalSecret;
     if(!authOK)return fulfill(route,403,{error:'ACCOUNT_AUTH_REQUIRED'});
     if(b.action==='suspend_member'&&state.linked){
       state.linked=false;state.suspended=true;
       return fulfill(route,200,{linked:false,link_state:'suspended',changed:true});
     }
     if((b.action==='link_member'&&!state.suspended||
         b.action==='reactivate_member'&&state.suspended)&&deviceOK){
       state.linked=true;state.suspended=false;
       return fulfill(route,200,{linked:true,link_state:'active',changed:true});
     }
     return fulfill(route,403,{error:'DEVICE_OWNERSHIP_NOT_VERIFIED'});
   });
   async function update(patch){
     Object.assign(state,patch);
     await page.evaluate(p=>window.__qaAuthUpdate(p),patch);
   }
   async function expectTier(n){
     await page.waitForFunction(level=>
       document.querySelector('#beaguLevelState')?.dataset.level===String(level),
       n,{timeout:9000});
     assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.'+n);
   }
   await page.goto(origin+'/challenge.html',{waitUntil:'domcontentloaded'});
   await page.locator('#beaguLevelState').waitFor();
   await page.evaluate(secret=>localStorage.setItem('beagu-referral-device-secret-v1',secret),originalSecret);
   await page.locator('#beaguLevelState').click();
   await page.locator('#beaguParticipationCode').fill(participationCode);
   await page.locator('#beaguParticipationSubmit').click();
   await page.locator('#beaguParticipationOverlay').waitFor({state:'hidden'});
   await expectTier(2);
   // Signup request cannot grant Lv3; only a mock Auth signup (no network).
   await page.locator('#challengeAccessPanel [data-beagu-participation-status]').click();
   await page.locator('#challengeMemberOverlay').waitFor({state:'visible'});
   await page.locator('#challengeMemberSwitch').click();
   await page.locator('#challengeMemberEmail').fill('qa-member@example.invalid');
   await page.locator('#challengeMemberPassword').fill('synthetic-long-password-11');
   await page.locator('#challengeMemberSubmit').click();
   await page.waitForFunction(()=>window.__qaAuth.signupAttempts===1);
   await expectTier(2);
   assert.equal(await page.locator('#challengeMemberLink').isHidden(),true);
   await update({signedIn:true,confirmed:false});
   await expectTier(2);
   assert.equal(await page.locator('#challengeMemberLink').isHidden(),true);
   // Auth confirmed but member identity not linked -> still Lv2.
   await update({confirmed:true});
   await expectTier(2);
   await page.locator('#challengeMemberLink').waitFor({state:'visible'});
   await page.locator('#challengeMemberLink').click();
   await expectTier(3);
   assert.equal(state.linked,true);
   assert.equal(await page.locator('#challengeMemberOverlay').isVisible(),true);
   assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.3');
   assert.equal(await page.locator('#challengeMemberLink').isHidden(),true);
   // Explicit member suspension must downgrade Lv3. A suspended visitor stays
   // bound to this account, and only the original device may reactivate it.
   await page.locator('#challengeMemberSuspend').waitFor({state:'visible'});
   page.once('dialog',d=>d.accept());
   await page.locator('#challengeMemberSuspend').click();
   await expectTier(2);
   assert.equal(state.suspended,true);
   await page.locator('#challengeMemberLink').waitFor({state:'visible'});
   assert.equal(await page.locator('#challengeMemberLink').getAttribute('data-action'),'reactivate_member');
   await page.evaluate(()=>localStorage.removeItem('beagu-referral-device-secret-v1'));
   await page.evaluate(()=>window.dispatchEvent(new Event('beagu:level-state-change')));
   // No original device proof: the same account cannot reactivate.
   await page.locator('#challengeMemberLink').waitFor({state:'hidden'});
   await page.evaluate(secret=>localStorage.setItem('beagu-referral-device-secret-v1',secret),originalSecret);
   await page.evaluate(()=>window.dispatchEvent(new Event('beagu:level-state-change')));
   await page.locator('#challengeMemberLink').waitFor({state:'visible'});
   await page.locator('#challengeMemberLink').click();
   await expectTier(3);
   assert.equal(state.linked,true);
   assert.equal(state.suspended,false);
   await page.locator('#challengeMemberSuspend').waitFor({state:'visible'});
   // Shared badge/details must preserve Level 3, not report INVALID_LEVEL.
   await page.locator('#challengeMemberClose').click();
   await page.locator('#beaguLevelState').click();
   await page.locator('#beaguParticipationOverlay').waitFor({state:'visible'});
   assert.match(await page.locator('#beaguParticipationTier').innerText(),/Lv3/);
   assert.equal(await page.locator('#beaguParticipationDetail').isVisible(),true);
   await page.locator('[data-beagu-close]').click();
   // A device/unlinked member, mismatched user or unconfirmed email loses Lv3.
   await update({linked:false});
   await expectTier(2);
   await update({linked:true,accountId:'other-qa-account'});
   await expectTier(2);
   await update({accountId:'qa-owner',confirmed:false});
   await expectTier(2);
   await update({confirmed:true});
   await expectTier(3);
   // Simulated remote sign-out: the browser still holds the old Auth JWT.
   // On the NEXT server check, the revoked auth.sessions ID loses Lv3.
   state.authSessionAlive=false;
   await page.evaluate(()=>window.dispatchEvent(new Event('beagu:level-state-change')));
   await expectTier(2);
   state.authSessionAlive=true;
   await page.evaluate(()=>window.dispatchEvent(new Event('beagu:level-state-change')));
   await expectTier(3);
   await update({signedIn:false});
   await expectTier(2);
   // Without participation code, an email account cannot establish Lv3.
   await update({signedIn:true});
   await expectTier(3);
   state.revoked=true;
   await page.evaluate(()=>window.dispatchEvent(new Event('beagu:level-state-change')));
   await expectTier(0);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('beagu-level-session-v1')),null);
   assert(realExternal.every(s=>!s.startsWith('snvzwrexuqavnfvzgxqj.supabase.co')),
      'production Supabase access is forbidden in simulated UI test');
   assert(realExternal.every(s=>!s.startsWith('ycwuugggqbunlbwuzvbx.supabase.co/auth/')),
      'real signup Auth HTTP is forbidden in synthetic E2E');
   await ctx.close();
   console.log('PASS '+cfg.name+': synthetic email unverified->Lv2, verified-unlinked->Lv2, device-linked->Lv3, wrong account->Lv2, revoked->Lv0');
  }
 }finally{await browser.close()}
 console.log('PASS: explicit member suspension Lv3->Lv2 and original-device same-account reactivation Lv2->Lv3');
 console.log('PASS: remote Auth revocation downgrades cached JWT on next server recheck');
 console.log('NOT PROVEN: real Auth signup/email confirmation or backend-positive Lv3 on Render');
})().catch(e=>{console.error(e);process.exitCode=1});
