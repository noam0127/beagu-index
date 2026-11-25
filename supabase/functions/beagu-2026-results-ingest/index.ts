import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import {validateSnapshot} from '../_shared/results-2026.mjs';
import {validateWaterwayRun} from '../_shared/waterway-run-v1.mjs';
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
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    if(parsed?.kind==='WATERWAY_RUN_V1'){
      if(bytes>8192)return send(413,{error:'HEARTBEAT_TOO_LARGE'});
      const data=validateWaterwayRun(parsed);
      const {error}=await admin.rpc('beagu_2026_waterway_record_run_v1',{p_run:data});
      if(error)return send(503,{error:'HEARTBEAT_NOT_ACCEPTED'});
      return send(200,{ok:true,kind:'WATERWAY_RUN_V1'});
    }
    if(parsed?.kind==='VI13_REAGGREGATE_V1'){
      const {data,error}=await admin.rpc('beagu_2026_vi13_stage',{p_payload:parsed});
      return error?send(409,{error:'VI13_STAGE_REJECTED'}):send(200,data);
    }
    const data=validateSnapshot(parsed);
    const {data:result,error}=await admin.rpc('beagu_2026_replace_results_snapshot',{p_snapshot:data});
    if(error)return send(409,{error:'SNAPSHOT_NOT_ACCEPTED'});
    return send(200,{ok:true,schools:result});
  }catch{return send(400,{error:'INVALID_AGGREGATE_SNAPSHOT'});}
});
