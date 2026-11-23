/** STAGING ONLY. The Form check-in is NOT submission evidence.
 * Refuse access until independent attribution verification. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const endpoint=Deno.env.get('SUPABASE_URL')||'';
const STAGE_URL='https://ycwuugggqbunlbwuzvbx.supabase.co';
const testOrigins=new Set(['http://localhost:8000','http://127.0.0.1:8000']);
const explicitRender=Deno.env.get('BEAGU_STAGING_ALLOWED_ORIGIN')||'';
const renderPattern=/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.onrender\.com$/;
const allowedOrigin=(origin:string)=>endpoint===STAGE_URL &&
 (testOrigins.has(origin)||(origin===explicitRender && renderPattern.test(explicitRender)));
const approved=()=>Deno.env.get('BEAGU_STAGING_REFERRAL_VERIFIED')==='true';
const secret = Deno.env.get('BEAGU_REFERRAL_HMAC_KEY') || '';
const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {auth:{persistSession:false,autoRefreshToken:false}});
const shortPattern=/^[A-Za-z0-9_-]{8}$/;
const shaPattern = /^[0-9a-f]{64}$/;
async function mac(message: string) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']
  );
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message))));
}

async function shaHex(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));
}
const proofPattern=/^BR1\.([a-f0-9]{64})\.([a-f0-9-]{36})\.(\d{10})\.([a-f0-9]{64})$/;
async function track(ref: string, respondent: string, stage: 'open'|'proof'|'handoff') {
  try {
    const [tokenHash,browserHash]=await Promise.all([
      shaHex(ref),mac('BEAGU_REFERRAL_FUNNEL_BROWSER_V1|'+respondent.toLowerCase())
    ]);
    const {error}=await db.rpc('beagu_referral_funnel_record_v1',{
      p_referral_hash:tokenHash,p_browser_hash:browserHash,p_stage:stage
    });
    if(error) console.warn('referral_funnel_unavailable',error.code||'unknown');
  } catch (_) { console.warn('referral_funnel_unavailable','unexpected'); }
}

const headersFor = (origin: string) => ({
  ...(allowedOrigin(origin)?{'Access-Control-Allow-Origin':origin}:{}),
  'Access-Control-Allow-Headers':'content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer',
  'Vary':'Origin',
});
const json = (origin: string, status: number, data: unknown) =>
  new Response(JSON.stringify(data), {status,headers:headersFor(origin)});
Deno.serve(async req => {
  const origin = req.headers.get('Origin') || '';
  if (endpoint!==STAGE_URL || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
    return json(origin,503,{error:'STAGING_PROJECT_ONLY'});
  if (!allowedOrigin(origin)) return json(origin,403,{error:'ORIGIN_NOT_ALLOWED'});
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:headersFor(origin)});
  if (req.method !== 'POST') return json(origin,405,{error:'METHOD_NOT_ALLOWED'});
  if (!approved()) return json(origin,503,{error:'REFERRAL_NOT_READY'});
  if (Deno.env.get('BEAGU_REFERRAL_CHECKIN_ENABLED') !== 'true' || secret.length < 32)
    return json(origin,503,{error:'REFERRAL_NOT_READY'});
  if ((Number(req.headers.get('content-length'))||0)>512)
    return json(origin,413,{error:'TOO_LARGE'});
  let body:Record<string,unknown>;
  try {
    const raw=await req.text();
    if (enc.encode(raw).byteLength>512) return json(origin,413,{error:'TOO_LARGE'});
    body=JSON.parse(raw);
  } catch { return json(origin,400,{error:'INVALID_JSON'}); }
  if (!body || typeof body!=='object' || Array.isArray(body))
    return json(origin,400,{error:'INVALID_REQUEST'});
  if (body.action==='handoff') {
    // Best-effort "attempted redirect" signal, never proof of Google Form load.
    if(typeof body.proof!=='string')return json(origin,400,{error:'INVALID_REQUEST'});
    const match=proofPattern.exec(body.proof);
    if(!match||!uuid.test(match[2]))return json(origin,400,{error:'INVALID_PROOF'});
    const [,ref,respondent,exp,sig]=match;
    const expiration=Number(exp),now=Math.floor(Date.now()/1000);
    if(!Number.isSafeInteger(expiration)||expiration<now||expiration>now+86400+60)
      return json(origin,422,{error:'PROOF_EXPIRED'});
    const payload='BR1.'+ref+'.'+respondent+'.'+exp;
    if(await mac('BEAGU_REFERRAL_CHECKIN_V1|'+payload)!==sig)
      return json(origin,403,{error:'INVALID_PROOF'});
    await track(ref,respondent,'handoff');
    return json(origin,200,{ok:true});
  }
  if(body.action!=='checkin'||typeof body.ref!=='string' ||
     (!shaPattern.test(body.ref)&&!shortPattern.test(body.ref)) ||
     typeof body.respondent!=='string'||!uuid.test(body.respondent))
    return json(origin,400,{error:'INVALID_REQUEST'});
  try {
    // A proof binds a *browser visitor id*, not a verified individual.
    // It is only an anti-replay hint; it does not establish teacher identity.
    const exp=Math.floor(Date.now()/1000)+24*60*60;
    let ref=body.ref;
    if (shortPattern.test(ref)) {
      const {data,error}=await db.rpc('beagu_referral_short_resolve',{p_code:ref}).maybeSingle();
      if(error) return json(origin,503,{error:'REFERRAL_UNAVAILABLE'});
      if(!data) return json(origin,404,{error:'REFERRAL_NOT_FOUND'});
      ref=await mac('BEAGU_REFERRAL_V1|'+data.visitor+'|'+data.identity_code);
      if(hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(ref))))!==data.token_hash)
        return json(origin,503,{error:'REFERRAL_UNAVAILABLE'});
    }
    const respondent=body.respondent.toLowerCase();
    await track(ref,respondent,'open');
    const payload='BR1.'+ref+'.'+respondent+'.'+exp;
    const proof=payload+'.'+await mac('BEAGU_REFERRAL_CHECKIN_V1|'+payload);
    await track(ref,respondent,'proof');
    return json(origin,200,{proof,expires_at:new Date(exp*1000).toISOString()});
  } catch (e) {
    console.error('referral check-in failed',e instanceof Error?e.name:'Error');
    return json(origin,500,{error:'INTERNAL_ERROR'});
  }
});
