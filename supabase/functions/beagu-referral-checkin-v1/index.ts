import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const originAllowlist = new Set([
  'https://baeguindex.com', 'https://www.baeguindex.com',
  'https://noam0127.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000',
]);
const secret = Deno.env.get('BEAGU_REFERRAL_HMAC_KEY') || '';
const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shaPattern = /^[0-9a-f]{64}$/;
async function mac(message: string) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']
  );
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message))));
}
const headersFor = (origin: string) => ({
  'Access-Control-Allow-Origin': originAllowlist.has(origin) ? origin : 'https://baeguindex.com',
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
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:headersFor(origin)});
  if (req.method !== 'POST') return json(origin,405,{error:'METHOD_NOT_ALLOWED'});
  if (origin && !originAllowlist.has(origin)) return json(origin,403,{error:'ORIGIN_NOT_ALLOWED'});
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
  if (!body || typeof body!=='object' || Array.isArray(body) ||
      body.action!=='checkin' || typeof body.ref!=='string' || !shaPattern.test(body.ref) ||
      typeof body.respondent!=='string' || !uuid.test(body.respondent))
    return json(origin,400,{error:'INVALID_REQUEST'});
  try {
    // A proof binds a *browser visitor id*, not a verified individual.
    // It is only an anti-replay hint; it does not establish teacher identity.
    const exp=Math.floor(Date.now()/1000)+24*60*60;
    const ref=body.ref;
    const respondent=body.respondent.toLowerCase();
    const payload='BR1.'+ref+'.'+respondent+'.'+exp;
    const proof=payload+'.'+await mac('BEAGU_REFERRAL_CHECKIN_V1|'+payload);
    return json(origin,200,{proof,expires_at:new Date(exp*1000).toISOString()});
  } catch (e) {
    console.error('referral check-in failed',e instanceof Error?e.name:'Error');
    return json(origin,500,{error:'INTERNAL_ERROR'});
  }
});
