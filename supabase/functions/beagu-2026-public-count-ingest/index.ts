import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
const sourceId='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4';
const table='beagu_2026_public_progress';
const send=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const equal=(a:Uint8Array,b:Uint8Array)=>{
  if(a.length!==b.length)return false;
  let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=(a[i]^b[i]);
  return mismatch===0;
};
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST'&&req.method!=='GET')return send(405,{error:'METHOD_NOT_ALLOWED'});
  const expected=Deno.env.get('BEAGU_2026_INGEST_TOKEN')||'';
  if(expected.length<32)return send(503,{error:'INGEST_NOT_CONFIGURED'});
  const given=req.headers.get('X-Beagu-Ingest-Token')||'';
  if(given.length<32||given.length>300||!await equal(await digest(given),await digest(expected)))
    return send(401,{error:'UNAUTHORIZED'});
  if(req.method==='GET'){
    // Historical school identities are returned ONLY to the authenticated private
    // Google Apps Script, never to a browser. No 2026 school names are uploaded.
    try{
      const url=Deno.env.get('SUPABASE_URL')||'';
      const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
      if(!url||!serviceKey)return send(503,{error:'DATABASE_NOT_CONFIGURED'});
      const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const schoolIds=new Set<string>();
      const unresolved:Array<{school_name:string,sido:string,support_office:string}>=[];
      let completed=false;
      for(let offset=0;offset<10000;offset+=1000){
        const {data,error}=await admin.from('beagu_edited_school_rows')
          .select('school_id,original_school_name,original_sido,original_support_office')
          .gte('survey_year',2023).lte('survey_year',2025)
          .order('survey_year',{ascending:true}).order('source_row',{ascending:true})
          .range(offset,offset+999);
        if(error||!data)return send(503,{error:'HISTORY_LOOKUP_FAILED'});
        for(const row of data){
          const id=String(row.school_id||'').trim();
          if(id)schoolIds.add(id);
          else unresolved.push({
            school_name:String(row.original_school_name||''),
            sido:String(row.original_sido||''),
            support_office:String(row.original_support_office||'')
          });
        }
        if(data.length<1000){completed=true;break;}
      }
      if(!completed)return send(503,{error:'HISTORY_TOO_LARGE'});
      return send(200,{school_ids:[...schoolIds],unresolved});
    }catch{return send(500,{error:'HISTORY_INTERNAL_ERROR'});}
  }
  let raw='';let bytes=0;
  try{
    const reader=req.body?.getReader();if(!reader)return send(400,{error:'MISSING_BODY'});
    const decoder=new TextDecoder();
    for(;;){
      const part=await reader.read();if(part.done)break;
      bytes+=part.value.byteLength;if(bytes>768)return send(413,{error:'TOO_LARGE'});
      raw+=decoder.decode(part.value,{stream:true});
    }
    raw+=decoder.decode();
  }catch{return send(400,{error:'INVALID_BODY'});}
  let body:any;
  try{body=JSON.parse(raw);}catch{return send(400,{error:'INVALID_JSON'});}
  if(!body||Array.isArray(body)||typeof body!=='object'||body.source_spreadsheet_id!==sourceId||
    body.first_official_day!=='2026-11-01'||
    !Number.isSafeInteger(body.official_submission_rows)||body.official_submission_rows<0||
    body.official_submission_rows>50000)
    return send(400,{error:'INVALID_COUNT_OR_SOURCE'});
  const hasSchoolCount=Object.prototype.hasOwnProperty.call(body,'new_unique_schools');
  if(hasSchoolCount&&(!Number.isSafeInteger(body.new_unique_schools)||
    body.new_unique_schools<0||body.new_unique_schools>body.official_submission_rows))
    return send(400,{error:'INVALID_NEW_SCHOOL_COUNT'});
  try{
    const url=Deno.env.get('SUPABASE_URL')||'';
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    if(!url||!serviceKey)return send(503,{error:'DATABASE_NOT_CONFIGURED'});
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {error}=await admin.from(table).upsert({
      id:1,official_submission_rows:body.official_submission_rows,
      source_spreadsheet_id:sourceId,refreshed_at:new Date().toISOString(),
      publish_policy:'national_cumulative_counts_only_v2',
      ...(hasSchoolCount?{new_unique_schools:body.new_unique_schools}:{})
    },{onConflict:'id'});
    if(error)return send(503,{error:'STORAGE_ERROR'});
    const {data:current,error:readError}=await admin.from(table)
      .select('official_submission_rows,new_unique_schools').eq('id',1).single();
    if(readError||!current)return send(503,{error:'STORAGE_READ_ERROR'});
    const {error:totalsError}=await admin.from('beagu_home_cumulative_stats').upsert({
      id:1,total_responses:18797+current.official_submission_rows,
      total_schools:4177+current.new_unique_schools,
      updated_at:new Date().toISOString()
    },{onConflict:'id'});
    if(totalsError)return send(503,{error:'TOTALS_STORAGE_ERROR'});
    return send(200,{ok:true});
  }catch{
    return send(500,{error:'INTERNAL_ERROR'});
  }
});
