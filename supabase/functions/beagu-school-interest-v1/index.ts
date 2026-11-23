import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const base = Deno.env.get('SUPABASE_URL') || '';
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = createClient(base, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const origins = new Set(['https://baeguindex.com','https://www.baeguindex.com','https://noam0127.github.io','https://beagu-index.vercel.app','https://beagu-index-ibelieveyou365-4134.vercel.app','http://localhost:8000','http://127.0.0.1:8000']);
const responseHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://baeguindex.com',
  'Access-Control-Allow-Headers': 'content-type, x-beagu-session, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '600',
  'Vary': 'Origin',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});
const send = (payload: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(payload), {status, headers: {...responseHeaders(origin), 'Content-Type':'application/json; charset=utf-8'}});

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:responseHeaders(origin)});
  if (req.method !== 'POST') return send({error:'METHOD_NOT_ALLOWED'},405,origin);
  if (origin && !origins.has(origin)) return send({error:'ORIGIN_NOT_ALLOWED'},403,origin);
  const token = (req.headers.get('X-Beagu-Session') || '').trim();
  if (token && !/^[a-f0-9]{64}$/.test(token)) return send({error:'LEVEL1_REQUIRED'},401,origin);
  try {
    // Anonymous readers see only public names/ranks, never single-user metrics.
    if (token) {
      const hashBytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
      const digest = Array.from(new Uint8Array(hashBytes), b => b.toString(16).padStart(2,'0')).join('');
      const {data:session,error:authError} = await admin.from('beagu_level_sessions')
        .select('access_level,expires_at').eq('token_sha256',digest).maybeSingle();
      if (authError) return send({error:'AUTH_UNAVAILABLE'},503,origin);
      if (!session || Number(session.access_level)<1 ||
          !Number.isFinite(Date.parse(session.expires_at)) ||
          Date.parse(session.expires_at)<=Date.now())
        return send({error:'LEVEL1_REQUIRED'},403,origin);
    }
    const {data,error} = await admin.rpc('beagu_school_interest_rankings');
    if (error) {
      console.error('school-interest ranking RPC error',error.code||'unknown');
      return send({error:'RANKING_UNAVAILABLE'},503,origin);
    }
    const isSafeSchool = (v: any) => v && /^[0-9]{7}$/.test(String(v.school_id||'')) &&
      typeof v.school_name==='string' && v.school_name.length<=120;
    const keep = (items: unknown) => Array.isArray(items) ? items.filter(isSafeSchool).slice(0,10) : [];
    const rising = keep(data?.rising).map((school: any) => {
      const publicSchool = {
        school_id: String(school.school_id),
        school_name: String(school.school_name),
        region: typeof school.region === 'string' ? school.region.slice(0,60) : ''
      };
      if (!token) return publicSchool;
      return {
        ...publicSchool,
        visitors: Number(school.visitors),
        growth: Number(school.growth)
      };
    });
    return send({rising,window_hours:72,refresh_seconds:900},200,origin);
  } catch (error) {
    console.error('school-interest request failure', error instanceof Error ? error.name : 'unknown');
    return send({error:'SERVICE_UNAVAILABLE'},503,origin);
  }
});
