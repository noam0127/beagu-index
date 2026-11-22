/**
 * QA-only recovery of deployed beagu-edited-api-v1 v16 (read-only source
 * reference). NEVER deploy this file to production. It hard-fails outside
 * ycwuugggqbunlbwuzvbx and allows ONLY explicitly configured QA origins.
 *
 * Deployment source is intentionally kept in scripts/staging/, not in the
 * production supabase/functions autodeploy path.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const TEST_URL = 'https://ycwuugggqbunlbwuzvbx.supabase.co';
const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const configuredOrigin = Deno.env.get('BEAGU_STAGING_ALLOWED_ORIGIN') || '';
const client = url === TEST_URL && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const enc = new TextEncoder();
const sha256 = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))),
    b => b.toString(16).padStart(2, '0')).join('');
const localOrigins = new Set(['http://localhost:8000', 'http://127.0.0.1:8000']);
const validRenderOrigin = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.onrender\.com$/;
function allowed(origin: string): boolean {
  if (url !== TEST_URL) return false;
  if (localOrigins.has(origin)) return true;
  return !!configuredOrigin && validRenderOrigin.test(configuredOrigin) &&
    origin === configuredOrigin;
}
function headers(origin: string): HeadersInit {
  const result: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-beagu-session'
  };
  if (allowed(origin)) result['Access-Control-Allow-Origin'] = origin;
  return result;
}
function send(origin: string, status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: headers(origin) });
}
async function readSmallJson(req: Request): Promise<Record<string, unknown> | null> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  let len = 0, text = '';
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    len += value.byteLength;
    if (len > 1024) { await reader.cancel(); return null; }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    const body: unknown = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown> : null;
  } catch { return null; }
}
const numericMap: Record<number, Record<string, string>> = {
  2024: { students: 'AI', teachers: 'N', classes: 'AP', students_per_class: 'AR',
          admin_employees: 'AF', school_employees: 'AG' },
  2025: { students: 'P', teachers: 'T', vice_principals: 'R', lead_teachers: 'S',
          classrooms: 'I', gym_spaces: 'J', cafeterias: 'K',
          teacher_support_spaces: 'L', land_area: 'G', playground_area: 'H' }
};
const categoryMap: Record<number, Record<string, string>> = {
  2024: { establishment_type: 'E', meal_place: 'AX', milk_lunch: 'AY' },
  2025: { establishment_type: 'D', meal_place: 'N', milk_lunch: 'O' }
};
const categoryAllowed: Record<string, Set<string>> = {
  establishment_type: new Set(['국립', '공립', '사립']),
  meal_place: new Set(['식당', '교실', '식당+교실']),
  milk_lunch: new Set(['O', 'X'])
};
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  if (!client) return send(origin, 503, { error: 'STAGING_PROJECT_ONLY' });
  if (!allowed(origin)) return send(origin, 403, { error: 'ORIGIN_NOT_ALLOWED' });
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== 'POST') return send(origin, 405, { error: 'METHOD_NOT_ALLOWED' });
  if ((Number(req.headers.get('content-length')) || 0) > 1024)
    return send(origin, 413, { error: 'TOO_LARGE' });
  try {
    const token = req.headers.get('x-beagu-session') || '';
    if (!/^[a-f0-9]{64}$/.test(token))
      return send(origin, 401, { error: 'AUTH_REQUIRED' });
    const { data: session, error: sessionError } = await client
      .from('beagu_level_sessions').select('access_level,expires_at')
      .eq('token_sha256', await sha256(token)).maybeSingle();
    if (sessionError) return send(origin, 503, { error: 'SESSION_UNAVAILABLE' });
    if (!session || Number(session.access_level) < 2 ||
        !Number.isFinite(Date.parse(session.expires_at)) ||
        Date.parse(session.expires_at) <= Date.now())
      return send(origin, 401, { error: 'AUTH_REQUIRED' });
    const body = await readSmallJson(req);
    const id = typeof body?.schoolId === 'string' ? body.schoolId : '';
    if (body?.action !== 'school' || !/^[A-Z0-9]{7}$/.test(id))
      return send(origin, 400, { error: 'INVALID_SCOPE' });
    // Never query raw teacher responses. Official facts are explicitly approved.
    const [numbers, categories, percentiles] = await Promise.all([
      client.from('beagu_school_report_official_facts')
        .select('survey_year,fact_key,fact_value').eq('school_id', id)
        .eq('review_status', 'APPROVED').limit(100),
      client.from('beagu_school_report_official_categories')
        .select('survey_year,fact_key,fact_value').eq('school_id', id)
        .eq('review_status', 'APPROVED').limit(30),
      client.from('beagu_school_report_yearly')
        .select('survey_year,percentile').eq('school_id', id)
        .eq('publication_status', 'PUBLISHED')
        .eq('privacy_reviewed', true)
        .eq('unique_respondents_reviewed', true)
        .eq('school_identity_reviewed', true)
        .eq('small_cell_reviewed', true)
        .eq('differencing_reviewed', true)
        .eq('manual_release_approved', true).limit(4)
    ]);
    if (numbers.error || categories.error || percentiles.error)
      return send(origin, 503, { error: 'DATA_UNAVAILABLE' });
    const values: Record<number, Record<string, string | number>> = {
      2023: {}, 2024: {}, 2025: {}
    };
    for (const f of numbers.data || []) {
      const year = Number(f.survey_year);
      const key = numericMap[year]?.[String(f.fact_key)];
      if (f.fact_value == null) continue;
      const n = Number(f.fact_value);
      if (key && Number.isFinite(n) && n >= 0 && n <= 10000000)
        values[year][key] = n;
    }
    for (const f of categories.data || []) {
      const year = Number(f.survey_year);
      const key = String(f.fact_key), val = String(f.fact_value);
      const field = categoryMap[year]?.[key];
      if (field && categoryAllowed[key]?.has(val)) values[year][field] = val;
    }
    for (const p of percentiles.data || []) {
      const year = Number(p.survey_year), val = Number(p.percentile);
      if (!Number.isFinite(val) || val < 0 || val > 100) continue;
      if (year === 2023) values[2023].F = val.toFixed(2) + '%';
      if (year === 2024) values[2024].BN = val.toFixed(2) + '%';
    }
    const rows = [2023, 2024, 2025]
      .filter(year => Object.keys(values[year]).length > 0)
      .map(year => ({
        year, values: values[year],
        release_note: '공개 검수된 공식 학교정보만 제공합니다. 교사별 원문과 소표본 점수는 제공하지 않습니다.'
      }));
    return send(origin, 200, { school_id: id, level: 2, rows });
  } catch (error) {
    console.error('staging edited API:', error instanceof Error ? error.name : 'unexpected');
    return send(origin, 500, { error: 'INTERNAL_ERROR' });
  }
});
