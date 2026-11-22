"use strict";
// Read-only publication drift classifier. Do not log admin HTML or private data.
const REQUIRED_IDS=Object.freeze([
 "adminSiteHeading","adminSchoolRanking","adminPasswordChangeForm",
 "adminReview2026","adminReview2026List","adminTelemetryHealthPanel",
 "adminTelemetryAsOf"
]);
const ALWAYS_SCRIPTS=Object.freeze([
 'js/beagu-2026-admin-review.js?v=20261120-review2'
]);
const PUBLIC_ATTR='name="robots" content="noindex,nofollow,noarchive"';
const VERSION=/js\/beagu-admin-access-v1\.js\?v=([a-z0-9-]+)/;
function inspectAdminShell(html,{expectedVersion=null,onPush=false}={}){
 if(typeof html!=="string")return {ok:false,reason:"게시 HTML 응답 형식 오류",deployedVersion:null,missing:[]};
 const deployedVersion=html.match(VERSION)?.[1]??null;
 const missing=REQUIRED_IDS.filter(id=>!html.includes('id="'+id+'"')).map(id=>"id:"+id);
 for(const item of ALWAYS_SCRIPTS)if(!html.includes(item))missing.push("script:"+item);
 if(!html.includes(PUBLIC_ATTR))missing.push("robots:noindex");
 if(/visit-stats\.js|search-telemetry-v1\.js/.test(html))missing.push("deprecated-telemetry-script");
 if(!deployedVersion)missing.push("admin-access-version");
 if(onPush && deployedVersion!==expectedVersion)
   missing.push("admin-version-mismatch");
 if(onPush && !html.includes('id="adminTelemetryHourlyStatus"'))
   missing.push("id:adminTelemetryHourlyStatus");
 if(onPush && !html.includes('id="adminReferralFunnelRows"'))
   missing.push("id:adminReferralFunnelRows");
 const ok=missing.length===0;
 const versionLabel=deployedVersion??"없음";
 const expectedLabel=expectedVersion??"확인 전";
 const reason=ok?"운영 관리자 HTML 필수 구성 확인":
   "운영 관리자 HTML 불일치 (실제 JS="+versionLabel+
   ", 소스 JS="+expectedLabel+", 누락="+missing.join(", ")+")";
 return {ok,deployedVersion,missing,reason};
}
module.exports={REQUIRED_IDS,inspectAdminShell};
