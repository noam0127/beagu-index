import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Private referral-link issuer. A challenge identity is NOT a login credential.
// The enrollment gate stays closed until the actual Google Form submission path
// is wired and independently verified. No settings are changed by this code.
const endpoint = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(endpoint, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const allowedOrigins = new Set([
  'https://baeguindex.com', 'https://www.baeguindex.com',
  'https://noam0127.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000',
]);
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const digest = async (data: string) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(data))));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const codePattern =
  /^(?:BG26-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}|BG26-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{10})$/;
const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://baeguindex.com',
  'Access-Control-Allow-Headers': 'content-type, x-beagu-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '3600',
  Vary: 'Origin',
});
const json = (origin: string, status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors(origin), 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
async function referralToken(visitor: string, code: string) {
  // Deterministic, opaque, site-specific token: no identity code in the URL.
  // Rotation of SUPABASE_SERVICE_ROLE_KEY invalidates existing token URLs;
  // before key rotation, introduce a dedicated versioned referral signing key.
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(serviceKey), { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC', key, encoder.encode('BEAGU_REFERRAL_V1|' + visitor + '|' + code),
  );
  return hex(new Uint8Array(mac));
}
Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json(origin, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (origin && !allowedOrigins.has(origin)) return json(origin, 403, { error: 'ORIGIN_NOT_ALLOWED' });
  if ((Number(req.headers.get('Content-Length')) || 0) > 2048)
    return json(origin, 413, { error: 'TOO_LARGE' });
  try {
    const sessionToken = (req.headers.get('X-Beagu-Session') || '').trim();
    if (!/^[0-9a-f]{64}$/.test(sessionToken))
      return json(origin, 401, { error: 'AUTH_REQUIRED' });
    const { data: session, error: sessionError } = await db
      .from('beagu_level_sessions')
      .select('access_level,expires_at,identity_visitor_id')
      .eq('token_sha256', await digest(sessionToken))
      .maybeSingle();
    if (sessionError) return json(origin, 503, { error: 'SESSION_UNAVAILABLE' });
    if (!session || Number(session.access_level) < 1 ||
        !Number.isFinite(Date.parse(session.expires_at)) ||
        Date.parse(session.expires_at) <= Date.now())
      return json(origin, 401, { error: 'AUTH_REQUIRED' });

    const raw = await req.text();
    if (encoder.encode(raw).byteLength > 2048)
      return json(origin, 413, { error: 'TOO_LARGE' });
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); }
    catch { return json(origin, 400, { error: 'INVALID_JSON' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        body.action !== 'issue' || typeof body.visitor !== 'string' ||
        !uuidPattern.test(body.visitor) || typeof body.identityCode !== 'string' ||
        !codePattern.test(body.identityCode) || typeof body.deviceSecret !== 'string' ||
        !/^[0-9a-f]{64}$/.test(body.deviceSecret))
      return json(origin, 400, { error: 'INVALID_REQUEST' });
    const visitor = body.visitor.toLowerCase();
    const identityCode = body.identityCode;
    if (session.identity_visitor_id && session.identity_visitor_id !== visitor)
      return json(origin, 403, { error: 'VISITOR_MISMATCH' });

    // A verified challenge code + a local, per-device random secret is required.
    // Bound claims reject attempts from another device that knows the UUID alone.
    const { data: bound, error: bindingError } = await db.rpc(
      'beagu_issue_challenge_identity_bound', {
        p_visitor: visitor,
        p_device_hash: await digest(body.deviceSecret),
        p_existing_code: identityCode,
      },
    );
    if (bindingError || bound?.identity_code !== identityCode)
      return json(origin, 403, { error: 'OWNERSHIP_VERIFICATION_FAILED' });

    const token = await referralToken(visitor, identityCode);
    const { data: enrollment, error: enrollError } = await db.rpc(
      'beagu_referral_enroll', {
        p_visitor: visitor, p_identity_code: identityCode,
        p_referral_hash: await digest(token),
      },
    );
    if (enrollError) {
      // public_enabled intentionally remains false during integration.
      if (enrollError.code === '42501')
        return json(origin, 503, { error: 'REFERRAL_NOT_READY' });
      return json(origin, 503, { error: 'REFERRAL_UNAVAILABLE' });
    }
    return json(origin, 200, {
      link: 'https://baeguindex.com/survey.html?ref=' + token,
      level: Number(enrollment?.level) === 2 ? 2 : 1,
      validReferrals: Number(enrollment?.validReferrals) === 1 ? 1 : 0,
      provisional: Number(enrollment?.level) === 2,
    });
  } catch (err) {
    console.error('referral link unexpected error', err instanceof Error ? err.name : 'Unknown');
    return json(origin, 500, { error: 'INTERNAL_ERROR' });
  }
});
