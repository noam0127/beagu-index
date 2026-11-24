'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const origin='http://127.0.0.1:8124';
const publicLink='https://baeguindex.com/r/#AbCd1234';
const fullLink='https://baeguindex.com/survey.html?ref='+'c'.repeat(64);
const code='K7M9Q2X4T8', common='FIXTURE01', token1='a'.repeat(64),token2='b'.repeat(64);
const school={school_id:'1234567',school_name:'검증초등학교',sido:'부산',sido_standard:'부산',support_office:'동래',address:'검증 주소',establishment:'공립',status:'운영',housing_price_won:123456789,student_count:123};
const renderer=require.resolve('html2canvas/dist/html2canvas.min.js');
const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'*','content-type':'application/json'};
function fixtureClient(school){
 const from=name=>{
  let proxy;
  const result=()=>({data:name==='schools'?[school]:[],count:name==='schools'?1:0,error:null});
  proxy=new Proxy({}, {get(_,k){
   if(k==='then')return (resolve,reject)=>Promise.resolve(result()).then(resolve,reject);
   if(k==='maybeSingle'||k==='single')return async()=>({data:school,error:null});
   return ()=>proxy;
  }});
  return proxy;
 };
 const auth={getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
 window.supabase={createClient:()=>({from,auth,rpc:async name=>({data:name==='beagu_get_challenge_progress'?800:[],error:null}),functions:{invoke:async()=>({data:{today:1,month:1,total:1,rising:[]},error:null})}})};
}
async function routes(page,tracker){
 await page.addInitScript(fixtureClient,{...school,housing_price_won:undefined});
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===origin){
   if(u.pathname==='/data/public-compare-school-directory-v1.json')return route.fulfill({status:404,body:'fixture DB fallback'});
   return route.continue();
  }
  if(u.protocol==='data:'||u.protocol==='blob:')return route.continue();
  if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('html2canvas'))return route.fulfill({path:renderer,contentType:'application/javascript'});
  if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:'/* fixture client */'});
  const name=u.pathname.split('/').at(-1);
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  let body={};try{body=req.postDataJSON()||{}}catch{}
  const respond=(status,data)=>route.fulfill({status,headers,body:JSON.stringify(data)});
  const token=req.headers()['x-beagu-session']||'';
  const tier=token===token1?(tracker.sessionPromoted?2:1):token===token2&&tracker.allowLv2?2:0;
  if(name==='beagu-account-v1'){
   if(body.action==='password_login'&&body.account_id===code&&body.password==='fixture-pass'){tracker.owner=true;return respond(200,{token:token1,account_id:code,level:tracker.sessionPromoted?2:1});}
   if(body.action==='status'&&token===token1&&tracker.owner)return respond(200,{account_id:code,level:tier,lv2_active:tier===2});
   if(body.action==='logout'&&token===token1&&tracker.owner){tracker.owner=false;tracker.sessionPromoted=false;return respond(200,{ok:true});}
   return respond(401,{error:'AUTH_REQUIRED'});
  }
  if(name==='beagu-level-api'){
   if(body.action==='login'){
    if(body.code===common)return respond(200,{token:token1,level:1,provisional:false});
    if(body.code===code&&tracker.allowLv2)return respond(200,{token:token2,level:2,provisional:true});
    return respond(401,{error:'INVALID_CODE'});
   }
   if(body.action==='verify')return tier?respond(200,{level:tier,provisional:tier===2}):respond(401,{error:'AUTH_REQUIRED'});
   if(body.action==='logout'){tracker.sessionPromoted=false;return respond(200,{ok:true});}
   if(!tier)return respond(401,{error:'AUTH_REQUIRED'});
   if(body.action==='ranked_schools'){tracker.searchTiers.push(tier);return respond(200,{schools:[{...school,housing_price_won:tier===2?school.housing_price_won:null}],total:1});}
   if(body.action==='school')return respond(200,{rows:[],schoolQuestionModes:[],questionResults2026:[]});
   return respond(200,{rows:[],schools:[]});
  }
  if(name==='beagu-challenge-identity'){
   if(!tier)return respond(401,{error:'AUTH_REQUIRED'});
   tracker.identityRequests++;return respond(200,{participantNo:777,identityCode:code});
  }
  if(name==='beagu-referral-link-v1'){
   if(!tier)return respond(401,{error:'AUTH_REQUIRED'});
   assert.equal(body.identityCode,code);tracker.referralRequests++;if(tracker.owner&&tracker.promoted&&tracker.count>=1&&token===token1)tracker.sessionPromoted=true;
   return respond(200,{link:fullLink,shortLink:publicLink,validReferrals:tracker.count,level:tracker.owner&&tracker.promoted?2:1,provisional:tracker.owner&&tracker.promoted});
  }
  return route.abort('blockedbyclient');
 });
}
async function goto(page,file){await page.goto(origin+'/'+file,{waitUntil:'domcontentloaded',timeout:30000});}
async function waitText(page,sel,text){await page.waitForFunction(({sel,text})=>document.querySelector(sel)?.textContent.includes(text),{sel,text},{timeout:20000});}
async function login(page,value,level){
 await page.locator('#beaguLevelState').click();
 await page.locator('#beaguParticipationCode').fill(value);
 await page.locator('#beaguParticipationSubmit').click();
 await page.locator('#beaguParticipationOverlay').waitFor({state:'hidden',timeout:15000});
 await page.waitForFunction(level=>document.querySelector('#beaguLevelState')?.dataset.level===String(level),level,{timeout:15000});
}
async function fit(page){
 const dim=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
 assert.ok(dim.scroll<=dim.width+2,'Horizontal overflow: '+JSON.stringify(dim));
}
async function png(page,filename){
 await page.waitForFunction(()=>!document.querySelector('#capture')?.disabled,null,{timeout:40000});
 const certificate=page.locator('#certificate'),bound=await certificate.boundingBox(),source=await certificate.innerText();
 assert.ok(!source.includes(code)&&!source.includes(token1)&&!source.includes(token2)&&!source.includes(publicLink),'Private material in capture root');
 const pending=page.waitForEvent('download',{timeout:15000});
 await page.locator('#capture').click();
 const d=await pending;await d.saveAs(filename);
 const bytes=await fs.readFile(filename);
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 assert.ok(Math.abs(width-bound.width*2)<=4&&Math.abs(height-bound.height*2)<=4,'Unexpected image dimensions: '+width+'x'+height+' vs '+JSON.stringify(bound));
 return bytes;
}
async function search(page,level){
 await goto(page,level===0?'search.html':'search-lv1.html');
 await page.locator('#searchInput').waitFor({state:'visible'});
 await page.locator('#searchInput').fill('검증초등학교');await page.locator('#searchInput').press('Enter');
 await page.locator('.school-card[data-school-id="1234567"][data-access-level="'+level+'"]').waitFor({state:'visible',timeout:20000});
 if(level===0)assert.equal(await page.locator('.school-card .beagu-housing-preview').count(),0);
}
(async()=>{
 const out=path.resolve('artifacts/v1112');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.BEAGU_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 for(const cfg of [{name:'desktop',width:1365,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
  const ctx=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},isMobile:cfg.mobile,hasTouch:cfg.mobile,acceptDownloads:true});
  await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',err=>errors.push(err.message));
  const tracker={count:0,promoted:false,allowLv2:false,identityRequests:0,referralRequests:0,searchTiers:[]};
  await routes(page,tracker);
  await goto(page,'challenge.html');
  await page.locator('.together-survey').waitFor({state:'visible'});
  assert.equal(await page.locator('#challengeProtected').isHidden(),true);
  assert.equal(tracker.identityRequests,0);
  await fit(page);
  await login(page,common,1);
  await waitText(page,'#participantNo','777');
  await waitText(page,'#challengeReferralCount','0건');
  assert.equal(await page.locator('#certificate').getAttribute('data-level'),'1');
  assert.equal(await page.locator('#certificateMilestone').isVisible(),true);
  assert.equal(await page.locator('#togetherIdentityDetails').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#identityCode').isVisible(),false);
  assert.equal(await page.locator('#loungeLink').getAttribute('href'),'https://indischool.com/tweets/channels/lounge');
  assert.equal(await page.locator('#loungeLink').getAttribute('target'),'_blank');
  const lv1=await png(page,path.join(out,cfg.name+'-lv1.png'));
  await page.locator('#copyChallengeReferral').click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),publicLink);
  await page.locator('#shareChallengeReferral').click();
  const copied=await page.evaluate(()=>navigator.clipboard.readText());
  assert.ok(copied.includes(publicLink)&&!copied.includes(code)&&!copied.includes(token1));
  await fit(page);
  await page.screenshot({path:path.join(out,cfg.name+'-challenge-lv1.png'),fullPage:true});
  tracker.count=1;tracker.promoted=false;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await waitText(page,'#togetherReferralState','추천 완료 · 계정 및 권한 확인 중');
  assert.equal(await page.locator('#certificate').getAttribute('data-level'),'1');
  tracker.promoted=true;tracker.allowLv2=true;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await waitText(page,'#togetherReferralState','추천 완료 · 계정 및 권한 확인 중');
  assert.equal(await page.locator('#certificate').getAttribute('data-level'),'1','Referral alone must not promote a new member');
  await page.locator('#beaguAccountHeader').click();
  await page.locator('#beaguEntryId').fill(code);
  await page.locator('#beaguEntryPassword').fill('fixture-pass');
  await page.locator('#beaguEntrySubmit').click();
  await page.locator('#beaguParticipationOverlay').waitFor({state:'hidden',timeout:15000});
  await page.waitForFunction(()=>document.querySelector('#challengeAccountStatus')?.dataset.accountState==='verified');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await waitText(page,'#togetherReferralState','Lv.2 인증 완료');
  await waitText(page,'#certificateLevelBanner','Lv.2 챌린지 달성');
  assert.equal(await page.locator('#beaguLevelState').getAttribute('data-level'),'2','Server-confirmed session promotion must be visible');
  const lv2=await png(page,path.join(out,cfg.name+'-lv2.png'));
  assert.ok(!lv1.equals(lv2),'PNG must change when certificate tier changes');
  await page.locator('#togetherIdentityDetails summary').click();
  assert.equal(await page.locator('#identityCode').innerText(),code);
  tracker.count=3;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await waitText(page,'#challengeReferralCount','3건');
  assert.equal(await page.locator('#participantNo').innerText(),'777번째');
  await waitText(page,'#togetherBenefitsState','Lv.2 이용 가능');
  await fit(page);
  await page.screenshot({path:path.join(out,cfg.name+'-challenge-lv2.png'),fullPage:true});
  await search(page,2);
  assert.ok(tracker.searchTiers.includes(2));
  await goto(page,'statistics.html');
  await page.locator('#searchInput').fill('검증초등학교');
  await page.locator('#compareSuggestions .compare-suggestion').first().waitFor({state:'visible',timeout:15000});
  await page.locator('#compareSuggestions .compare-suggestion').first().click();
  await waitText(page,'#compareCounter','1 / 5');
  await page.locator('#compareResults').waitFor({state:'visible'});
  assert.ok((await page.locator('#compareSelections').innerText()).includes('검증초등학교'));
  await page.locator('#beaguAccountHeader').click();await page.locator('#beaguEntryLogout').click();
  await page.waitForFunction(()=>document.querySelector('#beaguLevelState')?.dataset.level==='0');
  await search(page,0);
  await goto(page,'challenge.html');
  assert.equal(await page.locator('#challengeProtected').isHidden(),true);
  assert.equal(await page.locator('#challengeReferralLink').inputValue(),'');
  // Independent no-credit fixture: an earned visitor would correctly auto-promote on re-login.
  tracker.count=0;tracker.promoted=false;tracker.sessionPromoted=false;
  await login(page,common,1);
  await search(page,1);
  assert.ok(tracker.searchTiers.includes(1));
  tracker.count=0;tracker.promoted=false;
  await goto(page,'challenge.html');
  await login(page,code,2);
  await waitText(page,'#challengeReferralCount','0건');
  await waitText(page,'#togetherReferralState','Lv.2 인증 완료');
  assert.equal(await page.locator('#certificate').getAttribute('data-level'),'2');
  await fit(page);
  assert.deepEqual(errors,[],'Unhandled page exceptions');
  console.log('PASS '+cfg.name+': Lv0/1/2, referral 0/1/3, legacy Lv2, actual PNG downloads, clipboard, special ordinal 777, search and compare; all external requests blocked.');
  await ctx.close();
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
