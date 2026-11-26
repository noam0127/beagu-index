// v1.4 candidate only: no positive school approval/attestation is consulted.
import {vi13SheetEnabled,readVI13Sheet,publicVI13Top10} from './vi13-sheet-sync.mjs';
export {vi13SheetEnabled,readVI13Sheet};
const required=['identity','sourceAgreement','notice','smallSample','reidentification','priorCombination','manipulation'];
const idPattern=/^[A-Z0-9]{7}$/;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function automaticVI13Values(snapshot,ids,checks,tier){
 if(tier!==2||!record(checks)||checks.generatedAt!==snapshot.generatedAt||!record(checks.schools)||!Array.isArray(ids)||ids.length<1||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!idPattern.test(id)))return {};
 const lookup=new Map(snapshot.rows.map(r=>[r.school_id,r])),out={};
 for(const id of ids){
  const r=lookup.get(id),c=Object.hasOwn(checks.schools,id)?checks.schools[id]:null;
  if(!r||r.observations<1||r.flags!==0||!record(c)||c.blocked!==false||c.percentile!==r.percentile||!required.every(k=>c[k]===true))continue;
  out[id]=r.percentile;
 }
 return out;
}
async function checksFor(admin,snapshot,ids,tier){
 if(tier!==2)throw Error('VI13_LEVEL');
 const {data,error}=await admin.rpc('beagu_2026_vi13_v14_checks',{p_ids:ids,p_generated_at:snapshot.generatedAt,p_level:tier});
 if(error||!record(data))throw Error('VI13_CHECKS_UNAVAILABLE');
 return data;
}
// Internal only: a cohort member cannot fall back to an older 2026 release when held.
export async function autoSheetSelection(admin,ids,tier){
 if(tier!==2)return {covered:[],values:{}};
 const s=await readVI13Sheet(admin),all=new Set(s.rows.map(r=>r.school_id));
 const covered=ids.filter(id=>all.has(id));
 const values=covered.length?automaticVI13Values(s,covered,await checksFor(admin,s,covered,tier),tier):{};
 return {covered,values};
}
export function mergeVI13Selection(legacy,selection){
 const out={...legacy};
 for(const id of selection.covered)delete out[id];
 return {...out,...selection.values};
}
export async function autoSheetValues(admin,ids,tier){
 try{return (await autoSheetSelection(admin,ids,tier)).values;}catch{return {};}
}
export async function autoSheetTop10(admin,tier){
 if(tier!==2)throw Error('VI13_LEVEL');
 const s=await readVI13Sheet(admin),ids=s.rows.slice(0,10).map(r=>r.school_id);
 return publicVI13Top10(s,automaticVI13Values(s,ids,await checksFor(admin,s,ids,tier),tier));
}
