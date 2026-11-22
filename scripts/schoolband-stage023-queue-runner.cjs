#!/usr/bin/env node
"use strict";
// 023: read-only queue inspection and in-memory withdrawal/denial simulations.
// No actual publication, release deployment, account connection or audio evaluation.
const fs=require("node:fs"),path=require("node:path");
const Q=require("./schoolband-stage023-queue.cjs");
const I=require("./schoolband-stage022-intake.cjs");
const ROOT=path.resolve(__dirname,"..");
const DIR=path.join(ROOT,"games/nangam-schoolband-v08/charts");
function load(){
 const registry=JSON.parse(fs.readFileSync(path.join(DIR,"song-intake-rights.v1.json"),"utf8"));
 const queue=JSON.parse(fs.readFileSync(path.join(DIR,"song-queue-stage023.v1.json"),"utf8"));
 const result=Q.validateQueue(queue,registry);
 for(const song of queue.records){
  const entry=registry.records.find(x=>x.song_id===song.song_id);
  if(!entry)throw Error("missing_trusted_entry");
  const actual=I.gitBlobSha1(I.readTrustedSource(entry.source_path));
  if(actual!==song.source_sha||actual!==entry.source_git_blob_sha1)throw Error("source_file_changed");
 }
 const html=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
 const original=queue.records.find(x=>x.song_id==="original-shining-our-school");
 if(!original||!html.includes('const CHART_SONG_ID="original-shining-our-school";')||
    !html.includes('const CHART_VERSION="creative-anthem-rhythm-v1.0.0";')||
    original.chart_id!=="creative-anthem-rhythm-v1.0.0")throw Error("embedded_original_chart_mismatch");
 return {registry,queue,result};
}
function simulate(action,songId,date="2026-11-23"){
 const {registry,queue}=load();
 const entry=queue.records.find(x=>x.song_id===songId);
 if(!entry)throw Error("song_not_registered");
 const next=Q.advance(entry,action,registry,date);
 const updated={...queue,records:queue.records.map(x=>x.song_id===songId?next:x)};
 const verdict=Q.validateQueue(updated,registry);
 const fallback=Q.resolvePlaytestSong(updated,registry,"1234567","anthem");
 return {action,from:entry.stage,to:next.stage,songId,queue:verdict,
  fallback,notPublishedToOperatingSite:true};
}
if(require.main===module){
 try{
  const [mode,id,date]=process.argv.slice(2);
  if(mode==="--verify"&&process.argv.length===3){
   const r=load();console.log(JSON.stringify({status:"verified_locally",queue:r.result,
    selectedSchoolAnthem:Q.resolvePlaytestSong(r.queue,r.registry,"1234567","anthem")}));
  }else if(mode==="--simulate-withdraw"&&id&&process.argv.length<=5){
   console.log(JSON.stringify(simulate("withdraw",id,date)));
  }else throw Error("usage: --verify OR --simulate-withdraw <registered-song-id> [YYYY-MM-DD]");
 }catch(e){console.error("STAGE023_REJECTED: "+String(e.code||e.message));process.exitCode=1}
}
module.exports={load,simulate};
