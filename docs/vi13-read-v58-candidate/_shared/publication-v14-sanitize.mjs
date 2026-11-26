import {catalog} from './questionnaire-2026.mjs';
export const prohibited2026=id=>typeof id!=='string'||/^Q(?:31|50|51)(?:$|[._-])/.test(id);
export function normalizeTimeMinutes(id,minutes){
 if(!['Q19','Q20'].includes(id)||!Number.isSafeInteger(minutes)||minutes<0||minutes>1439)return null;
 return minutes%720+(id==='Q20'?720:0);
}
// Legacy edited values do not carry per-response normalized provenance. Never guess an aggregate time.
export function sanitizeEditedQuestions(questions){
 if(!Array.isArray(questions))return [];
 return questions.flatMap(q=>{
  if(!q||typeof q!=='object'||prohibited2026(q.questionId)||!Object.hasOwn(catalog,q.questionId)||!Array.isArray(q.values))return [];
  const meta=catalog[q.questionId],grid=meta.kind==='grid';
  if(!['choice','multi','grid'].includes(meta.kind)||!Number.isSafeInteger(q.row)||(grid?(q.row<0||q.row>=meta.rows.length):q.row!==-1))return [];
  const allowed=new Set((grid?meta.columns:meta.options).filter(x=>x!=='기타'&&!/^기타\s*[:(]/.test(x)));
  const values=[...new Set(q.values.filter(v=>typeof v==='string'&&allowed.has(v)))];
  return values.length?[{questionId:q.questionId,row:q.row,values}]:[];
 });
}
