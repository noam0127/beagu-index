import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Phase 1: staged ONLY. Do not deploy until the existing challenge UUID IDOR is fixed.
// All three rollout flags in beagu_private.challenge_referral_settings start false.
const url = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const encoder = new TextEncoder();
const allowed = new Set(['https://baeguindex.com', 'https://www.baeguindex.com',
  'https://noam0127.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const codePattern = /^(?:BG26-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}|BG26-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6})$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const hex = (array: Uint8Array) => Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
async function sha(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
async function hmac(label: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(service), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(label + ':' + value)));
  return btoa(String.fromCharCode(...signed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function safeMatch(a: string, b: string): Promise<boolean> {
  // Fixed-length digests; do not compare raw server secrets.
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let mismatch = 0;
  for (let i = 0; i < 64; i++) mismatch |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return mismatch === 0;
}
const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://baeguindex.com',
  'Access-Control-Allow-Headers': 'content-type, x-beagu-session, x-beagu-ingest-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '600', 'Vary': 'Origin'
});
function reply(origin: string, status: number, data: unknown) {
  return Response.json(data, { status, headers: { ...cors(origin), 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}
async function session(req: Request): Promise<boolean> {
  const raw = req.headers.get('X-Beagu-Session') || '';
  if (!/^[a-f0-9]{64}$/.test(raw)) return false;
  const { data, error } = await admin.from('beagu_level_sessions')
    .select('access_level,expires_at').eq('token_sha256', await sha(raw)).maybeSingle();
  return !error && !!data && Number(data.access_level) >= 1 && Date.parse(data.expires_at) > Date.now();
}
async function postBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (encoder.encode(raw).byteLength > 2048) throw new Error('TOO_LARGE');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_BODY');
  return parsed;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (origin && !allowed.has(origin)) return reply(origin, 403, { error: 'ORIGIN_NOT_ALLOWED' });
  if ((Number(req.headers.get('Content-Length')) || 0) > 2048)
    return reply(origin, 413, { error: 'TOO_LARGE' });
  let body: Record<string, unknown>;
  try { body = await postBody(req); }
  catch { return reply(origin, 400, { error: 'INVALID_BODY' }); }
  try {
    if (body.action === 'ingest') {
      const received = req.headers.get('X-Beagu-Ingest-Token') || '';
      const expected = Deno.env.get('BEAGU_2026_INGEST_TOKEN') || '';
      if (expected.length < 32 || received.length < 32 || !await safeMatch(received, expected))
        return reply(origin, 401, { error: 'UNAUTHORIZED' });
      const referral = body.referralToken;
      const visitor = body.respondentUuid;
      const eventKey = body.eventKey;
      if (typeof referral !== 'string' || !tokenPattern.test(referral) ||
        typeof visitor !== 'string' || !uuid.test(visitor) ||
        typeof eventKey !== 'string' || eventKey.length < 18 || eventKey.length > 220 ||
        !/^[a-zA-Z0-9:._-]+$/.test(eventKey))
        return reply(origin, 400, { error: 'INVALID_EVENT' });
      const { data, error } = await admin.rpc('beagu_referral_credit', {
        p_event_hash: await sha('event:' + eventKey),
        p_referral_hash: await sha(referral),
        p_respondent_hash: await sha('respondent:' + await hmac('respondent', visitor.toLowerCase())),
        p_respondent_uuid: visitor.toLowerCase()
      });
      if (error) return reply(origin, error.code === '42501' ? 423 : 503,
        { error: error.code === '42501' ? 'INGEST_DISABLED' : 'INGEST_UNAVAILABLE' });
      return reply(origin, 200, { ok: true, credited: data?.credited === true, decision: data?.decision || 'unknown' });
    }

    if (body.action === 'enroll') {
      if (!await session(req)) return reply(origin, 401, { error: 'AUTH_REQUIRED' });
      const code = body.identityCode;
      const visitor = body.visitor;
      if (typeof code !== 'string' || !codePattern.test(code) ||
        typeof visitor !== 'string' || !uuid.test(visitor))
        return reply(origin, 400, { error: 'INVALID_IDENTITY' });
      const referralToken = await hmac('2026-referral-v1', visitor.toLowerCase());
      const { data, error } = await admin.rpc('beagu_referral_enroll', {
        p_visitor: visitor.toLowerCase(),
        p_identity_code: code,
        p_referral_hash: await sha(referralToken)
      });
      if (error) return reply(origin, error.code === '28000' ? 403 : 503,
        { error: 'ENROLL_UNAVAILABLE' });
      return reply(origin, 200, {
        level: data?.level === 2 ? 2 : 1,
        validReferrals: data?.validReferrals === 1 ? 1 : 0,
        inviteUrl: 'https://baeguindex.com/survey.html?ref=' + referralToken
      });
    }

    if (body.action === 'login') {
      const { data: withinBudget, error: budgetError } = await admin.rpc('beagu_consume_login_budget');
      if (budgetError) return reply(origin, 503, { error: 'AUTH_UNAVAILABLE' });
      if (!withinBudget) return reply(origin, 429, { error: 'RATE_LIMITED' });
      const code = body.identityCode;
      if (typeof code !== 'string' || !codePattern.test(code))
        return reply(origin, 401, { error: 'INVALID_CODE' });
      const { data, error } = await admin.rpc('beagu_referral_auth', {
        p_identity_hash: await sha(code)
      });
      if (error) return reply(origin, 503, { error: 'AUTH_UNAVAILABLE' });
      if (!data?.visitor || ![1, 2].includes(Number(data.level)))
        return reply(origin, 401, { error: 'INVALID_CODE_OR_DISABLED' });
      const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
      const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
      const { error: write } = await admin.from('beagu_level_sessions').insert({
        token_sha256: await sha(raw), access_level: data.level, expires_at: expiresAt,
        identity_campaign: data.campaign, identity_visitor_id: data.visitor
      });
      if (write) return reply(origin, 503, { error: 'SESSION_UNAVAILABLE' });
      return reply(origin, 200, { token: raw, level: data.level, expires_at: expiresAt });
    }
    return reply(origin, 400, { error: 'UNKNOWN_ACTION' });
  } catch (_) {
    // Never log credentials, referral tokens, browser UUIDs, or survey answers.
    return reply(origin, 500, { error: 'SERVICE_UNAVAILABLE' });
  }
});
