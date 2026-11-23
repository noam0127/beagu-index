/** BEAGU STAGING-ONLY telemetry v2, never deploy on production.
 *  Explicit non-production URL; strict local/explicit-Render CORS.
 *  NO IP or proxy-supplied IP headers trusted; all QA visitors share an
 *  intentional rate-limited bucket until ingress trust is independently verified.
 *  Admin exclusion and private server-only RPC access remain mandatory. */
// Standalone QA-only source; no production-shared import.
// Visit and live-presence telemetry gateway.
// All privileged credentials stay in the hosted Edge Function environment.
// IPs are never returned or logged; the database stores only daily HMACs.
// WARNING: proxy-supplied IP headers need independent ingress trust verification.
const BASE = Deno.env.get('SUPABASE_URL') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const encoder = new TextEncoder();
const STAGE_URL='https://ycwuugggqbunlbwuzvbx.supabase.co';
const originSet=new Set(['http://localhost:8000','http://127.0.0.1:8000']);
const exactOrigin=Deno.env.get('BEAGU_STAGING_ALLOWED_ORIGIN')||'';
const renderOrigin=/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.onrender\.com$/;
const allowedOrigin=(origin:string)=>BASE===STAGE_URL && (
  originSet.has(origin) ||
  (exactOrigin===origin && renderOrigin.test(exactOrigin))
);
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const visitPages = new Set(['index','search','result','survey','challenge']);
const pingPages = new Set(['index','search','search-lv1','search-lv2','school-report',
  'statistics','result','survey','challenge','postit','levels','volleyball',
  'teacher-run','teacher-class-diary','other']);
function headers(origin: string) {
  return {
    ...(allowedOrigin(origin)?{'Access-Control-Allow-Origin':origin}:{}),
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'content-type, authorization, apikey, x-client-info',
    'Access-Control-Max-Age':'600',
    'Vary':'Origin','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'
  };
}
function reply(data: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(data), {
    status, headers:{...headers(origin),'Content-Type':'application/json; charset=utf-8'}
  });
}
const serviceHeaders = () => ({
  'apikey':SERVICE,'authorization': 'Bearer '+SERVICE,
  'Content-Type':'application/json'
});
async function rpc(name: string, params: Record<string,unknown> = {}) {
  const r=await fetch(BASE+'/rest/v1/rpc/'+name,{
    method:'POST',headers:serviceHeaders(),body:JSON.stringify(params),
    signal:AbortSignal.timeout(7500)
  });
  if(!r.ok) {
    // Do not reflect SQL or database error strings to anonymous clients.
    console.error('telemetry RPC failure',name,r.status);
    throw new Error('RPC_UNAVAILABLE');
  }
  const body=await r.text();
  return body ? JSON.parse(body) : null;
}
async function isActiveAdmin(req: Request) {
  const header=req.headers.get('authorization')||'';
  const token=header.match(/^Bearer\s+(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/)?.[1];
  if(!token || token===SERVICE) return false;
  try {
    const r=await fetch(BASE+'/auth/v1/user',{
      headers:{apikey:SERVICE,authorization:'Bearer '+token},
      signal:AbortSignal.timeout(4500)
    });
    if(!r.ok) return false;
    const user=await r.json();
    if(!/^[0-9a-f-]{36}$/i.test(user.id||'')) return false;
    const admin=await fetch(BASE+'/rest/v1/beagu_admin_accounts'+
      '?select=user_id&enabled=eq.true&user_id=eq.'+encodeURIComponent(user.id)+'&limit=1',{
      headers:serviceHeaders(),signal:AbortSignal.timeout(4500)
    });
    if(!admin.ok) {
      // A failed administrative lookup must not silently record an admin visit.
      throw new Error('ADMIN_CHECK_UNAVAILABLE');
    }
    return (await admin.json()).length>0;
  } catch(e) {
    if(e instanceof Error && e.message==='ADMIN_CHECK_UNAVAILABLE') throw e;
    // When an auth endpoint is unavailable, do not falsely infer admin status.
    return false;
  }
}
// On staging the upstream IP-header trust chain has NOT been independently
// verified. Ignore all client-supplied IP/proxy headers; QA traffic shares
// one bounded source bucket. Suitable for low-traffic staging ONLY.
function networkSource(_req: Request) {
  return 'qa-unverified-network';
}
async function hashSource(req:Request) {
  const date=new Date().toISOString().slice(0,10);
  const key=await crypto.subtle.importKey('raw',encoder.encode(SERVICE),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const buffer=await crypto.subtle.sign('HMAC',key,
    encoder.encode('beagu-telemetry-v2|'+date+'|'+networkSource(req)));
  return [...new Uint8Array(buffer)]
    .map(n=>n.toString(16).padStart(2,'0')).join('');
}
Deno.serve(async (req:Request) => {
  const origin=req.headers.get('origin')||'';
  if(BASE!==STAGE_URL || !SERVICE)return reply({error:'STAGING_PROJECT_ONLY'},503,origin);
  if(!allowedOrigin(origin))return reply({error:'ORIGIN_NOT_ALLOWED'},403,origin);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:headers(origin)});
  if(req.method==='GET') return reply({status:'ready',version:2},200,origin);
  if(req.method!=='POST') return reply({error:'METHOD_NOT_ALLOWED'},405,origin);

  try {
    const raw=await req.text();
    if(raw.length>1024) return reply({error:'INVALID_INPUT'},400,origin);
    const input=JSON.parse(raw);
    if(!input||typeof input!=='object' || !uuid4.test(input.visitor||'') ||
        !['visit','ping'].includes(input.action))
      return reply({error:'INVALID_INPUT'},400,origin);
    const action=input.action as 'visit'|'ping';
    if(typeof input.page!=='string') return reply({error:'INVALID_INPUT'},400,origin);
    const page=action==='visit'
      ? (visitPages.has(input.page)?input.page:null)
      : (pingPages.has(input.page)?input.page:'other');
    if(!page || (action==='visit'&&!uuid4.test(input.event||'')))
      return reply({error:'INVALID_INPUT'},400,origin);

    // Both administrators and regular users invoke the same script.
    // A verified active admin must not generate normal visit or live data.
    if(await isActiveAdmin(req)) {
      if(action==='ping') return reply({ok:true,admin_excluded:true},200,origin);
      const totals=await rpc('beagu_telemetry_totals_v2');
      return reply({...totals,admin_excluded:true},200,origin);
    }

    const sourceHash=await hashSource(req);
    const admitted=await rpc('beagu_telemetry_guard_v2',{
      p_source_hash:sourceHash,p_visitor:input.visitor,p_action:action
    });
    if(admitted!==true) {
      // Never run a full historical COUNT(DISTINCT) on every rejected request.
      // A throttled visitor may still use every page; statistics are best-effort.
      return reply({error:'TELEMETRY_RATE_LIMITED',rate_limited:true},429,origin);
    }
    if(action==='ping') {
      await rpc('beagu_presence_ping_v1',{
        p_visitor:input.visitor,p_page:page
      });
      return reply({ok:true},200,origin);
    }
    const stats=await rpc('beagu_record_visit',{
      p_visitor:input.visitor,p_event:input.event,p_page:page
    });
    return reply(stats,200,origin);
  } catch(e) {
    console.error('telemetry request error',e instanceof Error?e.name:'unknown');
    return reply({error:'TELEMETRY_UNAVAILABLE'},503,origin);
  }
});
