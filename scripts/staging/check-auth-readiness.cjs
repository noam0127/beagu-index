#!/usr/bin/env node
/* Read-only interpretation of aggregated staging Auth state.
 * Never provisions accounts, writes to Supabase, imports personal records,
 * approves an operational release, or claims that browser E2E has passed.
 *
 * Usage:
 *   node scripts/staging/check-auth-readiness.cjs --input stage-counts.json
 * The JSON must be the single aggregate SELECT row returned by auth-readiness.sql.
 */
"use strict";
const fs=require("node:fs");

const STAGE_REF="ycwuugggqbunlbwuzvbx";
const fields=[
 "auth_users","confirmed_users","verified_mfa_factors","enabled_owners",
 "owner_with_verified_mfa","active_level_codes","referral_profiles",
 "earned_lv2_profiles","linked_member_accounts"
];
const criteria=[
 {id:"email_auth_prerequisite",label:"이메일 실계정 인증 시험 준비",
  fields:["auth_users","confirmed_users"]},
 {id:"lv1_code_prerequisite",label:"Lv1 참여코드 인증 시험 준비",
  test:row=>row.active_level_codes>0||row.referral_profiles>0},
 {id:"lv2_referral_prerequisite",label:"추천 달성 Lv2 인증 시험 준비",
  fields:["earned_lv2_profiles"]},
 {id:"admin_owner_prerequisite",label:"시험 관리자 권한 시험 준비",
  fields:["enabled_owners"]},
 {id:"owner_mfa_prerequisite",label:"동일 시험 관리자 계정의 MFA 등록 준비",
  fields:["owner_with_verified_mfa"]}
];
function parseRow(data){
 const row=Array.isArray(data)&&data.length===1?data[0]:data;
 if(!row||typeof row!=="object"||Array.isArray(row))throw Error("One aggregate row is required");
 if(row.stage_ref!==STAGE_REF)throw Error("Only the explicitly named staging project may be checked");
 for(const key of fields){
  const val=row[key];
  if(!Number.isSafeInteger(val)||val<0)
   throw Error("Invalid aggregate counter: "+key);
 }
 if(row.confirmed_users>row.auth_users||row.owner_with_verified_mfa>row.enabled_owners||
    row.earned_lv2_profiles>row.referral_profiles)
  throw Error("Inconsistent aggregate counters");
 return row;
}
function evaluate(data){
 const row=parseRow(data);
 const checks=criteria.map(c=>({
  id:c.id,label:c.label,ready:c.test?c.test(row):c.fields.every(key=>row[key]>0)
 }));
 return {project:STAGE_REF,mode:"read_only_prerequisites",
  stage_ready_for_manual_e2e:checks.every(c=>c.ready),
  real_email_or_mfa_e2e_performed:false,
  production_release_authorized:false,checks};
}
function run(){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=="--input")throw Error("Usage: --input aggregate-readiness.json");
 const result=evaluate(JSON.parse(fs.readFileSync(args[1],"utf8")));
 for(const item of result.checks)
  console.log((item.ready?"READY":"BLOCKED")+" "+item.id+" · "+item.label);
 console.log(result.stage_ready_for_manual_e2e?
   "PREREQUISITES PRESENT — real login, email and MFA browser tests still required":
   "NOT READY — provision only isolated staging identities, MFA and earned Lv2 test proof");
 // This tool intentionally returns nonzero until prerequisites exist.
 if(!result.stage_ready_for_manual_e2e)process.exitCode=2;
}
if(require.main===module){
 try{run()}catch(e){console.error("AUTH_READINESS_INVALID: "+e.message);process.exitCode=1;}
}
module.exports={evaluate,parseRow,STAGE_REF,fields};
