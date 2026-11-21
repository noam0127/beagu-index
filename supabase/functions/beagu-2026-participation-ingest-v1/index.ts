import {createClient} from "npm:@supabase/supabase-js@2.57.0";

// Stage 17 DRAFT: trusted 2026 Google Forms / Apps Script ingestion ONLY.
// Never deploy before validating the actual form visitor-ID attribution,
// source-row quality workflow, secrets and isolated DB backup/restore.
// A challenge badge, issued code or browser handoff is NOT survey evidence.
const endpoint=Deno.env.get("SUPABASE_URL")||"";
const roleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const receiptKey=Deno.env.get("BEAGU_2026_PARTICIPATION_INGEST_SECRET")||"";
const enabled=Deno.env.get("BEAGU_2026_PARTICIPATION_INGEST_ENABLED")==="true";
const db=endpoint&&roleKey?createClient(endpoint,roleKey,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
}):null;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record=/^[A-Za-z0-9_-]{12,128}$/;
const enc=new TextEncoder();
function answer(status:number,body:Record<string,unknown>){
 return new Response(JSON.stringify(body),{status,headers:{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"private, no-store",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff"
 }});
}
async function digest(value:string){
 return new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value)));
}
async function validSecret(provided:string){
 if(!provided||provided.length<32||provided.length>256||receiptKey.length<32)
  return false;
 // Both sides are compared in fixed-time byte loops, never via early exit.
 const [x,y]=await Promise.all([digest(provided),digest(receiptKey)]);
 let diff=0;
 for(let i=0;i<32;i++)diff|=x[i]^y[i];
 return diff===0;
}
async function hmacSource(sourceRowId:string){
 const key=await crypto.subtle.importKey(
  "raw",enc.encode(receiptKey),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const mac=await crypto.subtle.sign("HMAC",key,
  enc.encode("BEAGU_2026_VERIFIED_FORM_RESPONSE_V1|"+sourceRowId));
 return Array.from(new Uint8Array(mac),
  b=>b.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return answer(405,{ok:false,error:"METHOD_NOT_ALLOWED"});
 // This is server-to-server only: no browser CORS and no public OPTIONS.
 if(req.headers.has("origin"))return answer(403,{ok:false,error:"BROWSER_NOT_ALLOWED"});
 if(!db||!enabled||receiptKey.length<32)return answer(503,{ok:false,error:"INGEST_DISABLED"});
 const given=req.headers.get("X-Beagu-Verified-2026-Ingest")||"";
 if(!await validSecret(given))return answer(401,{ok:false,error:"AUTH_REQUIRED"});
 if(Number(req.headers.get("content-length")||0)>1024)
  return answer(413,{ok:false,error:"TOO_LARGE"});
 let raw="";
 try{
  const rdr=req.body?.getReader();if(!rdr)throw Error();
  let bytes=0;const dec=new TextDecoder();
  for(;;){
   const {done,value}=await rdr.read();if(done)break;
   bytes+=value?.byteLength||0;
   if(bytes>1024){await rdr.cancel();return answer(413,{ok:false,error:"TOO_LARGE"})}
   raw+=dec.decode(value,{stream:true});
  }
  raw+=dec.decode();
 }catch{return answer(400,{ok:false,error:"INVALID_JSON"})}
 let body:Record<string,unknown>;
 try{
  const x=JSON.parse(raw);
  if(!x||typeof x!=="object"||Array.isArray(x))throw Error();
  body=x as Record<string,unknown>;
 }catch{return answer(400,{ok:false,error:"INVALID_JSON"})}
 const visitor=typeof body.visitor==="string"?body.visitor.toLowerCase():"";
 const sourceRowId=typeof body.sourceRowId==="string"?body.sourceRowId:"";
 const when=typeof body.submittedAt==="string"?Date.parse(body.submittedAt):NaN;
 const decision=body.decision;
 if(body.surveyYear!==2026||!uuid.test(visitor)||
   !record.test(sourceRowId)||!Number.isFinite(when)||
   when<Date.parse("2026-01-01T00:00:00Z")||when>Date.now()+5*60*1000||
   !["approved","revoked","review_required"].includes(String(decision))||
   body.formSubmitted!==true||body.sourceValidated!==true)
  return answer(400,{ok:false,error:"SOURCE_NOT_VERIFIED"});
 // The trusted Google Forms worker validates actual submitted 2026 source
 // and quality before sending. A flag from a browser is NEVER accepted.
 const {data,error}=await db.rpc("beagu_2026_record_verified_response_v1",{
  p_visitor:visitor,
  p_evidence_hmac:await hmacSource(sourceRowId),
  p_verified_at:new Date(when).toISOString(),
  p_status:decision
 });
 if(error)return answer(503,{ok:false,error:"INGEST_UNAVAILABLE"});
 if(data?.ok!==true){
  const code=data?.code;
  return answer(code==="UNKNOWN_VISITOR"?409:400,
   {ok:false,error:code==="UNKNOWN_VISITOR"?"VISITOR_NOT_ISSUED":"SOURCE_REJECTED"});
 }
 // No identifying survey value, source row, code, hash, email or phone returned.
 return answer(200,{ok:true,status:data.status,duplicate:data.duplicate===true});
});
