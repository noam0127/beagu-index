"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {REQUIRED_IDS,inspectAdminShell}=require("./admin-publication-diagnostics.cjs");
const build=(version="20261121-1")=>[
 ...REQUIRED_IDS.map(id=>'<section id="'+id+'"></section>'),
 '<script src="js/beagu-2026-admin-review.js?v=20261120-review2"></script>',
 '<script src="js/beagu-admin-access-v1.js?v='+version+'"></script>',
 '<meta name="robots" content="noindex,nofollow,noarchive">',
 '<div id="adminTelemetryHourlyStatus"></div>',
 '<div id="adminReferralFunnelRows"></div>'
].join("\n");

test("correct published shell with matching release version passes",()=>{
 const r=inspectAdminShell(build(),{onPush:true,expectedVersion:"20261121-1"});
 assert.equal(r.ok,true);
 assert.deepEqual(r.missing,[]);
});
test("old production HTML is classified without suppressing the drift",()=>{
 const r=inspectAdminShell(build("20261120-old"),{onPush:true,expectedVersion:"20261121-1"});
 assert.equal(r.ok,false);
 assert(r.missing.includes("admin-version-mismatch"));
 assert.match(r.reason,/실제 JS=20261120-old/);
 assert.match(r.reason,/소스 JS=20261121-1/);
});
test("scheduled live checks preserve previous non-push version tolerance",()=>{
 const r=inspectAdminShell(build("20261120-old"),{onPush:false,expectedVersion:"20261121-1"});
 assert.equal(r.ok,true);
});
test("missing HTML elements report exact IDs to resolve live publication failures",()=>{
 const html=build().replace('<section id="adminReview2026List"></section>',"");
 const r=inspectAdminShell(html,{onPush:true,expectedVersion:"20261121-1"});
 assert.equal(r.ok,false);
 assert(r.missing.includes("id:adminReview2026List"));
});
test("missing noindex, review script, access version or expected status fails closed",()=>{
 for(const marker of [
  '<meta name="robots" content="noindex,nofollow,noarchive">',
  '<script src="js/beagu-2026-admin-review.js?v=20261120-review2"></script>',
  '<script src="js/beagu-admin-access-v1.js?v=20261121-1"></script>',
  '<div id="adminReferralFunnelRows"></div>'
 ]){
  const r=inspectAdminShell(build().replace(marker,""),{onPush:true,expectedVersion:"20261121-1"});
  assert.equal(r.ok,false,marker);
 }
});
test("obsolete telemetry script remains a hard failure",()=>{
 const r=inspectAdminShell(build()+'<script src="visit-stats.js"></script>');
 assert.equal(r.ok,false);
 assert(r.missing.includes("deprecated-telemetry-script"));
});
test("classifier never serializes page contents, cookies or credentials",()=>{
 const html=build()+"SECRET_TEST_TOKEN_123";
 const r=inspectAdminShell(html,{onPush:true,expectedVersion:"20261121-1"});
 assert(!JSON.stringify(r).includes("SECRET_TEST_TOKEN_123"));
});
test("non-string remote HTML never counts as verified",()=>{
 assert.equal(inspectAdminShell(null).ok,false);
});
