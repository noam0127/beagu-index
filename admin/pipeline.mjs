import {createHash} from 'node:crypto';
export const stripChoice = s => String(s??'').replace(/^[①-㉟]\s*/,'').trim();
export function matchSchool(row,schools){
  // Explicit school code wins only when contextual fields agree. No fuzzy name merge.
  const candidates=schools.filter(s=>s.status==='운영'&&s.school_name===row.name&&s.sido_standard===row.region&&s.support_office===row.office&&(!row.school_id||s.school_id===row.school_id));
  return candidates.length===1?{school_id:candidates[0].school_id,match_status:'MATCHED'}:{school_id:null,match_status:'NEEDS_REVIEW'};
}
export function prepareBatch(values,schools,codebook,source){
  if(!Array.isArray(values)||!values.length)throw Error('MISSING_HEADERS');
  const headers=values[0],at=prefix=>headers.findIndex(h=>h.startsWith(prefix));
  if(at('B01.')<0||at('B03.')<0)throw Error('SCHEMA_MISMATCH');
  for(const q of codebook.verticality)if(!headers.includes(`${q.question_id}. ${q.label}`))throw Error('QUESTION_CHANGED');
  const records=values.slice(1).map((r,i)=>({r,i})).filter(({r})=>r.some(v=>v!==''&&v!==null)).map(({r,i})=>{
    const offices=headers.flatMap((h,j)=>h.startsWith('B02.')&&r[j]?[stripChoice(r[j])]:[]);
    let region=String(r[at('B01.')]||'');region=({'전남권(구 전라남도)':'전남','광주권(구 광주광역시)':'광주'})[region]||region;
    const name=String(r[at('B03.')]||'').trim();
    // Full regional office names differ; match only a unique official suffix within the exact region.
    const officeCandidates=[...new Set(schools.filter(s=>s.sido_standard===region&&offices.length===1&&s.support_office?.endsWith(offices[0])).map(s=>s.support_office))];
    const match=matchSchool({name,region,office:officeCandidates.length===1?officeCandidates[0]:null},schools);
    const answers=Object.fromEntries(headers.map((h,j)=>[h,r[j]??null]));
    const scores=Object.fromEntries(codebook.verticality.map(q=>{const answer=answers[`${q.question_id}. ${q.label}`];return [q.question_id,Object.hasOwn(q.scoring,answer)?q.scoring[answer]:null];}));
    return {source_key:String(i+2),...match,values:{answers,scores,approval_status:'PENDING'}};
  });
  const raw={source,version:codebook.version,values};
  return {p_source:source,p_year:2026,p_version:codebook.version,p_hash:createHash('sha256').update(JSON.stringify(raw)).digest('hex'),p_raw:raw,p_records:records};
}
