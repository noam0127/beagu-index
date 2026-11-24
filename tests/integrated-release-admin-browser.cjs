/* Actual Chromium integration; all requests intercepted, no deployment or network writes. */
const assert=require("node:assert/strict"),fs=require("node:fs/promises"),{chromium}=require("playwright");
const crypto=require("node:crypto");
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
 try{
  const html=(await fs.readFile("admin-updates.html","utf8")).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<link\b[^>]*>/gi,"");
  const js=await fs.readFile("js/beagu-admin-updates-v1.js","utf8");
  const css=(await fs.readFile("styles/beagu-admin-v1.css","utf8"))+"\n"+(await fs.readFile("styles/beagu-admin-updates-v1.css","utf8"));
  const base="a".repeat(40),candidate="b".repeat(40),id="00000000-0000-0000-0000-000000000001";
  const state={production_sha:base,production_version:"v1.10.0",draft_sha:candidate,draft_version:"v1.10.1",draft_summary:"통합 관제탑 검증"};
  const plan={schema:1,policy:"integrated-review-v1",repository:"noam0127/beagu-index",base_sha:base,candidate_sha:candidate,version:state.draft_version,summary:state.draft_summary,backend_required:true,execution_enabled:false,inventory:[{path:"supabase/migrations/"+("long_path_".repeat(9))+".sql",status:"added",review_kinds:["db_review"],backend:true},{path:"js/fixture.js",status:"modified",review_kinds:["web_review"],backend:false}],required_checks:["backup_review","database_review","pages_verification"],requires_manual_review:true,requires_shared_dependency_review:false};
  const preview={plan,plan_sha256:crypto.createHash("sha256").update(JSON.stringify(plan)).digest("hex"),approved:false,execution_enabled:false};
  const blocked={scope:"isolated_fixture_only",execution_enabled:false,id,base_sha:base,candidate_sha:candidate,plan_sha:preview.plan_sha256,status:"blocked",task_count:5,steps:[{idx:0,task:{op:"backup"},status:"done",evidence:"c".repeat(64)},{idx:1,task:{op:"apply_sql"},status:"blocked"},{idx:2,task:{op:"verify_backend"},status:"pending"},{idx:3,task:{op:"publish_pages"},status:"pending"},{idx:4,task:{op:"verify_live"},status:"pending"}],recovery:[]};
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:"block"});
   const page=await context.newPage(),errors=[],unexpected=[];
   page.on("pageerror",e=>errors.push(e.message));
   const calls=[];
   let server={state:{...state},direct_release_v1:true,direct_candidate_ready:false,direct_candidate_reason:"backend_integrated_required",production_history:[],staging_history:[]};
   let review=preview,job=null,gate=true,hold=null,releaseHold=null,inspectStarted=false;
   const send=(route,data,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
   await context.route("**/*",async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!=="https://fixture.invalid"){unexpected.push(req.url());return route.abort();}
    if(url.pathname==="/admin-updates.html")return route.fulfill({contentType:"text/html",body:html});
    if(url.pathname==="/release-info.json")return send(route,{environment:"production",commit:base,version:"v1.10.0"});
    if(!url.pathname.startsWith("/functions/v1/")||req.method()!=="POST"){unexpected.push(req.url());return route.abort();}
    const p=req.postDataJSON();calls.push(p.action);
    if(req.headers().authorization!=="Bearer fixture")return send(route,{error:"unauthorized"},401);
    if(p.action==="verify")return send(route,{permitted:gate,mfa_verified:gate,role:"owner"});
    if(p.action==="status")return send(route,server);
    if(p.action==="inspect_integrated_plan"){
     assert.equal(p.expected_production_sha,base);
     inspectStarted=true;
     if(hold)await hold;
     return send(route,review);
    }
    if(p.action==="integrated_fixture_status"){
     assert.equal(p.job_id,id);
     return job?send(route,job):send(route,{error:"integrated_fixture_disabled"},409);
    }
    unexpected.push(p.action);return send(route,{error:"unexpected_mutation"},403);
   });
   try{
    await page.goto("https://fixture.invalid/admin-updates.html");
    await page.addStyleTag({content:css});
    await page.evaluate(()=>{window.SUPABASE_URL="https://fixture.invalid";window.SUPABASE_PUBLISHABLE_KEY="fixture";window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:"fixture"}}})}};});
    await page.addScriptTag({content:js});
    const loc=s=>page.locator(s);
    await page.waitForFunction(()=>!document.querySelector("#releaseDashboard").hidden&&!document.querySelector("#integratedInspect").disabled);
    assert.equal(await loc("#releaseProdApply").isDisabled(),true);
    assert.equal(await loc("#integratedApply").isDisabled(),true);
    // Explicit backend reason must override an inconsistent stale ready flag.
    server={...server,direct_candidate_ready:true};
    await loc("#releaseRefresh").click();
    await page.waitForFunction(()=>document.querySelector("#releaseRefresh").disabled===false);
    assert.equal(await loc("#releaseProdApply").isDisabled(),true);
    await loc("#integratedInspect").click();
    await page.waitForFunction(()=>!document.querySelector("#integratedReview").hidden);
    assert.equal(await loc("#integratedDigest").textContent(),preview.plan_sha256);
    assert.match(await loc("#integratedManual").textContent(),/수동 검토/);
    assert.equal(await loc("#integratedFiles li").count(),2);
    await loc("#integratedReview details summary").click();
    assert.equal(await loc("#integratedFiles").isVisible(),true);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    assert.equal(overflow,false,"horizontal page overflow at "+width);
    await loc(".integrated-lookup summary").click();
    await loc("#integratedJobId").fill(id);await loc("#integratedJobLookup").click();
    await page.waitForFunction(()=>document.querySelector("#integratedNotice").textContent.includes("조회 불가"));
    job=blocked;
    await loc("#integratedJobLookup").click();
    await page.waitForFunction(()=>document.querySelector("#integratedProgress").textContent.includes("중단"));
    assert.equal(await loc("#integratedSteps li[data-state=blocked]").count(),2);
    assert.match(await loc("#integratedRecovery").textContent(),/자동 재시도 금지/);
    assert.equal(await loc("#integratedRecoveryApply").isDisabled(),true);
    review={...preview,plan_sha256:"0".repeat(64)};
    await loc("#integratedInspect").click();
    await page.waitForFunction(()=>document.querySelector("#integratedNotice").textContent.includes("명세 조회 실패"));
    assert.equal(await loc("#integratedReview").isVisible(),false);
    // Delayed response from earlier draft must be discarded when refreshed.
    review=preview;inspectStarted=false;hold=new Promise(r=>releaseHold=r);
    await loc("#integratedInspect").click();
    for(let i=0;i<100&&!inspectStarted;i++)await new Promise(r=>setTimeout(r,20));
    assert.equal(inspectStarted,true);
    server={...server,state:{...state,draft_sha:"d".repeat(40)},direct_candidate_ready:false};
    await loc("#releaseRefresh").click();
    await page.waitForFunction(()=>document.querySelector("#integratedCandidate").textContent==="d".repeat(40));
    releaseHold();hold=null;
    await page.waitForLoadState("networkidle");
    assert.equal(await loc("#integratedReview").isVisible(),false);
    assert.equal(await loc("#integratedApply").isDisabled(),true);
    assert.equal(await loc("#integratedRecoveryApply").isDisabled(),true);
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
    assert.ok(calls.includes("integrated_fixture_status"));
    assert.ok(calls.every(a=>["verify","status","inspect_integrated_plan","integrated_fixture_status"].includes(a)));
    console.log("PASS integrated release Chromium viewport="+width+" read-only, blocked, stale, digest, no overflow");
   }finally{if(releaseHold)releaseHold();await context.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
