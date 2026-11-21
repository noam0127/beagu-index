import {catalog} from './questionnaire-2026.mjs';
import {isPublic2026QuestionId} from './2026-public-question-policy.mjs';
export const sourceId='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4';
const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const keys=(v,expected)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...expected].sort().join('|');
const specs=Object.entries(catalog).flatMap(([id,m])=>(m.kind==='grid'?m.rows:[null]).map((_,i)=>({id,row:m.kind==='grid'?i:-1,meta:m,options:m.kind==='grid'?m.columns:m.options})));
export function validateSnapshot(data,now=Date.now()) {
  if(!keys(data,['source_spreadsheet_id','official_start_day','schema_version','totals','schools','snapshot_at'])||
    data.source_spreadsheet_id!==sourceId||data.official_start_day!=='2026-11-01'||data.schema_version!==1||
    !Number.isFinite(Date.parse(data.snapshot_at))||Math.abs(Date.parse(data.snapshot_at)-now)>30*60*1000||
    !keys(data.totals,['source_rows','official_rows','prelaunch_rows','unmatched_rows','undated_rows'])||
    !Object.values(data.totals).every(n=>integer(n,50000))||!Array.isArray(data.schools)||data.schools.length>10000)throw Error('INVALID_SNAPSHOT');
  const t=data.totals;
  if(t.source_rows!==t.official_rows+t.prelaunch_rows+t.undated_rows||t.unmatched_rows>t.official_rows)throw Error('INVALID_TOTALS');
  const ids=new Set();let total=0;
  for(const school of data.schools){
    if(!keys(school,['school_id','school_response_rows','school_match_status','questions'])||
      !/^[A-Z0-9]{7}$/.test(school.school_id)||ids.has(school.school_id)||!integer(school.school_response_rows,50000)||school.school_response_rows<1||
      !['EXACT_REGION_OFFICE_NAME','NEEDS_REVIEW'].includes(school.school_match_status)||
      !Array.isArray(school.questions)||school.questions.length!==specs.length)throw Error('INVALID_SCHOOL');
    ids.add(school.school_id);total+=school.school_response_rows;
    school.questions.forEach((q,i)=>{
      const s=specs[i],n=school.school_response_rows;
      if(!keys(q,['id','row','valid','invalid','counts','minutes_sum'])||q.id!==s.id||q.row!==s.row||
        !integer(q.valid,n)||!integer(q.invalid,n)||q.valid+q.invalid>n||
        !Array.isArray(q.counts)||q.counts.length!==s.options.length||!q.counts.every(c=>integer(c,q.valid))||
        !integer(q.minutes_sum,1439*q.valid))throw Error('INVALID_QUESTION');
      const sum=q.counts.reduce((a,b)=>a+b,0),multi=s.meta.kind==='multi'||s.id==='Q45';
      if(s.meta.kind!=='time'&&(q.minutes_sum!==0||(multi?sum<q.valid:sum!==q.valid)))throw Error('INVALID_COUNTS');
    });
  }
  if(total+t.unmatched_rows!==t.official_rows)throw Error('INVALID_MATCHED_TOTAL');
  return data;
}
// Called only after the DB's evidence/hash/24-hour gate. Return whitelist labels
// and modes only; never return distributions, counts, source rows, or evidence.
export function publicQuestionResults(questions) {
  // Even a privileged review RPC can supply malformed or newly introduced
  // JSON fields. Expose only closed, catalogued selections on the vetted
  // exact-snapshot path; never serialize the raw question object itself.
  if(!Array.isArray(questions))return [];
  return questions.flatMap(q=>{
    if(!q||typeof q!=='object'||Array.isArray(q)||
      !isPublic2026QuestionId(q.id))return [];
    const m=catalog[q.id];
    if(!m||!Number.isSafeInteger(q.row)||
      (m.kind==='grid'
        ? q.row<0||q.row>=m.rows.length
        : q.row!==-1)||
      !Number.isSafeInteger(q.valid)||q.valid<1||
      !Number.isSafeInteger(q.invalid)||q.invalid!==0)return [];
    const options=m.kind==='grid'?m.columns:m.options;
    if(!Array.isArray(options)||!Array.isArray(q.counts)||
      q.counts.length!==options.length||
      !q.counts.every(c=>Number.isSafeInteger(c)&&c>=0&&c<=q.valid))return [];
    const sum=q.counts.reduce((a,b)=>a+b,0);
    const multiple=m.kind==='multi'||q.id==='Q45';
    if(m.kind!=='time'&&(multiple?sum<q.valid:sum!==q.valid))return [];
    let values=[];
    if(m.kind==='time'){
      if(!Number.isSafeInteger(q.minutes_sum)||
        q.minutes_sum<0||q.minutes_sum>1439*q.valid)return [];
      const minutes=Math.round(q.minutes_sum/q.valid);
      values=[String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')];
    }else if(multiple){
      values=options.filter((_,i)=>q.counts[i]>0);
    }else{
      const max=Math.max(...q.counts);
      values=options.filter((_,i)=>q.counts[i]===max);
    }
    // Labels come exclusively from the fixed questionnaire catalogue.
    if(!values.length||values.some(v=>typeof v!=='string'))return [];
    return [{questionId:q.id,row:q.row,values}];
  });
}
