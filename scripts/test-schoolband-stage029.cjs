#!/usr/bin/env node
"use strict";
/**
 * Stage029: independent, STATIC preview artifact for public source.
 * No production CNAME, Vercel deployment, GitHub Pages setting changes,
 * copyrighted audio fetches, listening, paid API, or server-score writes.
 *
 * Usage:
 *   node scripts/test-schoolband-stage029.cjs              # build + localhost HTTP probe
 *   node scripts/test-schoolband-stage029.cjs --external   # same + immutable GitHack HTTP probe
 */
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const crypto=require("node:crypto");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,"..");
const GAME_DIR=path.join(ROOT,"games/nangam-schoolband-v08");
const BUILD_DIR=path.join(ROOT,"artifacts/schoolband-stage029/site");
const EXPECTED_REPO="noam0127/beagu-index",EXPECTED_BRANCH="schoolband-playtest";
const ASSETS=[
 {from:"index.html",to:"index.html"},
 {from:"charts/school-homepages.v1.json",to:"charts/school-homepages.v1.json"},
 {from:"preview/index.html",to:"preview/index.html"}
];
const sha256=buffer=>crypto.createHash("sha256").update(buffer).digest("hex");
const validCommit=v=>typeof v==="string"&&/^[0-9a-f]{40}$/.test(v);
function build(){
 if(process.env.GITHUB_REPOSITORY&&process.env.GITHUB_REPOSITORY!==EXPECTED_REPO)throw Error("wrong_repo");
 if(process.env.GITHUB_REF_NAME&&process.env.GITHUB_REF_NAME!==EXPECTED_BRANCH)throw Error("not_test_branch");
 const revision=validCommit(process.env.GITHUB_SHA)?process.env.GITHUB_SHA:null;
 const hashes={};
 fs.mkdirSync(BUILD_DIR,{recursive:true});
 for(const asset of ASSETS){
  const bytes=fs.readFileSync(path.join(GAME_DIR,asset.from));
  const dest=path.join(BUILD_DIR,asset.to);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,bytes);
  hashes[asset.to]={sha256:sha256(bytes),bytes:bytes.length};
 }
 const main=fs.readFileSync(path.join(BUILD_DIR,"index.html"),"utf8");
 const landing=fs.readFileSync(path.join(BUILD_DIR,"preview/index.html"),"utf8");
 const catalog=JSON.parse(fs.readFileSync(path.join(BUILD_DIR,"charts/school-homepages.v1.json"),"utf8"));
 assert(main.includes("난감한 스쿨밴드"),"game title must be present");
 const script=main.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert(script,"game script");new vm.Script(script);
 assert(catalog.count>6000&&catalog.count===Object.keys(catalog.homepages).length,"catalog must be complete");
 assert(landing.includes("href=\"../index.html\"")&&landing.includes("운영 웹과 분리"),"safe preview landing");
 assert(!fs.existsSync(path.join(BUILD_DIR,"CNAME")),"no CNAME allowed in preview");
 assert(!main.includes("const REGISTERED_ANTHEMS=Object.freeze({school"),"no real school-song data");
 assert(main.includes("const REGISTERED_ANTHEMS=Object.freeze({});"),"anthem remains locked");
 const release={
  schema_version:1,product:"nangam-schoolband",stage:"029",mode:"static-test-only",
  source_repository:EXPECTED_REPO,source_branch:EXPECTED_BRANCH,source_commit:revision,
  public_operating_domain_modified:false,production_deployment:false,
  school_anthem_audio_approved:false,live_audio_tested:false,
  source_assets:hashes
 };
 fs.writeFileSync(path.join(BUILD_DIR,"preview-release.json"),JSON.stringify(release,null,2)+"\n");
 fs.writeFileSync(path.join(BUILD_DIR,".nojekyll"),"");
 return release;
}
function serveStatic(){
 const server=http.createServer((req,res)=>{
  const raw=(req.url||"/").split("?")[0];
  let normalized;try{normalized=decodeURIComponent(raw)}catch(_){res.writeHead(400);res.end();return}
  if(!/^\/[a-zA-Z0-9._\/-]*$/.test(normalized)||normalized.includes("..")){
   res.writeHead(400);res.end();return;
  }
  const file=path.join(BUILD_DIR,normalized==="/"?"/preview/index.html":normalized);
  let bytes;try{bytes=fs.readFileSync(file)}catch(_){res.writeHead(404);res.end();return}
  const type=file.endsWith(".html")?"text/html; charset=utf-8":file.endsWith(".json")?"application/json; charset=utf-8":"text/plain; charset=utf-8";
  res.writeHead(200,{"content-type":type,"cache-control":"no-store","x-robots-tag":"noindex"});
  res.end(bytes);
 });
 return server;
}
async function localhostCheck(release){
 const srv=serveStatic();
 await new Promise(resolve=>srv.listen(0,"127.0.0.1",resolve));
 const origin="http://127.0.0.1:"+srv.address().port;
 try{
  for(const entry of ["preview/index.html","index.html","charts/school-homepages.v1.json","preview-release.json"]){
   const response=await fetch(origin+"/"+entry,{signal:AbortSignal.timeout(8000)});
   assert.equal(response.status,200,"localhost HTTP "+entry);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(release.source_assets[entry])assert.equal(sha256(bytes),release.source_assets[entry].sha256,"same source "+entry);
   if(entry.endsWith(".html"))assert.match(response.headers.get("content-type"),/text\/html/);
   if(entry.endsWith(".json"))assert.match(response.headers.get("content-type"),/application\/json/);
  }
  const releaseResponse=await fetch(origin+"/preview-release.json");
  assert.deepEqual((await releaseResponse.json()).source_assets,release.source_assets);
  const missing=await fetch(origin+"/CNAME");assert.equal(missing.status,404,"CNAME MUST NOT be distributed");
  console.log("PASS 029 localhost real HTTP 200, exact SHA256 3 assets, JSON manifest, no CNAME");
 }finally{await new Promise(resolve=>srv.close(resolve))}
}
async function externalProbe(release){
 if(!validCommit(release.source_commit))throw Error("GITHUB_SHA required for external immutable verification");
 const root="https://raw.githack.com/"+EXPECTED_REPO+"/"+release.source_commit+"/games/nangam-schoolband-v08/";
 const checks=[
  ["preview/index.html",release.source_assets["preview/index.html"]],
  ["index.html",release.source_assets["index.html"]],
  ["charts/school-homepages.v1.json",release.source_assets["charts/school-homepages.v1.json"]]
 ];
 const results=[];
 for(const [asset,expected] of checks){
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
   try{
    const r=await fetch(root+asset,{signal:AbortSignal.timeout(12000),redirect:"follow"});
    if(r.status!==200)throw Error("http_"+r.status);
    const type=r.headers.get("content-type")||"";
    if(!type.includes(asset.endsWith(".html")?"text/html":"application/json"))throw Error("unexpected_mime:"+type);
    const bytes=Buffer.from(await r.arrayBuffer());
    if(sha256(bytes)!==expected.sha256)throw Error("wrong_commit_or_stale_cache");
    results.push({path:asset,status:200,sha256:expected.sha256,contentType:type});
    lastError=null;break;
   }catch(e){lastError=e;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,1000*attempt))}
  }
  if(lastError)throw Error("external_preview_failed:"+asset+":"+lastError.message);
 }
 console.log("PASS 029 external GitHack HTTP; exact immutable commit "+release.source_commit);
 console.log(JSON.stringify({preview_url:root+"preview/index.html",source_commit:release.source_commit,files:results}));
}
async function main(){
 const release=build();
 await localhostCheck(release);
 if(process.argv.includes("--external"))await externalProbe(release);
 else console.log("EXTERNAL_HTTP_NOT_CHECKED: --external requires GitHub Actions GITHUB_SHA and internet access");
}
if(require.main===module)main().catch(e=>{console.error("STAGE029_PROBE_FAILED:",e.message);process.exitCode=1});
module.exports={build,localhostCheck,externalProbe,sha256};
