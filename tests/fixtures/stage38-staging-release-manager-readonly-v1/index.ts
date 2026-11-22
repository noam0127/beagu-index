// STAGE38 ISOLATED PREVIEW ONLY. Deliberately read-only: no deployment, rollback,
// GitHub worker, queue writes, release registration, external GitHub requests or secrets.
// Production supabase ref snvzwrexuqavnfvzgxqj MUST NEVER use this implementation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const trusted = new Set([
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:38738",
]);
const headers = (origin: string) => ({
  ...(trusted.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type",
  "Access-Control-Max-Age": "300",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff",
});
const respond = (origin: string, code: number, data: unknown): Response =>
  new Response(JSON.stringify(data), {
    status: code,
    headers: { ...headers(origin), "Content-Type": "application/json; charset=utf-8" },
  });
const deny = (origin: string, code: number, reason: string): Response =>
  respond(origin, code, { error: reason });

type Claims = { sub?: string; aal?: string; session_id?: string };
function getClaims(token: string): Claims | null {
  try {
    const value = token.split(".")[1];
    if (!value) return null;
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
  } catch { return null; }
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin") || "";
  // Fail closed before OPTIONS as well; production and unknown origins get no CORS.
  if (origin && !trusted.has(origin)) return deny(origin, 403, "origin_not_allowed");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (request.method !== "POST") return deny(origin, 405, "method_not_allowed");

  const bearer = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/i)?.[1] || "";
  if (!bearer) return deny(origin, 401, "authentication_required");
  const apiUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!apiUrl || !serviceKey) return deny(origin, 503, "staging_service_unavailable");

  // No account/user/session is created by this endpoint.
  const db = createClient(apiUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: identity, error: userError } = await db.auth.getUser(bearer);
  const userId = identity?.user?.id || "";
  const claims = getClaims(bearer);
  if (userError || !userId || claims?.sub !== userId) {
    return deny(origin, 401, "invalid_access_token");
  }
  if (claims?.aal !== "aal2" || !claims.session_id) {
    return deny(origin, 403, "admin_mfa_required");
  }
  const { data: account, error: accountError } = await db.from("beagu_admin_accounts")
    .select("role,enabled").eq("user_id", userId).maybeSingle();
  if (accountError || account?.role !== "owner" || account.enabled !== true) {
    return deny(origin, 403, "owner_required");
  }
  const { data: active, error: activeError } = await db.rpc("beagu_admin_active_mfa_session", {
    p_user: userId, p_session: claims.session_id,
  });
  if (activeError || active !== true) return deny(origin, 403, "admin_mfa_required");

  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return deny(origin, 413, "body_too_large");
    const obj: unknown = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw Error("invalid");
    input = obj as Record<string, unknown>;
  } catch { return deny(origin, 400, "invalid_json"); }

  // Fail closed against all action methods that could mutate or issue deployments.
  // Includes register, stage_apply/rollback, prod_apply/rollback and worker_*.
  if (input.action !== "status") return deny(origin, 403, "staging_read_only");

  const { data: state, error: stateError } = await db.from("beagu_site_release_state_v1")
    .select("*").eq("id", 1).single();
  if (stateError || !state) return deny(origin, 503, "staging_state_unavailable");
  const [stage, prod, running] = await Promise.all([
    db.from("beagu_site_release_history_v1")
      .select("id,target,action,version,summary,from_sha,to_sha,deployed_at,deployed_url")
      .eq("target", "staging").order("deployed_at", { ascending: false }).limit(35),
    db.from("beagu_site_release_history_v1")
      .select("id,target,action,version,summary,from_sha,to_sha,deployed_at,deployed_url")
      .eq("target", "production").order("deployed_at", { ascending: false }).limit(35),
    db.from("beagu_site_release_jobs_v1")
      .select("id,target,status,version,created_at")
      .in("status", ["queued", "running"]).order("created_at", { ascending: true }).limit(1),
  ]);
  if (stage.error || prod.error || running.error) return deny(origin, 503, "staging_state_unavailable");

  return respond(origin, 200, {
    mode: "isolated_preview_read_only",
    release_actions_enabled: false,
    hosted_preview_verified: false,
    state, job: running.data?.[0] || null,
    head_sha: null, suggested_draft: null,
    staging_history: stage.data || [], production_history: prod.data || [],
    // No production navigation link or implicit release claim.
    staging_url: null, production_url: null,
  });
});
