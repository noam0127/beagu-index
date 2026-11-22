/* Local-only Chromium UI journeys: never contact real Auth, DB or deployment APIs. */
"use strict";
const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const HOST="http://127.0.0.1:8126";
const API="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/";
const SHAS={live:"a".repeat(40),stage:"b".repeat(40),new:"c".repeat(40)};
const cors={"access-control-allow-origin":"*","access-control-allow-methods":"POST,OPTIONS",
 "access-control-allow-headers":"authorization,apikey,content-type","content-type":"application/json"};
const stub="window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'local-mock'}},error:null})}})}";
const state=(overrides={})=>({production_sha:SHAS.live,production_version:"1.0.1",
 staging_sha:null,staging_version:null,draft_sha:SHAS.new,draft_version:"1.1.0",
 draft_summary:"테스트",...overrides});
const snapshot=(s,extra={})=>({state:s,job:null,head_sha:SHAS.new,
 suggested_draft:null,staging_history:[],production_history:[],...extra});
const asJson=(route,status,value)=>route.fulfill({status,headers:cors,body:JSON.stringify(value)});
async function open(browser,cfg,model){
 const ctx=await browser.newContext({viewport:{width:cfg.width,height:cfg.height},
   isMobile:cfg.mobile,hasTouch:cfg.mobile});
 const page=await ctx.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("dialog",d=>void d.accept());
 await page.route("**/*",route=>{
  const req=route.request(),url=req.url();
  if(url.startsWith(HOST+"/js/beagu-independent-preview-target-v1.js")){
   return route.fulfill({status:200,contentType:"application/javascript",
    body:"window.BEAGU_INDEPENDENT_PREVIEW={origin:"+
      JSON.stringify(model.independentOrigin||"")+"};"});
  }
  if(url.startsWith("https://beagu-v110-sandbox.onrender.com/beagu-preview-health.json")){
   if(model.independentMissing)return asJson(route,404,{error:"not_found"});
   return asJson(route,200,model.independentHealth||{
     schema:1,kind:"standalone-staging",hosting:"independent-static",
     supabase_ref:"ycwuugggqbunlbwuzvbx",staging_sha:SHAS.new
   });
  }
  if(url.startsWith(HOST+"/_preview/beagu-preview-health.json")){
   if(model.previewNotFound)return route.fulfill({status:404,contentType:"text/plain",body:"not found"});
   return asJson(route,200,{schema:1,kind:"staging",
    staging_sha:model.previewSha||SHAS.stage,
    supabase_ref:model.previewRef||"ycwuugggqbunlbwuzvbx"});
  }
  if(url.startsWith(HOST+"/"))return route.continue();
  if(url.startsWith("https://cdn.jsdelivr.net/"))
   return route.fulfill({status:200,contentType:"application/javascript",body:stub});
  if(!url.startsWith(API))return route.abort();
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:cors});
  let input={};try{input=req.postDataJSON()||{}}catch{}
  model.calls.push(input);
  if(url.endsWith("/beagu-admin-access")&&input.action==="verify")
    return asJson(route,200,model.proof);
  if(url.endsWith("/beagu-release-manager-v1")){
   if(input.action==="status"){
    if(model.statusMalformed)return asJson(route,200,{});
    if(model.statusError)return asJson(route,model.statusError,{error: model.statusError===401?
       "admin_mfa_required":"release_service_unavailable"});
    return asJson(route,200,model.current);
   }
   if(input.action==="stage_apply"){
    model.current=snapshot(model.current.state,{job:{status:"queued",version:"1.1.0",
      target:"staging",created_at:"2026-11-23T02:00:00Z"}});
    return asJson(route,202,{queued:true,job_id:"00000000-0000-4000-8000-000000000001"});
   }
   if(input.action==="prod_apply")return asJson(route,409,{error:"ci_attestation_missing"});
  }
  return asJson(route,400,{error:"unexpected_action"});
 });
 await page.goto(HOST+"/admin-updates.html",{waitUntil:"domcontentloaded",timeout:25000});
 return {ctx,page,errors};
}
async function fit(page,width){
 const actual=await page.evaluate(()=>document.documentElement.scrollWidth);
 assert(actual<=width+1,"horizontal overflow at "+width+": "+actual);
 for(const selector of [".release-surface",".release-draft"]){
  const rect=await page.locator(selector).first().boundingBox();
  assert(rect&&rect.x>=-1&&rect.x+rect.width<=width+1,selector+" outside "+width);
 }
}
async function run(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 try{
  for(const cfg of [{name:"desktop",width:1365,height:900,mobile:false},
                    {name:"mobile",width:390,height:844,mobile:true}]){
   // Unauthorized or missing MFA: no privileged release UI or API calls.
   {
    const model={calls:[],proof:{permitted:false,mfa_verified:false,role:"viewer"},
                 current:snapshot(state())};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseLogin").waitFor({state:"visible"});
    assert(await page.locator("#releaseDashboard").isHidden());
    assert.match(await page.locator("#releaseStatus").innerText(),/관리자 인증 필요/);
    assert(!model.calls.some(c=>c.action==="status"||c.action==="stage_apply"));
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   // Authorized owner can queue staging. Production stays unavailable.
   {
    const model={calls:[],proof:{permitted:true,mfa_verified:true,role:"owner"},
                 current:snapshot(state())};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseDashboard").waitFor({state:"visible"});
    await fit(page,cfg.width);
    assert(await page.locator("#releaseStageApply").isEnabled());
    assert(await page.locator("#releaseProdApply").isDisabled());
    assert(await page.locator("#releaseProdRollback").isDisabled());
    assert(await page.locator("#releaseRegister").isEnabled());
    assert.equal(await page.locator("#releaseStageLink").getAttribute("href"),null);
    assert.equal(await page.locator("#releaseStageLink").getAttribute("aria-disabled"),"true");
    assert.match(await page.locator("#releaseStageLinkLabel").innerText(),/시험 웹 미배포/);
    await page.locator("#releaseStageApply").click();
    await page.getByText(/배포 요청 등록 완료/).waitFor();
    await page.locator("#releaseQueueText").getByText(/배포 대기/).waitFor();
    assert(await page.locator("#releaseStageApply").isDisabled());
    assert(await page.locator("#releaseProdApply").isDisabled());
    assert(await page.locator("#releaseRegister").isDisabled());
    assert.equal(model.calls.filter(c=>c.action==="stage_apply").length,1);
    assert.equal(model.calls.filter(c=>c.action==="prod_apply").length,0);
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   // Existing staging does not authorize production without SHA-bound CI.
   {
    const hostile='<img src=x onerror="window.__releaseXss=1">';
    const model={calls:[],proof:{permitted:true,mfa_verified:true,role:"owner"},
       current:snapshot(state({staging_sha:SHAS.stage,staging_version:"1.1.0",draft_sha:SHAS.stage}),{
        staging_history:[{version:"1.1.0",action:"stage_apply",summary:hostile,
          from_sha:SHAS.live,to_sha:SHAS.stage,deployed_at:"2026-11-23T02:00:00Z"}]
       })};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseDashboard").waitFor({state:"visible"});
    await fit(page,cfg.width);
    await page.locator("#releaseStageHealth").getByText(/게시 확인 완료/).waitFor();
    assert(await page.locator("#releaseProdApply").isEnabled());
    assert(await page.locator("#releaseStageApply").isDisabled());
    assert.equal(await page.locator("#releaseStageLink").getAttribute("href"),"https://baeguindex.com/_preview/");
    assert.equal(await page.locator("#releaseStageLink").getAttribute("aria-disabled"),null);
    assert.equal(await page.locator("#releaseStageHistory img").count(),0);
    assert.equal(await page.evaluate(()=>Boolean(window.__releaseXss)),false);
    await page.locator("#releaseProdApply").click();
    await page.getByText(/3개 독립 자동시험 결과가 아직 없습니다/).waitFor();
    assert(!((await page.locator("#releaseStatus").innerText()).includes("배포 요청 등록 완료")));
    const attempts=model.calls.filter(c=>c.action==="prod_apply");
    assert.equal(attempts.length,1);
    assert.equal(attempts[0].confirmed_tested,true);
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   // A staging SHA in admin DB never proves the site is actually published.
   // HTTP 404, wrong SHA or wrong backend must keep the link and production locked.
   for(const defect of [
     {name:"missing-preview",previewNotFound:true},
     {name:"different-code",previewSha:SHAS.new},
     {name:"production-backend-leak",previewRef:"snvzwrexuqavnfvzgxqj"}
   ]){
    const model={calls:[],proof:{permitted:true,mfa_verified:true,role:"owner"},
      current:snapshot(state({staging_sha:SHAS.stage,staging_version:"1.1.0",
                              draft_sha:SHAS.stage})),...defect};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseDashboard").waitFor({state:"visible"});
    await page.locator("#releaseStageLinkLabel").getByText(/게시 확인 실패/).waitFor();
    assert.match(await page.locator("#releaseStageHealth").innerText(),/배포 기록과 실제 게시 상태를 점검/);
    assert.equal(await page.locator("#releaseStageLink").getAttribute("href"),null,
      defect.name+" must not open stale/missing preview");
    assert.equal(await page.locator("#releaseStageLink").getAttribute("aria-disabled"),"true");
    assert(await page.locator("#releaseProdApply").isDisabled(),
      defect.name+" must not allow production request");
    assert(!model.calls.some(c=>c.action==="prod_apply"));
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   // A previously authorized page must lock every mutation when refresh fails.
   // A later successful refresh restores the controls and connected indicator.
   {
    const model={calls:[],proof:{permitted:true,mfa_verified:true,role:"owner"},
                 current:snapshot(state()),statusError:null};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseDashboard").waitFor({state:"visible"});
    assert(await page.locator("#releaseStageApply").isEnabled());
    model.statusError=503;
    await page.locator("#releaseRefresh").click();
    await page.getByText(/안전을 위해 배포 버튼을 잠갔습니다/).waitFor();
    for(const id of ["releaseStageApply","releaseStageRollback","releaseProdApply",
                     "releaseProdRollback","releaseRegister"])
      assert(await page.locator("#"+id).isDisabled(),id+" should be locked");
    assert(await page.locator("#releaseRefresh").isEnabled());
    const n=model.calls.length;
    await page.locator("#releaseStageApply").evaluate(button=>button.click());
    assert.equal(model.calls.length,n,"stale-state attempts must never reach the API");
    model.statusError=null;
    await page.locator("#releaseRefresh").click();
    await page.getByText(/업데이트 관리 연결 완료/).waitFor();
    assert(await page.locator("#releaseStageApply").isEnabled());
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   // Even the very first status request can fail. Owner can retry, never deploy.
   {
    const model={calls:[],proof:{permitted:true,mfa_verified:true,role:"owner"},
                 current:snapshot(state()),statusError:503};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseDashboard").waitFor({state:"visible"});
    await page.getByText(/안전을 위해 배포 버튼을 잠갔습니다/).waitFor();
    assert(await page.locator("#releaseStageApply").isDisabled());
    assert(await page.locator("#releaseRegister").isDisabled());
    assert(await page.locator("#releaseRefresh").isEnabled());
    model.statusError=null;
    await page.locator("#releaseRefresh").click();
    await page.getByText(/업데이트 관리 연결 완료/).waitFor();
    assert(await page.locator("#releaseStageApply").isEnabled());
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   // A malformed success response must not pass as a verified release state.
   {
    const model={calls:[],proof:{permitted:true,mfa_verified:true,role:"owner"},
                 current:snapshot(state()),statusMalformed:false};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseDashboard").waitFor({state:"visible"});
    model.statusMalformed=true;
    await page.locator("#releaseRefresh").click();
    await page.getByText(/응답 형식이 올바르지 않습니다/).waitFor();
    assert(await page.locator("#releaseStageApply").isDisabled());
    assert(await page.locator("#releaseRegister").isDisabled());
    model.statusMalformed=false;
    await page.locator("#releaseRefresh").click();
    await page.getByText(/업데이트 관리 연결 완료/).waitFor();
    assert(await page.locator("#releaseStageApply").isEnabled());
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   // Server-side owner/MFA revocation hides privileged controls immediately.
   {
    const model={calls:[],proof:{permitted:true,mfa_verified:true,role:"owner"},
                 current:snapshot(state()),statusError:null};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseDashboard").waitFor({state:"visible"});
    model.statusError=401;
    await page.locator("#releaseRefresh").click();
    await page.locator("#releaseLogin").waitFor({state:"visible"});
    assert(await page.locator("#releaseDashboard").isHidden());
    assert.match(await page.locator("#releaseStatus").innerText(),/관리자 인증 필요/);
    assert(!model.calls.some(c=>c.action==="stage_apply"||c.action==="prod_apply"));
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   // Render sandbox is read-only and must never imply production deployment rights.
   {
    const model={calls:[],proof:{permitted:true,mfa_verified:true,role:"owner"},
      current:snapshot(state()),independentOrigin:"https://beagu-v110-sandbox.onrender.com"};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseDashboard").waitFor({state:"visible"});
    await page.locator("#releaseIndependentStatus")
      .getByText(/독립 호스팅 게시 확인/).waitFor();
    assert.equal(await page.locator("#releaseIndependentLink").getAttribute("href"),
      "https://beagu-v110-sandbox.onrender.com/");
    assert.equal(await page.locator("#releaseIndependentLink").getAttribute("aria-disabled"),null);
    assert.match(await page.locator("#releaseIndependentStatus").innerText(),
      /운영 배포 승인은 별도/);
    assert(await page.locator("#releaseProdApply").isDisabled(),
      "Read-only Render sandbox must never unlock production");
    assert(!model.calls.some(x=>x.action==="prod_apply"));
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   for(const defect of [
     {independentMissing:true},
     {independentHealth:{schema:1,kind:"staging",hosting:"independent-static",
       supabase_ref:"ycwuugggqbunlbwuzvbx",staging_sha:SHAS.new}},
     {independentHealth:{schema:1,kind:"standalone-staging",hosting:"independent-static",
       supabase_ref:"snvzwrexuqavnfvzgxqj",staging_sha:SHAS.new}},
     {independentHealth:{schema:1,kind:"standalone-staging",hosting:"independent-static",
       supabase_ref:"ycwuugggqbunlbwuzvbx",staging_sha:"invalid"}}
   ]){
    const model={calls:[],proof:{permitted:true,mfa_verified:true,role:"owner"},
      current:snapshot(state()),independentOrigin:"https://beagu-v110-sandbox.onrender.com",
      ...defect};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseIndependentLink")
      .getByText(/독립 시험 웹 게시 확인 실패/).waitFor();
    assert.equal(await page.locator("#releaseIndependentLink").getAttribute("href"),null);
    assert(await page.locator("#releaseProdApply").isDisabled());
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   // Only an explicitly configured Render subdomain can be probed.
   for(const badHost of ["https://baeguindex.com",
                         "https://beagu-v110-sandbox.onrender.com.evil.com",
                         "http://beagu-v110-sandbox.onrender.com",
                         "https://beagu-v110-sandbox.onrender.com/path"]){
    const model={calls:[],proof:{permitted:true,mfa_verified:true,role:"owner"},
      current:snapshot(state()),independentOrigin:badHost};
    const {ctx,page,errors}=await open(browser,cfg,model);
    await page.locator("#releaseIndependentLink")
      .getByText(/독립 시험 웹 미연결/).waitFor();
    assert.equal(await page.locator("#releaseIndependentLink").getAttribute("href"),null);
    assert(await page.locator("#releaseProdApply").isDisabled());
    assert.deepEqual(errors,[]);
    await ctx.close();
   }
   console.log("PASS "+cfg.name+": auth, stage queue, CI denial, XSS and layout");
  }
  console.log("PASS: privileged network intercepted, production unchanged");
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1});
