// Private Sheets reader for the existing level API. No credentials or private rows in the client.
// Activation is explicit; all failed reads leave the existing manual ranking available.
const TAB='VI13_자동동기화';
export const METHOD='VERTICAL_EXACT_VI13_MIN9_A4_P2_R1_V1';
const HEADER=['school_id','school_name','region','percentile','rank','observations','sum_units','flags'];
const MAX_AGE_MS=48*60*60*1000;
const ID=/^[A-Z0-9]{7}$/;
const integer=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
export function parseVI13Sheet(values,now=Date.now()){
 if(!Array.isArray(values)||values.length<574||values.length>10002)throw Error('VI13_SHEET_SIZE');
 const [meta,header,...data]=values;
 if(!Array.isArray(meta)||meta[0]!=='VI13_SYNC_V1'||meta[4]!==METHOD||meta[6]!=='PRIVATE'||
  !integer(meta[2],572,10000)||meta[2]!==data.length||!integer(meta[3],1,50000)||
  !integer(meta[5],meta[3],50000)||!HEADER.every((h,i)=>header?.[i]===h))throw Error('VI13_SHEET_SCHEMA');
 const verification=parseSourceRecheck(meta[7],meta);
 const stamp=Date.parse(meta[1]);
 if(!Number.isFinite(stamp)||stamp>now+60000||now-stamp>MAX_AGE_MS)throw Error('VI13_SHEET_STALE');
 let total=0,prev=null;const seen=new Set(),rows=[];
 for(let i=0;i<data.length;i++){
  const [rawId,name,region,percentile,rank,n,sum,flags]=data[i];
  // Sheets may coerce seven-digit IDs to numbers. Never pad, round or guess an ID.
  const id=typeof rawId==='number'&&Number.isSafeInteger(rawId)?String(rawId):rawId;
  if(typeof id!=='string'||!ID.test(id)||seen.has(id)||typeof name!=='string'||!name.trim()||name.length>120||
   typeof region!=='string'||!region.trim()||region.length>100||typeof percentile!=='number'||!Number.isFinite(percentile)||
   percentile<0||percentile>100||!integer(rank,1,data.length)||!integer(n,1,50000)||
   !integer(sum,0,n*360360*100)||!integer(flags,0,n))throw Error('VI13_SHEET_ROW');
  const row={school_id:id,school_name:name,region,percentile,rank,observations:n,sum_units:sum,flags};
  if(prev){
   const a=BigInt(prev.sum_units)*BigInt(n),b=BigInt(sum)*BigInt(prev.observations);
   if(a>b||rank!==(a===b?prev.rank:i+1)||percentile>prev.percentile||
     (a===b&&(percentile!==prev.percentile||prev.school_id.localeCompare(id)>=0)))throw Error('VI13_SHEET_ORDER');
  }else if(rank!==1)throw Error('VI13_SHEET_ORDER');
  total+=n;seen.add(id);rows.push(row);prev=row;
 }
 if(total!==meta[3])throw Error('VI13_SHEET_TOTAL');
 for(let i=0;i<rows.length;){let j=i+1;while(j<rows.length&&rows[j].rank===rows[i].rank)j++;
  const exact=Math.round(1000*(rows.length-j)/(rows.length-1))/10;
  for(let k=i;k<j;k++)if(rows[k].percentile!==exact)throw Error('VI13_SHEET_PERCENTILE');i=j;
 }
 if(verification&&verification.extremeIds.some(id=>!seen.has(id)))throw Error('VI13_RECHECK_IDS');
 return {day:new Date(stamp+9*3600000).toISOString().slice(0,10),generatedAt:meta[1],rows,verification};
}
// Existing owner-approved values remain the permission gate. Changed/unapproved values
// are not substituted; both search and detail see the exact same sheet number.
export function permittedVI13Values(snapshot,ids,approved){
 const lookup=new Map(snapshot.rows.map(r=>[r.school_id,r.percentile])),out={};
 for(const id of ids)if(Object.hasOwn(approved,id)&&lookup.has(id)&&approved[id]===lookup.get(id))out[id]=lookup.get(id);
 return out;
}
export function publicVI13Top10(snapshot,approved){
 const top=snapshot.rows.slice(0,10);
 if(top.length!==10||top.some(r=>!Object.hasOwn(approved,r.school_id)||approved[r.school_id]!==r.percentile))
  throw Error('VI13_TOP10_APPROVAL_PENDING');
 return {day:snapshot.day,generatedAt:snapshot.generatedAt,rows:top.map(({school_id,school_name,region,rank})=>({school_id,school_name,region,rank}))};
}
// Existing ingest endpoint stores a private, validated aggregate snapshot; no Google credentials.
export function vi13SheetEnabled(){return Deno.env.get('BEAGU_VI13_SHEET_SYNC_ENABLED')==='1';}
export async function readVI13Sheet(admin){
 if(!vi13SheetEnabled())throw Error('VI13_SYNC_DISABLED');
 const {data,error}=await admin.rpc('beagu_2026_vi13_sheet_read_v1');
 if(error||!data)throw Error('VI13_SNAPSHOT_UNAVAILABLE');
 return parseVI13Sheet(data);
}
export function validateVI13Push(payload,now=Date.now()){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).sort().join(',')!=='kind,values'||payload.kind!=='VI13_SHEET_PUSH_V1')throw Error('VI13_PUSH_SCHEMA');
 const snapshot=parseVI13Sheet(payload.values,now);
 if(snapshot.rows.length<604||snapshot.rows.reduce((n,r)=>n+r.observations,0)<724)throw Error('VI13_BASELINE_REGRESSION');
 // Canonicalize IDs and reject extra cell data before persistence.
 const [m,h,...r]=payload.values;
 if(m.length>8||h.length!==8||r.some(row=>row.length!==8))throw Error('VI13_PUSH_SCHEMA');
 return [[m[0],m[1],m[2],m[3],m[4],m[5],m[6],snapshot.verification?JSON.stringify(snapshot.verification):'' ],HEADER,...snapshot.rows.map(x=>[x.school_id,x.school_name,x.region,x.percentile,x.rank,x.observations,x.sum_units,x.flags])];
}

// Metadata is emitted only by the authenticated source-side second pass; never by browsers.
// It is stored atomically with the existing snapshot and contains no raw response values.
export function parseSourceRecheck(raw,meta){
 if(raw===undefined||raw===null||raw==='')return null;
 if(typeof raw!=='string'||raw.length>120000)throw Error('VI13_RECHECK_FORMAT');
 const v=JSON.parse(raw);
 if(!v||Array.isArray(v)||Object.keys(v).sort().join(',')!=='extremeIds,observations,schools,source,sourceRows,version'||
 v.version!=='VI13_SOURCE_RECHECK_V1'||v.source!=='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'||
 v.sourceRows!==meta[5]||v.schools!==meta[2]||v.observations!==meta[3]||!Array.isArray(v.extremeIds)||
 v.extremeIds.length>meta[2]||new Set(v.extremeIds).size!==v.extremeIds.length||v.extremeIds.some(id=>typeof id!=='string'||!ID.test(id)))throw Error('VI13_RECHECK_SCHEMA');
 return v;
}
