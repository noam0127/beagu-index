// Strict approved snapshot projection. Never infer publication from count or flags.
import {vi13SheetEnabled,readVI13Sheet,permittedVI13Values,publicVI13Top10} from './vi13-sheet-sync.mjs';
export {vi13SheetEnabled,readVI13Sheet};
async function approvals(admin,ids){
 const {data,error}=await admin.rpc('beagu_2026_percentile_v13_values',{p_ids:ids,p_level:2});
 if(error||!data||typeof data!=='object'||Array.isArray(data))throw Error('VI13_APPROVAL_UNAVAILABLE');
 // Optional auto-opening RPC has its own exact evidence/hold/decision gates.
 // Missing RPC does not authorize anything. Explicit decisions take precedence.
 const auto=await admin.rpc('beagu_2026_auto_percentiles',{p_ids:ids,p_level:2});
 return {...(!auto.error&&auto.data&&typeof auto.data==='object'&&!Array.isArray(auto.data)?auto.data:{}),...data};
}
export async function approvedSheetValues(admin,ids){
 try{const s=await readVI13Sheet(admin);return permittedVI13Values(s,ids,await approvals(admin,ids));}
 catch{return {};}
}
export async function approvedSheetTop10(admin){
 const s=await readVI13Sheet(admin),ids=s.rows.slice(0,10).map(r=>r.school_id);
 return publicVI13Top10(s,await approvals(admin,ids));
}
