import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const sourceId='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4';
const send=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
   'X-Content-Type-Options':'nosniff'}});
const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const equal=(a:Uint8Array,b:Uint8Array)=>{
  if(a.length!==b.length)return false;
  let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
  return mismatch===0;
};
const qids=Array.from({length:13},(_,i)=>'Q'+String(i+1).padStart(2,'0'));
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return send(405,{error:'METHOD_NOT_ALLOWED'});
  const expected=Deno.env.get('BEAGU_2026_INGEST_TOKEN')||'';
  if(expected.length<32)return send(503,{error:'INGEST_NOT_CONFIGURED'});
  const supplied=req.headers.get('X-Beagu-Ingest-Token')||'';
  if(supplied.length<32||supplied.length>300||
     !(await equal(await digest(supplied),await digest(expected))))
    return send(401,{error:'UNAUTHORIZED'});
  let raw='',bytes=0;
  try{
    const reader=req.body?.getReader();if(!reader)return send(400,{error:'MISSING_BODY'});
    const decoder=new TextDecoder();
    for(;;){
      const part=await reader.read();if(part.done)break;
      bytes+=part.value.byteLength;
      if(bytes>65536){await reader.cancel();return send(413,{error:'PAYLOAD_TOO_LARGE'});}
      raw+=decoder.decode(part.value,{stream:true});
    }
    raw+=decoder.decode();
  }catch{return send(400,{error:'INVALID_BODY'});}
  let data:Record<string,any>;
  try{data=JSON.parse(raw);}catch{return send(400,{error:'INVALID_JSON'});}
  const items=data?.schools;
  if(!data||Array.isArray(data)||data.source_spreadsheet_id!==sourceId||
     data.official_start_day!=='2026-11-01'||
     !Array.isArray(items)||items.length<1||items.length>60)
     return send(400,{error:'INVALID_BATCH_OR_SOURCE'});
  const unique=new Set<string>();
  const verified:Array<Record<string,unknown>>=[];
  for(const s of items){
    const id=s?.school_id,n=s?.school_response_rows,c=s?.core_valid_counts;
    if(!s||typeof s!=='object'||Array.isArray(s)||typeof id!=='string'||
       !/^[A-Z0-9]{7}$/.test(id)||unique.has(id)||
       !Number.isSafeInteger(n)||n<1||n>50000||
       !['EXACT_REGION_OFFICE_NAME','NEEDS_REVIEW'].includes(s.school_match_status)||
       !c||typeof c!=='object'||Array.isArray(c)||
       Object.keys(c).length!==13||
       !qids.every(q=>Object.hasOwn(c,q)&&Number.isSafeInteger(c[q])&&c[q]>=0&&c[q]<=n))
      return send(400,{error:'INVALID_SCHOOL_AGGREGATE'});
    unique.add(id);
    verified.push({
      source_spreadsheet_id:sourceId,school_id:id,survey_year:2026,
      school_response_rows:n,school_match_status:s.school_match_status,
      core_valid_counts:Object.fromEntries(qids.map(q=>[q,c[q]])),
      updated_at:new Date().toISOString()
    });
  }
  try{
    const url=Deno.env.get('SUPABASE_URL')||'';
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    if(!url||!key)return send(503,{error:'DATABASE_NOT_CONFIGURED'});
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {error}=await admin.from('beagu_2026_qa_ingest_staging')
      .upsert(verified,{onConflict:'source_spreadsheet_id,school_id'});
    if(error)return send(503,{error:'PRIVATE_STAGING_UNAVAILABLE'});
    return send(200,{ok:true,accepted:verified.length});
  }catch{
    return send(500,{error:'INTERNAL_ERROR'});
  }
});
