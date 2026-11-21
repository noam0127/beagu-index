// Stage35: batch 2026 percentile projection, always called AFTER the
// 2026 participation server session and independent reviewed 6h RPC.
// Client-provided rank, release flag, school name and code are never inputs.
// This is not a grant of server access; the Edge route owns both credentials.
import {releaseMetrics} from './release-policy.mjs';

const schoolId=/^[A-Z0-9]{7}$/;
export function public2026BatchPercentiles({
  schoolIds,metrics,catalog,verifiedLevel,reviewedEarlySchoolIds
}={}){
  // Existing API allows 1..20 distinct schools; refuse rather than truncate
  // or accidentally broaden this privacy-sensitive batch endpoint.
  if(!Array.isArray(schoolIds)||schoolIds.length<1||schoolIds.length>20||
     schoolIds.some(id=>typeof id!=='string'||!schoolId.test(id))||
     new Set(schoolIds).size!==schoolIds.length||
     ![1,2].includes(verifiedLevel)||
     !Array.isArray(metrics)||!Array.isArray(catalog)||
     !(reviewedEarlySchoolIds instanceof Set))return {};

  const bySchool=new Map();
  for(const row of metrics){
    if(!row||typeof row!=='object'||row.survey_year!==2026||
       row.question_id!=='percentile'||!schoolId.test(row.school_id)||
       !schoolIds.includes(row.school_id))continue;
    if(!bySchool.has(row.school_id))bySchool.set(row.school_id,[]);
    bySchool.get(row.school_id).push(row);
  }

  const output=Object.create(null);
  for(const id of schoolIds){
    // The only path to the six-hour exception is a VERIFIED Lv2 session
    // and an independently reviewed exact-snapshot release for this school.
    // No early exception can be inferred from a metric's approved_at alone.
    const reviewedEarly=verifiedLevel===2&&reviewedEarlySchoolIds.has(id);
    const approved=releaseMetrics(bySchool.get(id)||[],catalog,verifiedLevel,reviewedEarly)
      .filter(m=>m.year===2026&&m.key==='percentile'&&
        typeof m.value==='number'&&Number.isFinite(m.value)&&
        m.value>=0&&m.value<=100);
    if(approved.length===1)output[id]=approved[0].value;
  }
  return output;
}
