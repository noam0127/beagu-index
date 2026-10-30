export const isVI = key => /^Q(0[1-9]|1[0-3])$/.test(key);
const text = (v,max=240) => typeof v==='string' && v.length<=max && !/[<>\r\n]/.test(v);
const forbidden = /응답.*(수|횟|건)|관측|표본|소표본|원자료|자유서술|respondent|observation|sample|raw_row|n_valid|count/i;
export function releaseMetrics(rows,catalog,level){
  if(![1,2].includes(level))return [];
  const definitions=new Map(catalog.filter(c=>c.verified===true).map(c=>[`${c.survey_year}:${c.question_id}`,c]));
  const candidates=rows.flatMap(r=>{
    if(r.survey_year===2026&&/^Q51(?:$|[._-])/.test(r.question_id))return [];
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
  if(level!==2)return [];
  return rows.filter(r=>[2023,2024,2025].includes(r.survey_year)&&r.release_status==='approved').map(r=>({year:r.survey_year,access_level:2,summary:{metrics:(r.summary?.public_release_v1?.metrics||[]).filter(m=>text(m?.label,50)&&text(m?.value,70)&&!forbidden.test(m.label)).map(m=>({label:m.label,value:m.value}))}}));
}
