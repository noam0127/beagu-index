// Standalone administrative authorization gate; no site statistics are exposed here.
// Admin authority is an allowlist checked with service_role after verification by Supabase Auth.
// MFA is MANDATORY for privileged access; client-supplied role/level data are ignored.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const url = Deno.env.get("SUPABASE_URL") || "";
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
// Stage38 standalone QA: only explicit localhost review origins. No production CORS.
const origins = new Set(["http://localhost:8000", "http://127.0.0.1:8000", "http://127.0.0.1:38738"]);
const cors = (origin: string) => ({
  ...(origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Max-Age": "3600",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});
function respond(payload: object, status: number, origin: string): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}
type TokenClaims = { sub?: string; aal?: string; session_id?: string; exp?: number };
function claimsOf(jwt: string): TokenClaims | null {
  try {
    const encoded = jwt.split(".")[1];
    if (!encoded) return null;
    const base = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base.padEnd(Math.ceil(base.length / 4) * 4, "=")));
  } catch { return null; }
}
async function audit(userId: string | null, eventType: string, outcome: "success" | "denied" | "error") {
  const { error } = await db.from("beagu_admin_audit_events").insert({
    actor_user_id: userId, event_type: eventType, outcome, details: {},
  });
  if (error) { console.error("admin_audit_write_failed", error.code); throw new Error("audit_unavailable"); }
}
Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("Origin") || "";
  if (origin && !origins.has(origin)) return respond({ error: "origin_not_allowed" }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405, origin);
  const auth = request.headers.get("Authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(auth);
  if (!match) return respond({ error: "authentication_required" }, 401, origin);
  const jwt = match[1];
  let action = "";
  try {
    const input = await request.json();
    action = typeof input?.action === "string" ? input.action : "";
  } catch { return respond({ error: "invalid_request" }, 400, origin); }
  if (action !== "status" && action !== "verify")
    return respond({ error: "invalid_action" }, 400, origin);

  try {
    // getUser(jwt) contacts Supabase Auth; only parse claims AFTER it verifies the JWT.
    const { data: userData, error: userError } = await db.auth.getUser(jwt);
    const userId = userData?.user?.id || "";
    const claims = claimsOf(jwt);
    if (userError || !userId || claims?.sub !== userId || !claims?.session_id)
      return respond({ error: "authentication_required" }, 401, origin);

    const { data: account, error: accountError } = await db
      .from("beagu_admin_accounts").select("user_id,role,enabled")
      .eq("user_id", userId).maybeSingle();
    if (accountError) return respond({ error: "authorization_unavailable" }, 503, origin);
    if (!account?.enabled) {
      await audit(userId, "admin_access", "denied");
      return respond({ error: "access_denied" }, 403, origin);
    }
    // Status is only a first-factor onboarding endpoint. It never exposes dashboard data.
    if (action === "status")
      return respond({ permitted: true, role: account.role, mfa_required: claims.aal !== "aal2" }, 200, origin);
    if (claims.aal !== "aal2") {
      await audit(userId, "admin_mfa_required", "denied");
      return respond({ error: "mfa_required" }, 403, origin);
    }
    // An AAL2 claim alone is not enough: a terminated Auth session must fail.
    // Match the stricter policy already used by the dashboard and review APIs.
    const { data: activeMfa, error: sessionError } = await db.rpc(
      "beagu_admin_active_mfa_session",
      { p_user: userId, p_session: claims.session_id }
    );
    if (sessionError) return respond({ error: "authorization_unavailable" }, 503, origin);
    if (activeMfa !== true) return respond({ error: "session_expired" }, 401, origin);
    await audit(userId, "admin_login", "success");
    return respond({ permitted: true, role: account.role, mfa_verified: true }, 200, origin);
  } catch (error) {
    console.error("admin_access_unavailable", error instanceof Error ? error.name : "unknown");
    return respond({ error: "service_unavailable" }, 503, origin);
  }
});