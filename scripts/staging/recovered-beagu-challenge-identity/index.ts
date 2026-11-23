/** BEAGU STAGING ONLY: 2026 challenge identity issuer. The original
 * production issuer lacks device proof. This isolated source requires a
 * Lv1 server session AND matching browser secret, with atomic DB binding.
 * Never deploy this generated source on a production project. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Dedicated challenge issuer. This code only uses the already verified Lv.1+
// website session; the future Lv.2 identity is NOT an access credential.
const STAGE_URL = 'https://ycwuugggqbunlbwuzvbx.supabase.co';
const url = Deno.env.get('SUPABASE_URL') || '';
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = url === STAGE_URL && secret
  ? createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const allowed = new Set(['http://localhost:8000','http://127.0.0.1:8000']);
const renderOrigin = Deno.env.get('BEAGU_STAGING_ALLOWED_ORIGIN') || '';
const renderPattern = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.onrender\.com$/;
const allowedOrigin = (origin: string) => url === STAGE_URL && (
  allowed.has(origin) || (origin === renderOrigin && renderPattern.test(renderOrigin))
);
const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const cors = (origin: string) => ({
  ...(allowedOrigin(origin) ? {'Access-Control-Allow-Origin':origin} : {}),
  'Access-Control-Allow-Headers': 'content-type, x-beagu-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
});
const respond = (data: unknown, code: number, origin: string) =>
  new Response(JSON.stringify(data), { status: code, headers: {
    ...cors(origin), 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
  } });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  if (!admin) return respond({ error:'STAGING_PROJECT_ONLY' },503,origin);
  if (!allowedOrigin(origin)) return respond({ error:'ORIGIN_NOT_ALLOWED' },403,origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return respond({ error: 'METHOD_NOT_ALLOWED' }, 405, origin);
  if ((Number(req.headers.get('Content-Length')) || 0) > 512) return respond({ error: 'TOO_LARGE' }, 413, origin);
  try {
    const sessionToken = (req.headers.get('X-Beagu-Session') || '').trim();
    if (!/^[a-f0-9]{64}$/.test(sessionToken)) return respond({ error: 'AUTH_REQUIRED' }, 401, origin);
    const sessionDigest = await sha256(sessionToken);
    const { data: session, error: sessionError } = await admin.from('beagu_level_sessions')
      .select('access_level,expires_at,identity_visitor_id').eq('token_sha256', sessionDigest).maybeSingle();
    if (sessionError) return respond({ error: 'SESSION_UNAVAILABLE' }, 503, origin);
    if (!session || Number(session.access_level) < 1 ||
      !Number.isFinite(Date.parse(session.expires_at)) ||
      Date.parse(session.expires_at) <= Date.now()) {
      return respond({ error: 'AUTH_REQUIRED' }, 401, origin);
    }

    const raw = await req.text();
    if (enc.encode(raw).byteLength > 512) return respond({ error: 'TOO_LARGE' }, 413, origin);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return respond({ error: 'INVALID_JSON' }, 400, origin); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ error: 'INVALID_BODY' }, 400, origin);
    const input = body as Record<string, unknown>;
    if (input.action !== 'issue' || typeof input.visitor !== 'string' || !uuid.test(input.visitor) ||
        typeof input.deviceSecret !== 'string' || !/^[a-f0-9]{64}$/.test(input.deviceSecret) ||
        (input.existingCode !== undefined &&
          (typeof input.existingCode !== 'string' ||
           !/^(?:BG26-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}|BG26-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{10})$/.test(input.existingCode)))) {
      return respond({ error: 'INVALID_REQUEST' }, 400, origin);
    }
    if (session.identity_visitor_id &&
        session.identity_visitor_id !== input.visitor) {
      return respond({ error:'VISITOR_MISMATCH' },403,origin);
    }
    // Atomic session-to-visitor + device-to-visitor binding in ONE DB transaction.
    // This is NOT the unbound production beagu_issue_challenge_identity RPC.
    const { data, error } = await admin.rpc('beagu_stage_issue_challenge_bound', {
      p_session_sha256: sessionDigest,
      p_visitor: input.visitor,
      p_device_sha256: await sha256(input.deviceSecret),
      p_existing_code: input.existingCode ?? null,
    });
    if (error) {
      if (error.code === '28000') return respond({ error:'OWNERSHIP_VERIFICATION_FAILED' },403,origin);
      console.error('staging challenge issue error', error.code || 'UNKNOWN');
      return respond({ error:'ISSUE_UNAVAILABLE' },503,origin);
    }
    const number = Number(data?.participant_no);
    const code = data?.identity_code;
    if (!Number.isSafeInteger(number) || number < 1 ||
      typeof code !== 'string' || !/^(?:BG26-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}|BG26-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{10})$/.test(code)) {
      return respond({ error: 'INVALID_ISSUED_DATA' }, 503, origin);
    }
    return respond({ participantNo: number, identityCode: code, lv1Code: false, lv2Access: false }, 200, origin);
  } catch (error) {
    console.error('challenge identity unexpected error', error instanceof Error ? error.name : 'Error');
    return respond({ error: 'INTERNAL_ERROR' }, 500, origin);
  }
});
