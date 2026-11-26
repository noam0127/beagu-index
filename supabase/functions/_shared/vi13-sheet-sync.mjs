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
 return {day:new Date(stamp+9*3600000).toISOString().slice(0,10),generatedAt:meta[1],rows};
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
const encode=new TextEncoder();
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const jwtPart=obj=>b64url(encode.encode(JSON.stringify(obj)));
let tokenCache=null,snapshotCache=null,flight=null;
export function vi13SheetEnabled(){return Deno.env.get('BEAGU_VI13_SHEET_SYNC_ENABLED')==='1';}
async function accessToken(account){
 const now=Math.floor(Date.now()/1000);
 if(tokenCache&&tokenCache.email===account.client_email&&tokenCache.until>now+60)return tokenCache.token;
 if(typeof account.client_email!=='string'||!account.client_email.endsWith('.gserviceaccount.com')||
  typeof account.private_key!=='string'||!account.private_key.includes('BEGIN PRIVATE KEY'))throw Error('VI13_GOOGLE_CONFIG');
 const audience='https://oauth2.googleapis.com/token';
 const unsigned=jwtPart({alg:'RS256',typ:'JWT'})+'.'+jwtPart({iss:account.client_email,
  scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:audience,iat:now,exp:now+3600});
 const pem=account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
 const pk=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',pk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const sig=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encode.encode(unsigned)));
 const r=await fetch(audience,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+b64url(sig)}),
  signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('VI13_GOOGLE_AUTH');
 const data=await r.json();
 if(typeof data.access_token!=='string'||!integer(data.expires_in,60,7200))throw Error('VI13_GOOGLE_AUTH');
 tokenCache={email:account.client_email,token:data.access_token,until:now+data.expires_in};
 return data.access_token;
}
export async function readVI13Sheet(){
 if(!vi13SheetEnabled())throw Error('VI13_SYNC_DISABLED');
 const now=Date.now();
 if(snapshotCache&&now-snapshotCache.loadedAt<300000)return snapshotCache.data;
 if(flight)return await flight;
 flight=(async()=>{
  const workbook=Deno.env.get('BEAGU_VI13_PRIVATE_WORKBOOK_ID')||'';
  if(!/^[A-Za-z0-9_-]{25,100}$/.test(workbook))throw Error('VI13_GOOGLE_CONFIG');
  const account=JSON.parse(Deno.env.get('BEAGU_VI13_SHEETS_SERVICE_ACCOUNT_JSON')||'{}');
  const token=await accessToken(account);
  const range=encodeURIComponent("'"+TAB+"'!A1:H10002");
  const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+workbook+'/values/'+range+'?valueRenderOption=UNFORMATTED_VALUE',
   {headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('VI13_GOOGLE_READ');
  const body=await r.json(),data=parseVI13Sheet(body.values);
  snapshotCache={loadedAt:Date.now(),data};return data;
 })();
 try{return await flight;}finally{flight=null;}
}
