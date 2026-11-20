// Verifies actual published admin login shell, not just repository files.
// Does not log in, mutate data, or expose dashboard results.
const assert=require("node:assert/strict");
const base="https://baeguindex.com/admin.html";
(async()=>{
 let last="";
 for(let attempt=0;attempt<15;attempt++){
  try{
   const res=await fetch(base+"?verification=admin-dashboard-"+Date.now(),{
     headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)
   });
   if(res.status!==200){last="HTTP "+res.status;continue;}
   const html=await res.text();
   if(html.includes('id="adminSiteHeading"')&&
      html.includes('id="adminSchoolRanking"')&&
      html.includes('id="adminPasswordChangeForm"')&&
      html.includes('id="adminReview2026"')&&
      html.includes('js/beagu-2026-admin-review.js?v=20261120-review2')&&
      html.includes('id="adminReview2026List"')&&
      html.includes('name="robots" content="noindex,nofollow,noarchive"')){
      assert(!/visit-stats\.js|search-telemetry-v1\.js/.test(html));
      console.log("PASS: published admin login shell contains MFA-only 2026 review queue and no ordinary telemetry");
      return;
   }
   last="Published HTML has old dashboard revision";
  }catch(e){last=e?.message||String(e)}
  await new Promise(done=>setTimeout(done,6000));
 }
 throw new Error("Admin dashboard publish not verified: "+last);
})().catch(e=>{console.error(e);process.exitCode=1;});