"use strict";
const fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const {instrumentTrustedSource}=require("./replay-engine.cjs");
const {chromium}=require("playwright-core");
const origin="https://run4.invalid",schoolId="0000000",root=__dirname;
const stub="window.supabase={createClient:()=>({from:()=>{const p={then:(a,b)=>Promise.resolve({data:[],count:0,error:null}).then(a,b)};for(const m of ['select','eq','in','limit','range','order','ilike','or','maybeSingle','single','gte','lte','not'])p[m]=()=>p;return p},rpc:async()=>({data:[],error:null})})};";
const config='const SUPABASE_URL="https://run4.invalid";const SUPABASE_PUBLISHABLE_KEY="synthetic-only";const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);';
async function createFactory(){
 const manifest=JSON.parse(await fs.readFile(path.join(root,"artifact.json"),"utf8")),assets=new Map();
 for(const [name,hash] of Object.entries(manifest.files)){
  if(!name.startsWith("game/"))continue;
  const b=await fs.readFile(path.join(root,name));
  if(crypto.createHash("sha256").update(b).digest("hex")!==hash)throw Error("artifact_mismatch");
  assets.set(name.slice(5),b);
 }
 const source=assets.get("teacher-run-4-preview.html");if(!source)throw Error("artifact_missing");
 const trusted=instrumentTrustedSource(source.toString("utf8"));
 let browser=null,launching=null;
 async function getBrowser(){
  if(browser?.isConnected())return browser;
  if(!launching)launching=chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--disable-background-networking"]}).then(b=>browser=b).finally(()=>launching=null);
  return launching;
 }
 async function openTrustedPage(difficulty){
  const b=await getBrowser(),context=await b.newContext({viewport:{width:600,height:800},serviceWorkers:"block",acceptDownloads:false});
  try{
   await context.addInitScript(()=>sessionStorage.setItem("beagu-level-session-v1","a".repeat(64)));
   await context.route("**/*",async route=>{
    const u=new URL(route.request().url()),p=u.pathname.slice(1);
    const json=(v,status=200)=>route.fulfill({status,contentType:"application/json",headers:{"access-control-allow-origin":origin,"access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,OPTIONS"},body:JSON.stringify(v)});
    // No route.continue: all remote requests are intercepted or aborted.
    if(u.hostname==="cdn.jsdelivr.net"&&u.pathname.includes("supabase-js"))return route.fulfill({contentType:"application/javascript",body:stub});
    if(u.origin===origin&&p==="js/supabase-config.js")return route.fulfill({contentType:"application/javascript",body:config});
    if(u.origin===origin||u.hostname.endsWith(".supabase.co")){
     if(route.request().method()==="OPTIONS")return json({},200);
     if(u.pathname.endsWith("/beagu-level-api"))return json({level:1,provisional:false});
     if(u.pathname.endsWith("/arcade-leaderboard")&&u.searchParams.get("school_id")===schoolId)return json({school:{school_id:schoolId,school_name:"Replay",region:"Fixture",eligible:true,difficulty,available_years:[2025],missing_years:[]}});
     if(u.pathname.includes("/functions/v1/"))return json({});
    }
    if(u.origin!==origin)return route.abort();
    if(p==="teacher-run-4-preview.html")return route.fulfill({contentType:"text/html",body:trusted});
    const asset=assets.get(p);if(!asset)return route.abort();
    return route.fulfill({contentType:p.endsWith(".js")?"application/javascript":p.endsWith(".css")?"text/css":"application/octet-stream",body:asset});
   });
   const page=await context.newPage();
   await page.goto(origin+"/teacher-run-4-preview.html?school_id="+schoolId+"&recording=1",{waitUntil:"domcontentloaded",timeout:8000});
   await page.locator("#teacher-run-protected").waitFor({state:"visible",timeout:5000});
   await page.getByRole("button",{name:"▶ 이 학교로 시작",exact:true}).waitFor({timeout:5000});
   return {page,dispose:()=>context.close()};
  }catch(e){await context.close();throw e;}
 }
 return {openTrustedPage,close:async()=>{if(browser)await browser.close();}};
}
module.exports={createFactory};
