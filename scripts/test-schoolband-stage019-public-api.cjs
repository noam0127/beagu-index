#!/usr/bin/env node
"use strict";
// Stage 019: GET-only public API smoke. No production writes, credentials or private rows.
const assert=require("node:assert/strict");
const base="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/schoolband-school-read-v1";
async function read(url){
 const response=await fetch(url,{method:"GET",headers:{Accept:"application/json"},signal:AbortSignal.timeout(14000)});
 assert.equal(response.status,200,"public read must return 200");
 assert.match(response.headers.get("content-type")||"",/application\/json/);
 return response.json();
}
async function run(){
 const first=await read(base+"?schools="+encodeURIComponent("초등"));
 assert(Array.isArray(first.schools),"search list missing");
 assert(first.schools.length>0&&first.schools.length<=12,"search count must be bounded");
 const searchFields=["school_id","school_name","sido_standard"];
 for(const row of first.schools){
  assert(typeof row.school_id==="string"&&/^[0-9A-Za-z_-]{4,32}$/.test(row.school_id));
  assert(typeof row.school_name==="string"&&row.school_name.length>0);
  assert(Object.keys(row).every(field=>searchFields.includes(field)),"unexpected search field");
 }
 const chosen=first.schools[0];
 const detail=await read(base+"?school_id="+encodeURIComponent(chosen.school_id));
 const school=detail.school;assert(school&&school.school_id===chosen.school_id,"detail ID mismatch");
 const allowed=["school_id","school_name","region","difficulty","eligible","source_year"];
 assert(Object.keys(school).every(field=>allowed.includes(field)),"private field exposure in school detail");
 const tiers=["easy","normal","hard","very_hard","extreme"];
 assert(school.difficulty===null||tiers.includes(school.difficulty));
 if(school.eligible){assert(tiers.includes(school.difficulty));assert(Number.isInteger(school.source_year));}
 else assert(school.difficulty===null||tiers.includes(school.difficulty));
 const invalid=await fetch(base+"?school_id="+encodeURIComponent("INVALID!"),{signal:AbortSignal.timeout(14000)});
 assert.equal(invalid.status,400,"invalid school ID must be rejected");
 const options=await fetch(base,{method:"OPTIONS",signal:AbortSignal.timeout(14000)});
 assert.equal(options.status,204,"public API preflight must remain read-only");
 console.log("PASS schoolband stage019 public API GET-only smoke:",chosen.school_id,
  "search count",first.schools.length,"detail tier",school.difficulty??"unrated");
}
run().catch(error=>{console.error("FAIL public read smoke",error);process.exitCode=1;});
