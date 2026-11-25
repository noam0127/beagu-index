import {catalog} from './questionnaire-2026.mjs';
// Final workbook uses school ID, numeric 0-100 percentile, and known question headings.
// No free text, response counts, identity data, ranking calculations or raw answers.
export function edited2026Rows(table){
 if(!Array.isArray(table)||table.length<2||table.length>7001)throw Error('INVALID_SIZE');
 const h=table[0];if(!Array.isArray(h)||h.length<2||h.length>140||h[0]!=='학교ID'||h[1]!=='백분위'||new Set(h).size!==h.length)throw Error('INVALID_HEADER');
 const specs=h.slice(2).map(x=>{
  if(/^Q(?:31|51)(?:[._-]\d+)?$/.test(x))return null;
  const m=/^(Q\d{2})(?:\.(\d+))?$/.exec(x),q=m&&catalog[m[1]];
  if(!q||q.kind==='grid'!==!!m[2])throw Error('INVALID_COLUMN');
  const row=q.kind==='grid'?Number(m[2])-1:-1;
  if(q.kind==='grid'&&(row<0||row>=q.rows.length))throw Error('INVALID_COLUMN');
  return {id:m[1],row,q};
 });
 const seen=new Set();
 return table.slice(1).map(line=>{
  if(!Array.isArray(line)||line.length>h.length)throw Error('INVALID_ROW');
  const id=String(line[0]??'').trim(),raw=line[1];
  if(!/^[A-Z0-9]{7}$/.test(id)||seen.has(id)||raw===null||raw===undefined||raw===''||!(/^\d+(?:\.\d+)?%?$/.test(String(raw))))throw Error('INVALID_SCHOOL_OR_PERCENTILE');
  seen.add(id);const percentile=Number(String(raw).replace(/%$/,''));
  if(!Number.isFinite(percentile)||percentile<0||percentile>100)throw Error('INVALID_PERCENTILE');
  const questions=[];
  for(let i=0;i<specs.length;i++){
   const s=specs[i],cell=line[i+2];if(!s||cell===null||cell===undefined||cell==='')continue;
   const values=String(cell).split(' | ').map(v=>v.trim());
   const allowed=s.q.kind==='grid'?s.q.columns:s.q.options;
   if(values.length>25||new Set(values).size!==values.length||values.some(v=>s.q.kind==='time'?!/^([01]\d|2[0-3]):[0-5]\d$/.test(v):!allowed.includes(v)||v==='기타'))throw Error('INVALID_ANSWER');
   questions.push({questionId:s.id,row:s.row,values});
  }
  return {school_id:id,percentile,questions};
 });
}
