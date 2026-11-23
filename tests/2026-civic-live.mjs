import assert from "node:assert/strict";
const url="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-2026-civic";
const origin="https://baeguindex.com";
const req=async(input,headers={})=>fetch(url,{
 method:"POST",headers:{"Content-Type":"application/json",Origin:origin,...headers},
 body:JSON.stringify(input),signal:AbortSignal.timeout(18000)
});
const school="7021091"; // pre-existing school snapshot, no test data inserted
const state=await req({action:"status",school_id:school});
assert.equal(state.status,200,"Public participation boolean should be available");
const status=await state.json();
assert.equal(typeof status.participation_confirmed,"boolean");
assert.equal("school_response_rows" in status,false,"Never leak school response count");
const admin=await req({action:"admin_list",status:"PENDING"});
assert.equal(admin.status,403,"Anonymous visitors may not read feedback");
const correction=await req({action:"correct",school_id:school,question_id:"Q01",
 detail:"원본 제출 내용의 정정 요청을 인증 없이 허용하면 안 됩니다."});
assert.equal(correction.status,403,"Lv2 correction requires individually verified session");
const badCategory=await req({action:"report",school_id:school,category:"NOT_ALLOWED",
 detail:"유효하지 않은 신고 범주는 저장되지 않아야 합니다."});
assert.equal(badCategory.status,400,"Invalid category rejected before write");
const foreign=await req({action:"status",school_id:school},{Origin:"https://evil.invalid"});
assert.equal(foreign.status,403,"Foreign origins rejected");
const options=await fetch(url,{method:"OPTIONS",headers:{Origin:origin},signal:AbortSignal.timeout(18000)});
assert.equal(options.status,204,"Whitelisted CORS preflight");
console.log("PASS: live civic endpoint returns only public flag and blocks anonymous admin, correction, invalid category and origin");
