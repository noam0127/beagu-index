import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import {validateVI13Push,parseVI13Sheet,verifySourceRecheckDigest} from '../_shared/vi13-sheet-sync.mjs';
import {validateSnapshot} from '../_shared/results-2026.mjs';
const send=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return send(405,{error:'METHOD_NOT_ALLOWED'});
  const expected=Deno.env.get('BEAGU_2026_INGEST_TOKEN')||'',supplied=req.headers.get('X-Beagu-Ingest-Token')||'';
  if(expected.length<32)return send(503,{error:'INGEST_NOT_CONFIGURED'});
  if(supplied.length<32||supplied.length>300)return send(401,{error:'UNAUTHORIZED'});
  const a=await digest(expected),b=await digest(supplied);let diff=0;
  for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  if(diff)return send(401,{error:'UNAUTHORIZED'});
  try{
    const reader=req.body?.getReader();if(!reader)return send(400,{error:'MISSING_BODY'});
    let bytes=0,raw='';const decoder=new TextDecoder();
    for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
      if(bytes>32*1024*1024){await reader.cancel();return send(413,{error:'PAYLOAD_TOO_LARGE'});}
      raw+=decoder.decode(part.value,{stream:true});}
    const parsed=JSON.parse(raw+decoder.decode());
    if(parsed?.kind==='VI13_SHEET_PUSH_V1'){
      if(bytes>4*1024*1024)return send(413,{error:'VI13_PAYLOAD_TOO_LARGE'});
      const values=validateVI13Push(parsed);
      await verifySourceRecheckDigest(parseVI13Sheet(values));
      const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data,error}=await admin.rpc('beagu_2026_vi13_sheet_store_v1',{p_values:values});
      if(error)return send(409,{error:'VI13_SNAPSHOT_NOT_ACCEPTED'});
      return send(200,{ok:true,kind:'VI13_SHEET_PUSH_V1',schools:values[0][2],observations:values[0][3],stored:data===true});
    }
    const data=validateSnapshot(parsed);
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:result,error}=await admin.rpc('beagu_2026_replace_results_snapshot',{p_snapshot:data});
    if(error)return send(409,{error:'SNAPSHOT_NOT_ACCEPTED'});
    return send(200,{ok:true,schools:result});
  }catch{return send(400,{error:'INVALID_AGGREGATE_SNAPSHOT'});}
});
