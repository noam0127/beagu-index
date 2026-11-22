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
     assert.match(inStage.notice,/운영 웹 링크로 이동하지 않습니다/);
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
