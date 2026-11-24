import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Dedicated challenge issuer. This code only uses the already verified Lv.1+
// website session; the future Lv.2 identity is NOT an access credential.
const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const allowed = new Set([
  'https://baeguindex.com', 'https://www.baeguindex.com',
  'https://noam0127.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'
]);
const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://baeguindex.com',
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return respond({ error: 'METHOD_NOT_ALLOWED' }, 405, origin);
  if (origin && !allowed.has(origin)) return respond({ error: 'ORIGIN_NOT_ALLOWED' }, 403, origin);
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
    if (input.action !== 'issue' || typeof input.visitor !== 'string' || !uuid.test(input.visitor)) {
      return respond({ error: 'INVALID_REQUEST' }, 400, origin);
    }
    // An anonymous account session must reuse its canonical visitor even on a new device.
    let visitor = input.visitor;
    let accountId = '';
    if (session.identity_visitor_id) {
      const account = await admin.rpc('beagu_account_session_status_v1', { p_token_sha: sessionDigest });
      if (account.error) return respond({ error: 'SESSION_UNAVAILABLE' }, 503, origin);
      if (account.data) {
        visitor = session.identity_visitor_id;
        accountId = String(account.data.account_id || '');
        if (!accountId || !uuid.test(visitor)) return respond({ error: 'AUTH_REQUIRED' }, 401, origin);
      }
    }
    const { data, error } = await admin.rpc('beagu_issue_challenge_identity', { p_visitor: visitor });
    if (error) {
      console.error('challenge code issuance error', error.code || 'UNKNOWN');
      return respond({ error: 'ISSUE_UNAVAILABLE' }, 503, origin);
    }
    const number = Number(data?.participant_no);
    const code = data?.identity_code;
    if (accountId && code !== accountId) return respond({ error: 'IDENTITY_MISMATCH' }, 503, origin);
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
