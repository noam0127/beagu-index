/* Vercel-free static staging smoke: no external network requests are sent.
 * DOM, navigation controls, content isolation and home/search/challenge paths
 * are exercised in Chromium for mobile and desktop.
 */
"use strict";
const assert=require("node:assert/strict");
const {chromium}=require("playwright");

const ORIGIN="http://127.0.0.1:8132";
const LIVE_HOSTS=new Set([
  "baeguindex.com","www.baeguindex.com",
  "snvzwrexuqavnfvzgxqj.supabase.co"
]);
const PAGES=[
  {path:"/",title:"배구"},
  {path:"/search.html",title:"학교"},
  {path:"/challenge.html",title:"참여"},
  {path:"/statistics.html",title:"학교"},
  {path:"/school-report.html",title:"학교"},
  {path:"/admin-updates.html",title:"업데이트"}
];
const viewports=[
  {name:"desktop",width:1366,height:900,mobile:false},
  {name:"mobile",width:390,height:844,mobile:true}
];
async function main(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 try{
  for(const viewport of viewports){
   const context=await browser.newContext({
     viewport:{width:viewport.width,height:viewport.height},
     isMobile:viewport.mobile,hasTouch:viewport.mobile,serviceWorkers:"block"
   });
   const forbidden=[];
   const attempted=[];
   await context.route("**/*",route=>{
     const url=route.request().url();
     if(url.startsWith(ORIGIN+"/"))return route.continue();
     let parsed;try{parsed=new URL(url)}catch{return route.abort();}
     attempted.push({host:parsed.hostname,method:route.request().method()});
     if(LIVE_HOSTS.has(parsed.hostname)){
       forbidden.push({host:parsed.hostname,path:parsed.pathname,
                       method:route.request().method()});
     }
     // No third-party calls of any kind, including the test database.
     return route.abort();
   });
   for(const item of PAGES){
    const page=await context.newPage();
    try{
     const response=await page.goto(ORIGIN+item.path,{
       waitUntil:"domcontentloaded",timeout:30000
     });
     assert(response && response.status()===200,
       item.path+" must return an actual HTML page (not an SPA fallback)");
     const title=await page.title();
     assert(title.includes(item.title),item.path+" page title mismatch: "+title);
     if(item.path==="/admin-updates.html"){
       const visible=await page.locator("h1").innerText();
       assert.match(visible,/업데이트 관리 · 읽기 전용/);
       for(const selector of [
         "#releaseStageApply","#releaseProdApply","#releaseProdRollback",
         "#releaseRegister","#releaseDraftForm"
       ])assert.equal(await page.locator(selector).count(),0,
         selector+" must not appear in independently hosted staging");
       assert.equal(await page.locator("script[src*='beagu-admin-updates-v1']").count(),0);
       const networkBefore=attempted.length;
       const blockedStageRelease=await page.evaluate(async ()=>{
         const endpoint="https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/beagu-release-manager-v1";
         const result={};
         try{
           await fetch(endpoint,{method:"POST",body:'{"action":"prod_apply"}'});
           result.fetch=false;
         }catch(err){result.fetch=err instanceof TypeError;}
         try{
           const xhr=new XMLHttpRequest();xhr.open("POST",endpoint);
           result.xhr=false;
         }catch(err){result.xhr=err?.name==="SecurityError";}
         result.beacon=navigator.sendBeacon(endpoint,"{}")===false;
         return result;
       });
       assert.deepEqual(blockedStageRelease,{fetch:true,xhr:true,beacon:true},
         "Staging release-manager endpoint must remain uncallable");
       assert.equal(attempted.length,networkBefore,
         "Staging release-manager requests must be rejected before network");
     }
     await page.locator("#beagu-staging-watermark").waitFor({
       state:"visible",timeout:15000
     });
     const robots=await page.locator('meta[name="robots"]').all();
     assert(robots.length>=1,item.path+" must prohibit indexing");
     assert((await page.locator('meta[name="robots"]').first().getAttribute("content"))
       .includes("noindex"),item.path+" noindex missing");
     const inStage=await page.evaluate(()=>{
       const a=document.createElement("a");
       a.textContent="unsafe live link";
       a.href="https://baeguindex.com/challenge.html";
       document.body.append(a);
       const before=location.href;
       a.click();
       const banner=document.getElementById("beagu-staging-navigation-warning");
       return {before,after:location.href,notice:banner?.textContent??""};
     });
     assert.equal(inStage.before,inStage.after,
       "Production navigation must be suppressed: "+item.path);
     assert.match(inStage.notice,/운영 웹·운영 DB 접근이 차단됩니다/);
     const prevented=await page.evaluate(()=>{
       const form=document.createElement("form");
       form.action="https://baeguindex.com/survey.html";
       document.body.append(form);
       const event=new Event("submit",{bubbles:true,cancelable:true});
       const result=form.dispatchEvent(event);
       return {result,prevented:event.defaultPrevented};
     });
     assert.equal(prevented.result,false,"Prod form dispatch was not prevented");
     assert.equal(prevented.prevented,true);
     // Navigation-only filtering is insufficient: exercise JavaScript APIs
     // that can issue direct production requests or submit forms without events.
     const blocked=await page.evaluate(async ()=>{
       const out={};
       const prod="https://baeguindex.com";
       const otherSupabase="https://different-project.supabase.co";
       try {
         await fetch(prod+"/challenge.html",{method:"POST",body:"mock"});
         out.fetch=false;
       } catch(e) {
         out.fetch=e instanceof TypeError;
       }
       try {
         const xhr=new XMLHttpRequest();
         xhr.open("POST",prod+"/api/not-allowed");
         out.xhr=false;
       } catch(e) {
         out.xhr=e?.name==="SecurityError";
       }
       out.beacon=navigator.sendBeacon(prod+"/record","mock")===false;
       out.popup=window.open(prod+"/challenge.html","_blank")===null;
       const form=document.createElement("form");
       form.action=prod+"/survey.html";
       document.body.append(form);
       try {
         form.submit();
         out.directSubmit=false;
       }catch(e){
         out.directSubmit=e?.name==="SecurityError";
       }
       try {
         new WebSocket("wss://different-project.supabase.co/realtime/v1/websocket");
         out.websocket=false;
       }catch(e) {
         out.websocket=e?.name==="SecurityError";
       }
       try {
         new EventSource(otherSupabase+"/rest/v1/private");
         out.eventsource=false;
       }catch(e) {
         out.eventsource=e?.name==="SecurityError";
       }
       return out;
     });
     assert.deepEqual(blocked,{
       fetch:true,xhr:true,beacon:true,popup:true,
       directSubmit:true,websocket:true,eventsource:true
     },"Runtime network guard failure in "+viewport.name+" "+item.path);
     assert.equal(await page.evaluate(()=>document.querySelector(
       'script[src="/beagu-staging-navigation-guard.js"]')!==null),true);
     assert.equal(await page.locator("body").isVisible(),true);
     console.log("PASS "+viewport.name+" "+item.path+
       " title, watermark, robots, prod navigation/form blocked");
    }finally{await page.close();}
   }
   assert.deepEqual(forbidden,[],
     "A preview document requested a production host: "+JSON.stringify(forbidden));
   assert(attempted.every(x=>!LIVE_HOSTS.has(x.host)));
   console.log("PASS "+viewport.name+": no live API or production host requested; "+
     attempted.length+" external requests blocked");
   await context.close();
  }
  console.log("PASS: Vercel-free offline Chromium smoke, no site or DB deployments");
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
