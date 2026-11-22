#!/usr/bin/env node
"use strict";
// REAL external Chromium smoke of three immutable commits published to an
// isolated static-only Git branch (initial A, update B, rollback A).
// NO Auth, MFA, Supabase, Vercel, GitHub Pages or production deployment.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {chromium}=require("playwright");

const proof=JSON.parse(fs.readFileSync(
  process.env.STAGE38_LIFECYCLE_PROOF||"/tmp/stage38-lifecycle-proof.json","utf8"));
assert.equal(proof.kind,"isolated-static-file-deploy-rollback");
assert.equal(proof.rollback_tree_matches_initial,true);
assert.equal(proof.login_enabled,false);
assert.equal(proof.production_site_touched,false);
assert.equal(proof.supabase_touched,false);
assert.equal(proof.source_rc,"5c95aadad971901a8222f83c52e93bf901a3aeb7");
const shas=[proof.first_deploy_sha,proof.update_sha,proof.rollback_sha];
assert.equal(new Set(shas).size,3);
const base="https://raw.githack.com/noam0127/beagu-index/";
const restricted=new Set([
  "baeguindex.com","www.baeguindex.com",
  "snvzwrexuqavnfvzgxqj.supabase.co",
  "ycwuugggqbunlbwuzvbx.supabase.co",
]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitUntilHosted(url) {
  let last="";
  for(let i=0;i<25;i++){
    try{
      const res=await fetch(url,{signal:AbortSignal.timeout(15000)});
      if(res.status===200) return;
      last=String(res.status);
    }catch(err){last=err.message?.slice(0,90)||"network failure";}
    await sleep(3000);
  }
  throw Error("Not published on external static host: "+url+" ("+last+")");
}
async function run(){
  for(const sha of shas){
    await waitUntilHosted(base+sha+"/stage38-lifecycle-check.html");
  }
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const blockedAttempts=[];
  try{
    const ctx=await browser.newContext({serviceWorkers:"block"});
    // Provider's documented automation-only first-visit notice preference.
    await ctx.addCookies([{
      name:"__Http-phish", value:"1", domain:"raw.githack.com",
      path:"/", secure:true, httpOnly:true, sameSite:"Lax",
    }]);
    await ctx.route("**/*",async route=>{
      let host="";
      try{host=new URL(route.request().url()).hostname.toLowerCase();}catch{}
      if(restricted.has(host)){
        blockedAttempts.push(host);
        return route.abort();
      }
      return route.continue();
    });
    for(let i=0;i<shas.length;i++){
      const version=i===1?"B":"A";
      const url=base+shas[i]+"/stage38-lifecycle-check.html";
      const page=await ctx.newPage();
      const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
      assert.equal(response?.status(),200,"Published HTML cannot be loaded");
      assert.equal(new URL(page.url()).origin,new URL(base).origin);
      await page.locator("#stage38-lifecycle-version").waitFor({
        state:"visible",timeout:12000,
      });
      assert.equal((await page.locator("#stage38-lifecycle-version").innerText()).trim(),
        "SANDBOX-"+version);
      const policies=await page.locator('meta[http-equiv="Content-Security-Policy"]')
        .evaluateAll(nodes=>nodes.map(n=>n.content).join(" | "));
      assert.match(policies,/connect-src 'none'/);
      assert.match(policies,/form-action 'none'/);
      assert.equal(await page.locator('input[type="password"],input[type="email"]').count(),0);
      console.log("PASS: remote HEADLESS CHROMIUM " +
        (i===0?"initial file deploy":i===1?"file update":"file rollback") +
        " rendered SANDBOX-"+version+" at commit "+shas[i].slice(0,12));
      await page.close();
    }
    const page=await ctx.newPage();
    const indexUrl=base+proof.rollback_sha+"/index.html";
    const response=await page.goto(indexUrl,{
      waitUntil:"domcontentloaded",timeout:45000,
    });
    assert.equal(response?.status(),200);
    await page.locator("#stage38-public-static-warning")
      .waitFor({state:"visible",timeout:18000});
    const policy=await page.locator('meta[http-equiv="Content-Security-Policy"]')
      .evaluateAll(nodes=>nodes.map(n=>n.content).join(" | "));
    assert.match(policy,/connect-src 'none'/);
    assert.match(policy,/form-action 'none'/);
    assert.equal(await page.locator('input[type="password"]:not([disabled])').count(),0);
    console.log("PASS: rolled-back pinned RC homepage still displays credential warning and blocks API/forms");
    await ctx.close();
    assert.deepEqual(blockedAttempts,[],
      "External static branch attempted production or staging API calls");
    console.log("PASS: zero production/staging Supabase network requests");
    console.log("LIMITATION: this validates real static-file release/rollback, NOT a live operational site or MFA host");
  }finally{await browser.close();}
}
run().catch(e=>{
  console.error("FAIL: "+(e.message||"stage38 lifecycle test failed"));
  process.exitCode=1;
});
