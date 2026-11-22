#!/usr/bin/env node
"use strict";
// STAGE38: REAL browser, REAL disposable Supabase Auth password/TOTP AAL2.
// Runs only from a local HTTP origin against isolated staging Supabase.
// NOT a hosted-HTTPS browser test; NEVER enter production credentials here.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const {spawn}=require("node:child_process");
const path=require("node:path");
const {chromium}=require("playwright");
const staging="ycwuugggqbunlbwuzvbx";
const production="snvzwrexuqavnfvzgxqj";
const origin="http://127.0.0.1:38738";
const root=path.resolve("_preview_standalone_site");
function base32(secret){
 const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
 let bits=0,n=0;const buf=[];
 for(const c of secret.toUpperCase().replace(/[\s=]/g,"")){
  const v=chars.indexOf(c);if(v<0)throw Error("Invalid MFA base32 seed");
  n=(n<<5)|v;bits+=5;
  if(bits>=8){bits-=8;buf.push((n>>>bits)&255);}
 }
 return Buffer.from(buf);
}
function totp(seed,time=Date.now()){
 const counter=Buffer.alloc(8);
 counter.writeBigUInt64BE(BigInt(Math.floor(time/30000)),0);
 const digest=crypto.createHmac("sha1",base32(seed)).update(counter).digest();
 const off=digest[digest.length-1]&0xf;
 const num=(digest.readUInt32BE(off)&0x7fffffff)%1000000;
 return String(num).padStart(6,"0");
}
async function main(){
 const fixtureFile=process.env.STAGE38_AUTH_FIXTURE_FILE||"";
 assert.ok(fixtureFile,"Staging test account fixture path missing");
 const fixture=JSON.parse(fs.readFileSync(fixtureFile,"utf8"));
 assert.match(fixture.email,/^stage38-browser-\d+-[a-f0-9]{8}@example\.invalid$/);
 assert.ok(fixture.password&&fixture.password.length>=50,"Test password missing");
 assert.ok(fs.existsSync(path.join(root,"index.html")),"Pinned RC offline bundle missing");
 const manifest=JSON.parse(fs.readFileSync(path.join(root,"stage38-release-manifest.json"),"utf8"));
 assert.equal(manifest.source_sha,"5c95aadad971901a8222f83c52e93bf901a3aeb7");
 assert.equal(manifest.supabase_project_ref,staging);
 const server=spawn("python3",["-m","http.server","38738","--bind","127.0.0.1","--directory",root],{stdio:"ignore"});
 let browser=null;
 try{
  let ready=false;
  for(let i=0;i<50;i++){
   try{const res=await fetch(origin+"/admin.html",{signal:AbortSignal.timeout(800)});if(res.ok){ready=true;break;}}
   catch{}
   await new Promise(r=>setTimeout(r,180));
  }
  assert.ok(ready,"Local static review host did not start");
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({serviceWorkers:"block"});
  const page=await context.newPage();
  const forbidden=[],observed=[];
  await context.route("**/*",async route=>{
   const u=route.request().url();let host="";
   try{host=new URL(u).hostname.toLowerCase();}catch{}
   if(["baeguindex.com","www.baeguindex.com",production+".supabase.co"].includes(host)){
    forbidden.push(host);return route.abort();
   }
   if(host===staging+".supabase.co")observed.push(u.includes("/auth/v1/")?"AUTH":"STAGING_API");
   return route.continue();
  });
  const start=await page.goto(origin+"/admin.html",{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(start?.status(),200);
  await page.locator("#adminLogin").waitFor({state:"visible",timeout:18000});
  assert.equal(await page.locator("#adminDashboard").isVisible(),false);
  console.log("PASS: actual pinned RC Chromium login form visible and privileged dashboard hidden");
  await page.locator("#adminEmail").fill(fixture.email);
  await page.locator("#adminPassword").fill(fixture.password);
  await page.locator("#adminLoginForm button[type=submit]").click();
  await page.locator("#adminMfa").waitFor({state:"visible",timeout:25000});
  assert.equal(await page.locator("#adminDashboard").isVisible(),false);
  assert.equal(await page.locator("#adminPassword").inputValue(),"");
  console.log("PASS: actual Chromium password login AAL1 reached MFA-only screen; password cleared");

  const enrollmentRes=page.waitForResponse(res=>
    res.url().includes("/auth/v1/factors") &&
    res.request().method()==="POST" && res.status()===200, {timeout:15000});
  await page.locator("#adminEnroll").click();
  const mfaResponse=await enrollmentRes;
  const payload=await mfaResponse.json();
  const secret=payload?.totp?.secret||"";
  assert.match(secret,/^[A-Z2-7]{16,}$/i,"MFA enrollment response missing secret");
  await page.locator("#adminQrWrap").waitFor({state:"visible",timeout:15000});
  console.log("PASS: actual browser enrolled a staging-only TOTP factor, QR visible");

  const code=totp(secret);
  await page.locator("#adminTotp").fill(code);
  await page.locator("#adminMfaForm button[type=submit]").click();
  let mfaPass=false;
  try{await page.locator("#adminDashboard").waitFor({state:"visible",timeout:14000});mfaPass=true;}
  catch{
    // If the thirty-second TOTP counter changed during the first attempt,
    // generate a new code and retry once, without exposing the seed.
    await page.locator("#adminTotp").fill(totp(secret));
    await page.locator("#adminMfaForm button[type=submit]").click();
    await page.locator("#adminDashboard").waitFor({state:"visible",timeout:17000});
    mfaPass=true;
  }
  assert.equal(mfaPass,true);
  await page.waitForFunction(()=>{
    const s=document.querySelector("#adminDataAsOf")?.textContent||"";
    return s.includes("집계 시각:");
  },null,{timeout:25000});
  const notice=(await page.locator("#adminNotice").innerText()).trim();
  assert.match(notice,/관리자 인증 완료/);
  console.log("PASS: real Chromium TOTP elevated verified AAL2; privileged dashboard and genuine staging metrics rendered");
  const release=await page.goto(origin+"/admin-updates.html",{waitUntil:"domcontentloaded",timeout:30000});
  assert.equal(release?.status(),200);
  await page.locator("#releaseDashboard").waitFor({state:"visible",timeout:24000});
  assert.equal(await page.locator("#releaseLogin").isVisible(),false);
  for(const id of ["releaseStageApply","releaseProdApply","releaseStageRollback","releaseProdRollback"]){
   assert.equal(await page.locator("#"+id).isEnabled(),false,"Unsafe deploy action enabled: "+id);
  }
  console.log("PASS: same actual AAL2 browser session can read isolated release status; deploy/rollback controls disabled");
  assert.deepEqual(forbidden,[],"Production domain requested during Auth UI E2E");
  assert.ok(observed.includes("AUTH")&&observed.includes("STAGING_API"),
    "Real browser Auth and staging-only API calls were not observed");
  console.log("PASS: real browser called isolated staging Auth/API only; zero production requests");
  await context.close();
 }finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
 }
}
main().catch(err=>{
 // Never print any password, OAuth bearer, TOTP seed or access token.
 console.error("FAIL: stage38 browser Auth UI assertion: "+String(err?.message||"test_failed").slice(0,230));
 process.exitCode=1;
});
