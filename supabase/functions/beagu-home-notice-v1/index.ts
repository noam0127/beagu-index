import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const url = Deno.env.get("SUPABASE_URL") || "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const trustedOrigins = new Set(["https://baeguindex.com", "https://www.baeguindex.com"]);
const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": trustedOrigins.has(origin) ? origin : "https://baeguindex.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type",
  "Access-Control-Max-Age": "3600",
  "Vary": "Origin",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
});
function answer(data: object, status: number, origin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" }
  });
}
type TokenClaims = { sub?: string; aal?: string; session_id?: string };
function claimsOf(token: string): TokenClaims | null {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const base = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base.padEnd(Math.ceil(base.length / 4) * 4, "=")));
  } catch { return null; }
}
async function verifyAdmin(token: string): Promise<{ userId?: string; status: number; error?: string }> {
  // Never authorize from decoded claims alone: getUser validates the JWT first.
  const { data: userData, error: userError } = await db.auth.getUser(token);
  const userId = userData?.user?.id || "";
  const claims = claimsOf(token);
  if (userError || !userId || claims?.sub !== userId || !claims?.session_id)
    return { status: 401, error: "authentication_required" };
  const { data: account, error: accountError } = await db
    .from("beagu_admin_accounts")
    .select("role,enabled").eq("user_id", userId).maybeSingle();
  if (accountError) return { status: 503, error: "authorization_unavailable" };
  if (!account?.enabled || !["owner", "admin"].includes(account.role))
    return { status: 403, error: "access_denied" };
  if (claims.aal !== "aal2") return { status: 403, error: "mfa_required" };
  // Reject signed-out sessions even when an AAL2 access token has not yet expired.
  const { data: active, error: sessionError } = await db.rpc(
    "beagu_admin_active_mfa_session",
    { p_user: userId, p_session: claims.session_id }
  );
  if (sessionError) return { status: 503, error: "authorization_unavailable" };
  if (active !== true) return { status: 401, error: "session_expired" };
  return { userId, status: 200 };
}
Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method === "GET") {
    const { data, error } = await db.from("beagu_home_notice_v1")
      .select("body,revision,updated_at").eq("id", 1).maybeSingle();
    if (error || !data) return answer({ error: "notice_unavailable" }, 503, origin);
    return answer(data, 200, origin);
  }
  if (req.method !== "POST") return answer({ error: "method_not_allowed" }, 405, origin);
  if (origin && !trustedOrigins.has(origin))
    return answer({ error: "origin_not_allowed" }, 403, origin);
  const auth = req.headers.get("Authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(auth);
  if (!match) return answer({ error: "authentication_required" }, 401, origin);
  const permitted = await verifyAdmin(match[1]);
  if (!permitted.userId)
    return answer({ error: permitted.error || "access_denied" }, permitted.status, origin);

  // Limit body size even when Content-Length is missing.
  if (Number(req.headers.get("Content-Length") || 0) > 8192)
    return answer({ error: "request_too_large" }, 413, origin);
  const raw = await req.text();
  if (raw.length > 8192) return answer({ error: "request_too_large" }, 413, origin);
  let input: Record<string, unknown>;
  try { input = JSON.parse(raw); }
  catch { return answer({ error: "invalid_json" }, 400, origin); }
  if (!input || input.action !== "save")
    return answer({ error: "invalid_action" }, 400, origin);
  if (typeof input.body !== "string" || !Number.isSafeInteger(input.revision))
    return answer({ error: "invalid_input" }, 400, origin);
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  if (body.length < 1 || body.length > 1000)
    return answer({ error: "body_length_invalid" }, 400, origin);
  const revision = input.revision as number;
  if (revision < 1) return answer({ error: "invalid_revision" }, 400, origin);
  try {
    const { data, error } = await db.from("beagu_home_notice_v1")
      .update({
        body,
        revision: revision + 1,
        updated_at: new Date().toISOString(),
        updated_by: permitted.userId
      })
      .eq("id", 1).eq("revision", revision)
      .select("body,revision,updated_at").maybeSingle();
    if (error) return answer({ error: "save_unavailable" }, 503, origin);
    if (!data) return answer({ error: "edit_conflict" }, 409, origin);
    // Do not persist the full notice body in admin audit logs.
    const { error: auditError } = await db.from("beagu_admin_audit_events")
      .insert({ actor_user_id: permitted.userId, event_type: "home_notice_updated",
        outcome: "success", details: { from_revision: revision, to_revision: data.revision, body_length: body.length } });
    if (auditError) console.error("notice_audit_unavailable", auditError.code);
    return answer(data, 200, origin);
  } catch {
    return answer({ error: "service_unavailable" }, 503, origin);
  }
});
