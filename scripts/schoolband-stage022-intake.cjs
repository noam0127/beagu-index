#!/usr/bin/env node
"use strict";
/**
 * Stage 022 local, no-network intake and optional PRIVATE chart generation.
 * There is deliberately NO permission request, upload, or public release route.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const policy=require("./schoolband-rights-policy-v1.cjs");
const ROOT=path.resolve(__dirname,"..");
const CHARTS=path.join(ROOT,"games/nangam-schoolband-v08/charts");
const TRUST_FILE=path.join(CHARTS,"song-intake-rights.v1.json");
function gitBlobSha1(buffer){
 return crypto.createHash("sha1").update("blob "+buffer.length+"\0").update(buffer).digest("hex");
}
function readTrustedSource(sourcePath){
 if(typeof sourcePath!=="string"||!/^games\/nangam-schoolband-v08\/charts\/[A-Za-z0-9._-]+$/.test(sourcePath)){
  throw Error("source_path_disallowed");
 }
 const full=path.join(ROOT,sourcePath);
 const real=fs.realpathSync(full),root=fs.realpathSync(CHARTS);
 if(!real.startsWith(root+path.sep))throw Error("source_outside_trusted_chart_directory");
 const stat=fs.statSync(real);
 if(!stat.isFile()||stat.size<1||stat.size>600000)throw Error("source_size_or_type_invalid");
 return fs.readFileSync(real);
}
function validateSourceFormat(buffer,kind,sourcePath){
 const lower=sourcePath.toLowerCase();
 if(kind==="events_json"){
  if(!lower.endsWith(".json"))throw Error("events_json_extension_required");
  try{JSON.parse(buffer.toString("utf8"));}catch(_){throw Error("invalid_music_events_json");}
 }else if(kind==="midi"){
  if(!/\\.midi?$/.test(lower)||buffer.length<14||buffer.subarray(0,4).toString("ascii")!=="MThd"||
     buffer.readUInt32BE(4)!==6)throw Error("invalid_midi_header");
 }else if(kind==="musicxml"){
  const head=buffer.subarray(0,4096).toString("utf8");
  if(!/\\.(?:musicxml|xml)$/.test(lower)||!/<score-(?:partwise|timewise)\\b/.test(head)||
     /<!DOCTYPE|<!ENTITY/i.test(head))throw Error("invalid_musicxml_header");
 }else if(kind==="score_pdf"){
  if(!lower.endsWith(".pdf")||buffer.subarray(0,5).toString("ascii")!=="%PDF-")throw Error("invalid_score_pdf_header");
 }else throw Error("unsupported_source_kind");
 return true;
}
function createPrivatePlan(songId,{generate=false}={}){
 const trust=JSON.parse(fs.readFileSync(TRUST_FILE,"utf8"));
 if(!Array.isArray(trust.records))throw Error("trust_manifest_invalid");
 const records=trust.records.filter(r=>r.song_id===songId);
 if(records.length!==1)throw Error("untrusted_song");
 const record=records[0],buffer=readTrustedSource(record.source_path);
 const req={song_id:songId,school_id:record.school_id??null,source_kind:record.source_kind,
  source_path:record.source_path,source_git_blob_sha1:gitBlobSha1(buffer),public_release:false};
 const verdict=policy.authorizePrivateIntake(trust,req,new Date().toISOString().slice(0,10));
 validateSourceFormat(buffer,record.source_kind,record.source_path);
 if(record.source_kind!=="events_json"){
  return {...verdict,generated:false,reason:"parser_or_score_review_not_implemented"};
 }
 const source=JSON.parse(buffer.toString("utf8"));
 if(source.songId!==songId||source.rights?.sourceId!==songId||
   source.rights?.publicRelease!==false||source.rights?.status!=="demo_original"){
  throw Error("original_source_rights_mismatch");
 }
 if(!generate)return {...verdict,generated:false};
 const arrange=require("./schoolband-rock-arranger-v1.cjs");
 const charts=require("./schoolband-chart-generator-v1.cjs");
 const input=source.standard==="schoolband-music-events-v1"?arrange.fromStage013(source):source;
 const arrangement=arrange.arrange(input,{seed:14014});
 const privateCatalog=charts.registerPrivateTrial(arrangement);
 if(privateCatalog.publicRelease!==false||privateCatalog.registration?.publicApproved!==false||
   privateCatalog.registration?.status!=="qa_passed_private"){
  throw Error("private_output_guard_failed");
 }
 return {...verdict,generated:true,chart_count:Object.keys(privateCatalog.charts).length*5,
  chart_version:privateCatalog.chartVersion,private_only:true};
}
if(require.main===module){
 const args=process.argv.slice(2);
 try{
  if(args.length<2||args[0]!=="--song"||typeof args[1]!=="string"||
     args.slice(2).some(x=>x!=="--generate-private"))throw Error("usage: --song <registered-id> [--generate-private]");
  console.log(JSON.stringify(createPrivatePlan(args[1],{generate:args.includes("--generate-private")})));
 }catch(e){console.error("STAGE022_INTAKE_REJECTED: "+String(e.code||e.message));process.exitCode=1;}
}
module.exports={gitBlobSha1,readTrustedSource,validateSourceFormat,createPrivatePlan};
