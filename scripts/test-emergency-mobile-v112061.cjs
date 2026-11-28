'use strict';
const assert=require('node:assert/strict');
const {webkit,devices}=require('playwright');
const origin='http://127.0.0.1:8124';
const endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api';
const code='SYNTHETICLV1',token='b'.repeat(64);
function mockSupabase(){
 const empty={data:[],error:null};
 const chain=new Proxy({then(resolve,reject){return Promise.resolve(empty).then(resolve,reject)}},{get(obj,key){return key==='then'?obj.then.bind(obj):()=>chain}});
 window.supabase={createClient:()=>({
  functions:{invoke:async(name,{body}={})=>{
   if(name==='beagu-telemetry-v2'&&body?.action==='visit'){
    window.fixtureVisits=(window.fixtureVisits||0)+1;
    return window.fixtureVisits===1?{error:{message:'unavailable'}}:{data:{today:7,month:91,total:1000},error:null};
   }
   return {data:{ok:true},error:null};
  }},
  auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>chain,rpc:async()=>empty
 })};
}
(async()=>{
 const browser=await webkit.launch();
 try{
  const context=await browser.newContext({...devices['iPhone 13']});
  const page=await context.newPage();
  let mode='unavailable',calls=[];
  await page.route('**/*',async route=>{
   const req=route.request(),url=req.url();
   if(url.startsWith(origin+'/'))return route.continue();
   if(url.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js')){
    return route.fulfill({contentType:'application/javascript',body:'('+mockSupabase.toString()+')()'});
   }
   if(url===endpoint){
    const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-beagu-session','content-type':'application/json'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const payload=req.postDataJSON();calls.push(payload.action);
    let status=503,data={error:'TEMPORARY'};
    if(mode==='invalid'){status=401;data={error:'INVALID_CODE'}}
    if(mode==='valid'&&payload.action==='login'&&payload.code===code){status=200;data={token,level:1}}
    if(mode==='valid'&&payload.action==='verify'&&req.headers()['x-beagu-session']===token){status=200;data={level:1,provisional:false}}
    return route.fulfill({status,headers,body:JSON.stringify(data)});
   }
   return route.abort();
  });
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
  const field=page.locator('.beagu-header-code input'),submit=page.locator('.beagu-header-code button'),feedback=page.locator('.beagu-header-code-feedback');
  await field.waitFor({state:'visible'});
  await field.tap();assert.equal(await field.evaluate(n=>document.activeElement===n),true);
  await field.pressSequentially(code);assert.equal(await field.inputValue(),code);
  await submit.tap();await feedback.waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.beagu-header-code-feedback').textContent.includes('서버 응답이 지연'));
  assert.equal(await page.locator('#beaguLevelState').innerText(),'Lv.0');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('beagu-level-session-v1')),null);
  await page.waitForFunction(()=>!document.querySelector('.beagu-header-code button').disabled);
  mode='invalid';await field.tap();await field.fill(code);await submit.tap();
  await page.waitForFunction(()=>document.querySelector('.beagu-header-code-feedback').textContent.includes('참여코드를 확인'));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('beagu-level-session-v1')),null);
  mode='valid';await field.tap();await field.fill(code);await submit.tap();
  await page.waitForFunction(()=>document.querySelector('#beaguLevelState').textContent==='Lv.1');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('beagu-level-session-v1')),token);
  assert.ok(calls.includes('verify'));
  await page.waitForFunction(()=>document.querySelector('[data-stat="total"]').textContent==='1,000');
  assert.equal(await page.locator('[data-stat="today"]').innerText(),'7');
  assert.equal(await page.evaluate(()=>window.fixtureVisits),2);
  console.log('PASS: WebKit mobile header touch/focus/input, temporary failure, rejected code, server-verified Lv1 and visit recovery');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
