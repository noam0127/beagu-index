/* Parse only the known VI13 final-candidate CSV layout. Never carry free text or question results. */
export const MASTER_HEADER=Object.freeze(["학교ID","유효 관측수(내부)","점수 합 분자(내부)","분모 상수","백분위 후보","검토 플래그","공개 상태","공개 승인","산식"]);
const ID=/^[A-Z0-9]{7}$/,MAX=7000,DEN=360360;
export function validateMasterRows(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX)throw Error('INVALID_COUNT');
 const ids=new Set();
 const parsed=rows.map(r=>{
  if(!r||Object.keys(r).sort().join(',')!=='observations,percentile,school_id,sum_units'||!ID.test(r.school_id)||ids.has(r.school_id)||
   !Number.isSafeInteger(r.observations)||r.observations<1||r.observations>10000||
   !Number.isSafeInteger(r.sum_units)||r.sum_units<0||r.sum_units>100*DEN*r.observations||
   typeof r.percentile!=='number'||!Number.isFinite(r.percentile)||r.percentile<0||r.percentile>100||Math.abs(r.percentile*10-Math.round(r.percentile*10))>1e-8)throw Error('INVALID_ROW');
  ids.add(r.school_id);return {school_id:r.school_id,observations:r.observations,sum_units:r.sum_units,percentile:r.percentile};
 });
 const ranked=parsed.map(r=>({r,n:BigInt(r.sum_units),d:BigInt(r.observations)})).sort((a,b)=>a.n*b.d<b.n*a.d?-1:a.n*b.d>b.n*a.d?1:0);
 let lower=0;for(let i=0;i<ranked.length;i++){
  const x=ranked[i];if(!i||x.n*ranked[i-1].d!==ranked[i-1].n*x.d)lower=i;
  const k=ranked.length-1,expected=k===0?0:Math.floor((2000*lower+k)/(2*k))/10;
  if(x.r.percentile!==expected)throw Error('PERCENTILE_MISMATCH');
 }
 return parsed.sort((a,b)=>a.school_id.localeCompare(b.school_id));
}
export function parseMasterCSV(text){
 if(typeof text!=='string'||text.length>1500000)throw Error('FILE_SIZE');
 // RFC4180 including escaped double quotes and CRLF; reject malformed quoting.
 const table=[];let row=[],field='',quoted=false,closed=false;
 function push(){row.push(field);field='';closed=false;}
 function end(){push();if(row.some(v=>v!==''))table.push(row);row=[];}
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c===','){push();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;end();continue;}
  if(closed)throw Error('INVALID_CSV');
  if(c==='"'){if(field)throw Error('INVALID_CSV');quoted=true;continue;}field+=c;
 }
 if(quoted)throw Error('INVALID_CSV');if(field||row.length)end();
 if(table.shift()?.join('\u0001')!==MASTER_HEADER.join('\u0001'))throw Error('INVALID_HEADER');
 const number=(s,re)=>{if(typeof s!=='string'||!re.test(s))throw Error('INVALID_NUMBER');return Number(s);};
 return validateMasterRows(table.map(r=>{
  if(r.length!==9||r[3]!==String(DEN)||!/^[0-9]+$/.test(r[5])||!['WITHHELD','APPROVED'].includes(r[6])||!['TRUE','FALSE','true','false'].includes(r[7])||!/^VI13-v1\.2-review(?:\+공식명칭정규화)?$/.test(r[8]))throw Error('INVALID_SCHEMA');
  return {school_id:r[0],observations:number(r[1],/^\d+$/),sum_units:number(r[2],/^\d+$/),percentile:number(r[4],/^\d+(?:\.\d)?$/)};
 }));
}

/* Final package contains CSV and exact references to the already reviewed stored
 * aggregate snapshots. No raw answers, question distributions or evidence text. */
export function parseFinalMasterFile(text){
 if(typeof text!=='string'||text.length>1500000)throw Error('FILE_SIZE');
 if(!text.replace(/^\uFEFF/,'').trimStart().startsWith('{'))return {rows:parseMasterCSV(text),questionRefs:[]};
 const p=JSON.parse(text.replace(/^\uFEFF/,''));
 if(!p||Object.keys(p).sort().join(',')!=='kind,percentile_csv,question_refs'||p.kind!=='BEAGU_FINAL_MASTER_2026_V1'||typeof p.percentile_csv!=='string'||!Array.isArray(p.question_refs))throw Error('INVALID_PACKAGE');
 const rows=parseMasterCSV(p.percentile_csv),ids=new Set(rows.map(r=>r.school_id)),seen=new Set();
 if(p.question_refs.length>rows.length)throw Error('INVALID_REFERENCES');
 const questionRefs=p.question_refs.map(r=>{
  if(!r||Object.keys(r).sort().join(',')!=='payload_sha256,school_id'||!ids.has(r.school_id)||seen.has(r.school_id)||typeof r.payload_sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.payload_sha256))throw Error('INVALID_REFERENCE');
  seen.add(r.school_id);return {school_id:r.school_id,payload_sha256:r.payload_sha256};
 });
 return {rows,questionRefs:questionRefs.sort((a,b)=>a.school_id.localeCompare(b.school_id))};
}
