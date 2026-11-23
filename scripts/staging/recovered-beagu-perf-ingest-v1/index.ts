/** STAGING-ONLY non-identifying page performance sampling gateway.
 *  Only a bounded anonymous telemetry envelope is accepted.
 *  Never deploy this standalone QA source on an operating Supabase project.
 *  The private RPC remains server_role-only, and has a global 10k/hour cap.
 */
const STAGE_URL='https://ycwuugggqbunlbwuzvbx.supabase.co';
const url=Deno.env.get('SUPABASE_URL')||'';
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const exactRender=Deno.env.get('BEAGU_STAGING_ALLOWED_ORIGIN')||'';
const renderPattern=/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.onrender\.com$/;
const localhost=new Set([
 'http://localhost:8000','http://127.0.0.1:8000',
 'http://localhost:8123','http://127.0.0.1:8123'
]);
const allowedOrigin=(origin:string)=>url===STAGE_URL && (
 localhost.has(origin) || (origin===exactRender && renderPattern.test(exactRender))
);
const cors=(origin:string)=>({
 ...(allowedOrigin(origin)?{'Access-Control-Allow-Origin':origin}:{}),
 'Access-Control-Allow-Headers':'content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Cache-Control':'private,no-store',
 'Content-Security-Policy':"default-src 'none'",
 'X-Content-Type-Options':'nosniff',
 'Vary':'Origin'
});
const reply=(origin:string,status:number,payload:Record<string,unknown>)=>
 new Response(JSON.stringify(payload),{
   status,headers:{...cors(origin),'Content-Type':'application/json;charset=utf-8'}
 });
const visitorV4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pages=new Set(['index','search','search-lv1','statistics','school-report',
  'result','challenge','volleyball','teacher-run']);
const ops=new Set(['navigation','school_search','school_selection','compare_directory']);
const valid=(b:Record<string,unknown>)=>{
 if(typeof b.visitor!=='string'||!visitorV4.test(b.visitor)||
   typeof b.page!=='string'||!pages.has(b.page)||
   typeof b.operation!=='string'||!ops.has(b.operation)||
   typeof b.duration_ms!=='number'||!Number.isInteger(b.duration_ms)||
   b.duration_ms<1||b.duration_ms>120000||typeof b.ok!=='boolean')return false;
 if(b.operation==='school_selection'&&!['volleyball','teacher-run'].includes(b.page))return false;
 if(b.operation==='compare_directory'&&b.page!=='statistics')return false;
 if(b.operation==='school_search'&&!['search','search-lv1','volleyball','teacher-run'].includes(b.page))return false;
 return true;
};
Deno.serve(async(request:Request)=>{
 const origin=request.headers.get('origin')||'';
 if(url!==STAGE_URL||secret.length<32)
   return reply(origin,503,{error:'STAGING_PROJECT_ONLY'});
 if(!allowedOrigin(origin))
   return reply(origin,403,{error:'ORIGIN_NOT_ALLOWED'});
 if(request.method==='OPTIONS')
   return new Response(null,{status:204,headers:cors(origin)});
 if(request.method!=='POST')
   return reply(origin,405,{error:'METHOD_NOT_ALLOWED'});
 // The browser sender should be unauthenticated. An access JWT is neither
 // necessary nor forwarded to the server_role RPC; do not mix admin sessions.
 if(request.headers.has('authorization'))
   return reply(origin,403,{error:'IDENTITY_BEARER_NOT_ACCEPTED'});
 const len=Number(request.headers.get('content-length')||0);
 if(!Number.isFinite(len)||len>512)
   return reply(origin,413,{error:'TOO_LARGE'});
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))
   return reply(origin,415,{error:'JSON_REQUIRED'});
 let body:Record<string,unknown>;
 try{
   const raw=await request.text();
   if(raw.length>512)throw Error('large');
   const parsed=JSON.parse(raw);
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('shape');
   body=parsed;
 }catch{return reply(origin,400,{error:'INVALID_JSON'});}
 if(!valid(body))return reply(origin,400,{error:'INVALID_SAMPLE'});
 const safe={
   p_visitor:body.visitor,
   p_page:body.page,
   p_operation:body.operation,
   p_duration_ms:body.duration_ms,
   p_ok:body.ok
 };
 try{
   const response=await fetch(url+'/rest/v1/rpc/beagu_perf_record_v1',{
     method:'POST',
     headers:{
       'apikey':secret,
       'authorization':'Bearer '+secret,
       'content-type':'application/json'
     },
     body:JSON.stringify(safe),
     signal:AbortSignal.timeout(5000)
   });
   if(!response.ok){
     console.error('stage_perf_rpc_failed',response.status);
     return reply(origin,503,{error:'SAMPLE_UNAVAILABLE'});
   }
   const accepted=await response.json();
   if(typeof accepted!=='boolean')
     return reply(origin,503,{error:'SAMPLE_UNAVAILABLE'});
   // No visitor UUID, personal data, raw duration, IP, URL or source IDs echoed.
   return reply(origin,200,{ok:true,accepted});
 }catch(error){
   console.error('stage_perf_gateway_unavailable',error instanceof Error?error.name:'unknown');
   return reply(origin,503,{error:'SAMPLE_UNAVAILABLE'});
 }
});
