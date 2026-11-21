#!/usr/bin/env node
/**
 * Browser QA for an immutable candidate served on LOOPBACK ONLY.
 * Cloud/CDN/Supabase requests are blocked at browser routing before egress.
 * This is a STATIC browser smoke check, NOT login/RLS/real-API E2E.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");

const SHA=/^[a-f0-9]{40}$/;
const ORIGIN=process.env.BEAGU_QA_ORIGIN||"http://127.0.0.1:8134";
const DIRECTORY=process.env.BEAGU_QA_SITE_DIR;
const EXPECTED=process.env.BEAGU_QA_CANDIDATE_SHA;
const EVIDENCE_DIR=process.env.BEAGU_QA_EVIDENCE_DIR;
const LIVE="snvzwrexuqavnfvzgxqj",STAGE="ycwuugggqbunlbwuzvbx";
if(!DIRECTORY||!EVIDENCE_DIR||!SHA.test(EXPECTED||""))throw Error("Candidate SHA, site dir and evidence dir required");
const uri=new URL(ORIGIN);
if(!["127.0.0.1","localhost","[::1]"].includes(uri.hostname)||uri.protocol!=="http:")
 throw Error("Only loopback browser QA allowed");
const manifest=JSON.parse(fs.readFileSync(path.join(DIRECTORY,".qa-candidate-manifest.json"),"utf8"));
assert.equal(manifest.candidate_sha,EXPECTED);
assert.equal(manifest.publicly_hosted,false);
assert.equal(manifest.site_deployed,false);
assert.equal(manifest.production_supabase_allowed,false);
assert.equal(manifest.final_release_gate,"blocked");

const pages=["/index.html","/challenge.html","/admin-updates.html","/search-lv1.html","/statistics.html"];
const dimensions=[
 {name:"desktop",viewport:{width:1365,height:900},isMobile:false},
 {name:"mobile",viewport:{width:390,height:844},isMobile:true}
];
const tested=[],blockedExternal=new Map(),errors=[],violations=[];
const checkOrigin=requestUrl=>{
 const parsed=new URL(requestUrl);
 return parsed.protocol==="http:"&&
  parsed.hostname===uri.hostname&&
  parsed.port===uri.port;
};
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 try{
  for(const d of dimensions){
   const context=await browser.newContext({
    viewport:d.viewport,
    isMobile:d.isMobile,
    deviceScaleFactor:d.isMobile?2:1,
    serviceWorkers:"block",
    acceptDownloads:false,
    ignoreHTTPSErrors:false
   });
   await context.route("**/*",route=>{
    const target=route.request().url();
    let allow=false;
    try{allow=checkOrigin(target)}catch{}
    if(allow)return route.continue();
    let domain="invalid-or-special";
    try{domain=new URL(target).hostname||"special"}catch{}
    blockedExternal.set(domain,(blockedExternal.get(domain)||0)+1);
    if(target.includes(LIVE)||target.includes("baeguindex.com"))
      violations.push("A production-domain request attempted from candidate browser");
    // Block ALL remote traffic, including third-party CDN scripts and test DB.
    // No request writes to either Supabase project.
    return route.abort();
   });
   for(const routePath of pages){
    const page=await context.newPage();
    page.on("pageerror",err=>{
      if(errors.length<12)errors.push({page:routePath,device:d.name,message:String(err?.message||err).slice(0,160)});
    });
    const response=await page.goto(ORIGIN+routePath,{waitUntil:"domcontentloaded",timeout:20000});
    assert.ok(response,"No local page response "+routePath);
    assert.equal(response.status(),200,routePath);
    const observed=await page.evaluate(()=>{
      const meta=document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return {
       title:document.title,
       qaBadges:document.querySelectorAll("#beagu-isolated-qa").length,
       robots:document.querySelector('meta[name="robots"]')?.content||"",
       csp:meta?.content||"",
       textLength:document.body?.innerText?.length||0,
       links:document.querySelectorAll("a[href]").length,
       formCount:document.querySelectorAll("form").length
      };
    });
    assert.ok(observed.title.length>=2,routePath+" missing title");
    assert.equal(observed.qaBadges,1,routePath+" no QA badge");
    assert.match(observed.robots,/noindex,nofollow,noarchive/);
    assert.ok(observed.csp.includes("https://"+STAGE+".supabase.co"),routePath+" missing staging CSP");
    assert.ok(observed.csp.includes("form-action 'none'"),routePath+" unsafe forms");
    assert.ok(observed.csp.includes("object-src 'none'"));
    assert.ok(observed.textLength>75,routePath+" empty body");
    assert.ok(observed.links>=1,routePath+" no navigation");
    tested.push({page:routePath,device:d.name,status:response.status(),qa_badge:true});
    await page.close();
   }
   await context.close();
  }
 } finally{
  await browser.close();
 }
 assert.deepEqual(violations,[],"Production network attempt detected");
 const result={
  schema_version:1,
  candidate_sha:EXPECTED,
  status:"local_browser_static_smoke_passed",
  browser:"Chromium",
  checked_viewports:dimensions.map(d=>d.name),
  checked_pages:tested,
  local_http_checks:tested.length,
  remote_network_policy:"abort_all",
  remote_request_domains_blocked:[...blockedExternal.entries()].map(([domain,count])=>({domain,count})),
  browser_console_error_count:errors.length,
  browser_console_error_samples:errors,
  prod_supabase_requested:false,
  test_supabase_requested_and_blocked:blockedExternal.has(STAGE+".supabase.co"),
  account_auth_e2e:"not_performed",
  sandbox_rls_e2e:"not_performed",
  browser_functional_e2e:"not_performed",
  public_url_created:false,
  qa_hosting_configured:false,
  release_gate:"blocked"
 };
 fs.mkdirSync(EVIDENCE_DIR,{recursive:true});
 fs.writeFileSync(path.join(EVIDENCE_DIR,"browser-manifest.json"),JSON.stringify(result,null,2)+"\n");
 process.stdout.write("PASS: real Chromium local-only browser smoke, "+tested.length+" page/viewport pairs; no external writes\n");
})().catch(err=>{
 console.error("QA browser smoke failed:",err?.stack||err);
 process.exitCode=1;
});
