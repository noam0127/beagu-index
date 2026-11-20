import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
// Server-to-server endpoint: ONLY a Google Apps Script installable form-submit
// trigger may send validated form-response metadata to this function.
// Only derived core-answer completeness and response-pattern flags may be
// accepted. No raw school answers, names, emails, free text, or IPs.
const url=Deno.env.get('SUPABASE_URL')!;
const dbKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const hmacKey=Deno.env.get('BEAGU_REFERRAL_HMAC_KEY')||'';
const ingestKey=Deno.env.get('BEAGU_REFERRAL_INGEST_SECRET')||'';
const db=createClient(url,dbKey,{auth:{persistSession:false,autoRefreshToken:false}});
const enc=new TextEncoder();
const hex=(bytes:Uint8Array)=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const proofPattern=/^BR1\.([a-f0-9]{64})\.([a-f0-9-]{36})\.(\d{10})\.([a-f0-9]{64})$/;
const eventPattern=/^[A-Za-z0-9_-]{8,180}$/;
const response=(status:number,data:unknown)=>new Response(JSON.stringify(data),{
  status,headers:{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
async function sha(s:string){return new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)));}
async function hmac(s:string) {
  const key=await crypto.subtle.importKey('raw',enc.encode(hmacKey),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(s))));
}
async function matches(a:string,b:string) {
  // Check a fixed 32-byte digest without secret-dependent early exits.
  const [left,right]=await Promise.all([sha(a),sha(b)]);
  let mismatch=0;
  for(let i=0;i<32;i++)mismatch|=left[i]^right[i];
  return mismatch===0;
}
Deno.serve(async req=>{
  if(req.method!=='POST')return response(405,{error:'METHOD_NOT_ALLOWED'});
  // Credentials can be checked with a read-only preflight even while live credit
  // remains disabled. This lets the Form owner verify the shared secret safely.
  if(hmacKey.length<32 || ingestKey.length<32)
    return response(503,{error:'REFERRAL_SECRETS_UNAVAILABLE'});
  if((Number(req.headers.get('content-length'))||0)>2048)
    return response(413,{error:'TOO_LARGE'});
  const provided=req.headers.get('X-Beagu-Referral-Ingest-Token')||'';
  if(provided.length<32 || provided.length>256 || !await matches(provided,ingestKey)){
    // Private operational diagnostics. Never log the secret itself, its digest,
    // any request payload, headers, personally identifying data, or school answers.
    console.warn('beagu_referral_ingest_auth_diagnostic',JSON.stringify({
      headerPresent:provided.length>0,
      providedLength:provided.length,
      serverLength:ingestKey.length,
      providedHex64:/^[0-9a-f]{64}$/i.test(provided),
      serverHex64:/^[0-9a-f]{64}$/i.test(ingestKey),
      providedNoOuterWhitespace:provided===provided.trim(),
      serverNoOuterWhitespace:ingestKey===ingestKey.trim(),
    }));
    return response(401,{error:'AUTH_REQUIRED'});
  }
  let body:Record<string,unknown>;
  try{
    const raw=await req.text();
    if(enc.encode(raw).byteLength>2048)return response(413,{error:'TOO_LARGE'});
    body=JSON.parse(raw);
  }catch{return response(400,{error:'INVALID_JSON'});}
  // Strictly authenticated and side-effect free. Preflight never touches
  // beagu_referral_credit or accepts teacher answers.
  if(body && !Array.isArray(body) && typeof body==='object' &&
     body.action==='preflight' && Object.keys(body).length===1)
    return response(200,{
      ok:true,checks:'secrets_match_and_signature_key_present',
      enabled:Deno.env.get('BEAGU_REFERRAL_INGEST_ENABLED')==='true',
    });
  if(Deno.env.get('BEAGU_REFERRAL_INGEST_ENABLED')!=='true')
    return response(503,{error:'REFERRAL_INGEST_NOT_READY'});
  if(!body || typeof body!=='object' || Array.isArray(body) ||
     body.sourceSpreadsheetId!=='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4' ||
     typeof body.formResponseId!=='string' || !eventPattern.test(body.formResponseId) ||
     typeof body.submittedAt!=='string' || typeof body.proof!=='string' ||
     body.proof.length>300)
    return response(400,{error:'INVALID_SUBMISSION'});
  const m=proofPattern.exec(body.proof);
  if(!m||!uuid.test(m[2]))return response(422,{error:'INVALID_PROOF'});
  const [ ,ref,respondent,expiresString,signature]=m;
  const exp=Number(expiresString);
  const submittedAt=Date.parse(body.submittedAt);
  const now=Date.now();
  const officialStart=Date.parse('2026-11-01T00:00:00+09:00');
  if(!Number.isSafeInteger(exp) || !Number.isFinite(submittedAt) ||
     submittedAt<officialStart || submittedAt>now+5*60*1000 ||
     submittedAt<((exp-24*60*60)*1000-5*60*1000) || submittedAt>exp*1000)
    return response(422,{error:'PROOF_OUT_OF_WINDOW'});
  const unsigned='BR1.'+ref+'.'+respondent+'.'+expiresString;
  try{
    const signed=await hmac('BEAGU_REFERRAL_CHECKIN_V1|'+unsigned);
    if(!await matches(signature,signed))
      return response(422,{error:'INVALID_PROOF'});
    // HMAC hashes are domain-separated and private. Never persist raw
    // response IDs, raw referral URLs, or respondent identifiers.
    const [eventHash,respondentHash]=await Promise.all([
      hmac('BEAGU_REFERRAL_EVENT_V1|'+body.formResponseId),
      hmac('BEAGU_REFERRAL_RESPONDENT_V1|'+respondent.toLowerCase()),
    ]);
    const refHash=hex(await sha(ref));
    // Only the owner-installed Google Forms trigger can submit these summary
    // quality signals. Missing metrics fail closed instead of assuming clean.
    const quality=body.qualitySignals;
    if(quality!==undefined && (
       !quality || typeof quality!=='object'||Array.isArray(quality)||
       !Number.isSafeInteger((quality as Record<string,unknown>).coreAnswered)||
       Number((quality as Record<string,unknown>).coreAnswered)<0||
       Number((quality as Record<string,unknown>).coreAnswered)>13||
       typeof (quality as Record<string,unknown>).straightline!=='boolean'
    ))return response(400,{error:'INVALID_QUALITY_SIGNALS'});
    const coreAnswered=quality ? (quality as Record<string,unknown>).coreAnswered as number : null;
    const straightline=quality ? (quality as Record<string,unknown>).straightline as boolean : null;
    const {data:screen,error:screenError}=await db.rpc('beagu_referral_quality_screen',{
      p_event_hash:eventHash,p_referral_hash:refHash,
      p_respondent_hash:respondentHash,p_respondent_uuid:respondent.toLowerCase(),
      p_core_answered:coreAnswered,p_straightline:straightline,
      p_submitted_at:body.submittedAt
    });
    if(screenError){
      console.error('referral quality gate unavailable',screenError.code||'UNKNOWN');
      return response(503,{error:'QUALITY_GATE_UNAVAILABLE'});
    }
    if(!['AUTO_CLEARED','CLEARED','LEGACY_COMPATIBLE'].includes(screen?.status)){
      return response(200,{ok:true,credited:false,
        decision:screen?.status==='REJECTED'?'quality_rejected':'pending_quality_review'});
    }
    const {data,error}=await db.rpc('beagu_referral_credit',{
      p_event_hash:eventHash,p_referral_hash:refHash,
      p_respondent_hash:respondentHash,p_respondent_uuid:respondent.toLowerCase(),
    });
    if(error){
      console.error('referral credit unavailable',error.code||'UNKNOWN');
      return response(503,{error:'CREDIT_UNAVAILABLE'});
    }
    // Results are never a publish approval, and do not automatically grant
    // a write-capable Auth user account.
    return response(200,{ok:true,credited:data?.credited===true,
      decision:typeof data?.decision==='string'?data.decision:'unknown'});
  }catch(e){
    console.error('referral ingest failure',e instanceof Error?e.name:'Unknown');
    return response(500,{error:'INTERNAL_ERROR'});
  }
});
