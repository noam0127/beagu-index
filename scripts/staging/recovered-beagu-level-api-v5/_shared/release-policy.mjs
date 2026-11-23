export const isVI = key => /^Q(0[1-9]|1[0-3])$/.test(key);

// Server-authoritative tier restriction for the ranked-school API.
 // UI-only hiding does not prevent callers from crafting their own sort query.
export function canSortRankedSchools(level, sort) {
  const tier=Number(level);
  return Number.isInteger(tier) && tier>=1 &&
    (sort!=='housing_price_won' || tier>=2);
}

const text = (v,max=240) => typeof v==='string' && v.length<=max && !/[<>\r\n]/.test(v);
const forbidden = /응답.*(수|횟|건)|관측|표본|소표본|원자료|자유서술|respondent|observation|sample|raw_row|n_valid|count/i;
// 2026 releases are tier-delayed AFTER independent publication approval.
// Historical survey releases are not affected by these delays.
export const RELEASE_DELAY_MS=24*60*60*1000;
export const LV2_RELEASE_DELAY_MS=6*60*60*1000;
export function approved2026ReleaseIsOldEnough(approvedAt,nowMs=Date.now(),delayMs=RELEASE_DELAY_MS){
  if(typeof approvedAt!=='string'||!Number.isFinite(nowMs)||
     !Number.isFinite(delayMs)||delayMs<0)return false;
  const time=Date.parse(approvedAt);
  return Number.isFinite(time)&&time<=nowMs-delayMs;
}
// An independently reviewed exact-snapshot RPC is STILL required. Age alone
// must never authorize reading survey results.
export function canUse2026Lv2Snapshot(approvedAt,nowMs=Date.now()){
  return approved2026ReleaseIsOldEnough(approvedAt,nowMs,LV2_RELEASE_DELAY_MS);
}
// The caller MUST independently verify the genuine Lv3 Auth user and
// exact approved publication snapshot before requesting a zero-delay release.
// No tier may publish an approval dated in the future.
export function canUse2026TierSnapshot(approvedAt,level,nowMs=Date.now()){
  if(level===3)return approved2026ReleaseIsOldEnough(approvedAt,nowMs,0);
  if(level===2)return canUse2026Lv2Snapshot(approvedAt,nowMs);
  return false;
}
export function releaseMetrics(rows,catalog,level,approvedSnapshot=false){
  if(![1,2,3].includes(level))return [];
  const definitions=new Map(catalog.filter(c=>c.verified===true).map(c=>[`${c.survey_year}:${c.question_id}`,c]));
  const candidates=rows.flatMap(r=>{
    // Q31 is a school-level sensitive incident question explicitly excluded
    // from publication; Q51 is also never a public school metric.
    if(r.survey_year===2026&&/^Q(?:31|51)(?:$|[._-])/.test(r.question_id))return [];
    // Lv1: 24h. Lv2: 6h only after a separate exact-snapshot review RPC.
    // Always apply the delay to EACH metric's own approval, not merely the
    // snapshot timestamp: a newly approved metric must not ride an older snapshot.
    if(r.survey_year===2026){
      const verifiedEarly=level>=2&&approvedSnapshot===true;
      const delay=verifiedEarly?(level===3?0:LV2_RELEASE_DELAY_MS):RELEASE_DELAY_MS;
      if(!approved2026ReleaseIsOldEnough(r.approved_at,Date.now(),delay))return [];
    }
    const d=definitions.get(`${r.survey_year}:${r.question_id}`);
    if(!d||r.approval_status!=='APPROVED'||r.privacy_status!=='PASSED'||!r.identity_reviewed||!r.question_reviewed||!r.small_cell_reviewed||!r.differencing_reviewed||!r.approved_at||!r.approved_by||!r.approval_evidence)return [];
    const min=r.survey_year===2026&&(r.question_id==='percentile'||isVI(r.question_id))?1:2;
    if(level<min||r.access_level!==min||d.access_level!==min)return [];
    if(d.value_type!=='number'||!text(r.value)||!/^[-]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(r.value))return [];
    const value=Number(r.value);if(!Number.isFinite(value)||!Number.isFinite(d.minimum)||!Number.isFinite(d.maximum)||d.minimum>d.maximum||value<d.minimum||value>d.maximum)return [];
    if(!text(d.label)||forbidden.test(d.label+' '+d.question_id)||!text(d.meaning)||!text(d.interpretation)||!text(d.direction)||!text(d.unit,30)||!text(d.spatial_scope,160))return [];
    return [{key:r.question_id,year:r.survey_year,label:d.label,value,unit:d.unit,meaning:d.meaning,interpretation:d.interpretation,direction:d.direction,scope:d.spatial_scope,version:r.release_version}];
  });
  // A complete, single approved VI snapshot is required. Do not blend releases.
  const vi=candidates.filter(m=>m.year===2026&&isVI(m.key));
  const versions=[...new Set(vi.map(m=>m.version))].sort().reverse();
  const version=versions.find(v=>new Set(vi.filter(m=>m.version===v).map(m=>m.key)).size===13);
  const unique=new Map();
  for(const m of candidates.sort((a,b)=>String(a.version).localeCompare(String(b.version)))){
    if(m.year===2026&&isVI(m.key)&&m.version!==version)continue;
    const {version:_,...safe}=m;unique.set(`${m.year}:${m.key}`,safe);
  }
  return [...unique.values()];
}
export function legacyRows(rows,level){
  if(level!==2&&level!==3)return [];
  // 2025 survey domain scores have no confirmed unique respondent counts. Do not release legacy n<5 or unverified aggregates.
  return rows.filter(r=>[2023,2024].includes(r.survey_year)&&r.release_status==='approved').map(r=>({year:r.survey_year,access_level:2,summary:{metrics:(r.summary?.public_release_v1?.metrics||[]).filter(m=>text(m?.label,50)&&text(m?.value,70)&&!forbidden.test(m.label)).map(m=>({label:m.label,value:m.value}))}}));
}

