// Verifies actual published admin login shell, not just repository files.
// Does not log in, mutate data, or expose dashboard results.
const assert=require("node:assert/strict");
const {inspectAdminShell}=require("./admin-publication-diagnostics.cjs");
const base="https://baeguindex.com/admin.html";
const onPush=process.env.GITHUB_EVENT_NAME==="push";
const currentHtml=require('node:fs').readFileSync('admin.html','utf8');
const expectedVersion=currentHtml.match(/js\/beagu-admin-access-v1\.js\?v=([a-z0-9-]+)/)?.[1];
if(!expectedVersion)throw Error('Local admin asset version not found');
(async()=>{
 let last="";
 for(let attempt=0;attempt<15;attempt++){
  try{
   const res=await fetch(base+"?verification=admin-dashboard-"+Date.now(),{
     headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)
   });
   if(res.status!==200){last="HTTP "+res.status;continue;}
   const html=await res.text();
   const inspection=inspectAdminShell(html,{expectedVersion,onPush});
   const deployedVersion=html.match(/js\/beagu-admin-access-v1\.js\?v=([a-z0-9-]+)/)?.[1];
   if(html.includes('id="adminSiteHeading"')&&
      html.includes('id="adminSchoolRanking"')&&
      html.includes('id="adminPasswordChangeForm"')&&
      html.includes('id="adminReview2026"')&&
      html.includes('js/beagu-2026-admin-review.js?v=20261120-review2')&&
      html.includes('id="adminReview2026List"')&&
      html.includes('id="adminTelemetryHealthPanel"')&&
      html.includes('id="adminTelemetryAsOf"')&&
      deployedVersion && (!onPush || deployedVersion===expectedVersion) &&
      (!onPush || html.includes('id="adminTelemetryHourlyStatus"'))&&
      html.includes('name="robots" content="noindex,nofollow,noarchive"')){
      assert(!/visit-stats\.js|search-telemetry-v1\.js/.test(html));
      const asset=await fetch("https://baeguindex.com/js/beagu-2026-admin-review.js?v=20261120-review2&check="+Date.now(),{
        headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)
      });
      if(asset.status!==200){last="Review asset HTTP "+asset.status;continue;}
      const code=await asset.text();
      if(!code.includes('action:"basis_review"')||!code.includes("makeBasisForm(item)")||
         !code.includes("개인정보 입력 금지")){
        last="Published JS has old reviewer implementation";continue;
      }
      const healthJs=await fetch("https://baeguindex.com/js/beagu-admin-access-v1.js?v="+deployedVersion+"&check="+Date.now(),{
        headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)
      });
      if(healthJs.status!==200){last="Health JS HTTP "+healthJs.status;continue;}
      const healthSource=await healthJs.text();
      if(!healthSource.includes("renderTelemetryHealth(payload.telemetry_health)") ||
         !healthSource.includes("function renderTelemetryHealth(data)") ||
         (onPush&&!healthSource.includes('m.status==="warning"')) ||
         (onPush&&!healthSource.includes('renderReferralFunnel(data.referral_funnel)'))){
        last="Published admin JS lacks telemetry health renderer";continue;
      }
      if(onPush)assert(html.includes('id="adminReferralFunnelRows"'),"Deployed funnel panel is missing");
      console.log("PASS: published admin telemetry health panel and live JS present");
      console.log("PASS: published admin login shell and 2026 private evidence intake JS are current");
      return;
   }
   last=inspection.ok?"게시 HTML 구성 추가 검증 실패":inspection.reason;
  }catch(e){last=e?.message||String(e)}
  await new Promise(done=>setTimeout(done,6000));
 }
 throw new Error("Admin dashboard publish not verified: "+last);
})().catch(e=>{console.error(e);process.exitCode=1;});