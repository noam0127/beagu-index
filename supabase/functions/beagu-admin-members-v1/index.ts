// Member administration API: separate from challenge participant codes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const endpoint = Deno.env.get("SUPABASE_URL") || "";
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(endpoint, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const origins = new Set(["https://baeguindex.com", "https://www.baeguindex.com"]);
const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://baeguindex.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Max-Age": "3600",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Vary": "Origin",
});
function reply(origin: string, status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}
class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
type Claims = { sub?: string; aal?: string; session_id?: string };
function claimsOf(token: string): Claims | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
  } catch { return null; }
}
async function checkAdmin(request: Request): Promise<{ id: string; role: string }> {
  const bearer = /^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get("Authorization") || "");
  if (!bearer) throw new HttpError(401, "authentication_required");
  const token = bearer[1];
  const { data: verified, error: authError } = await db.auth.getUser(token);
  const claims = claimsOf(token);
  const id = verified?.user?.id || "";
  if (authError || !id || claims?.sub !== id || !claims?.session_id)
    throw new HttpError(401, "authentication_required");
  const { data: account, error: accountError } = await db.from("beagu_admin_accounts")
    .select("user_id,role,enabled").eq("user_id", id).maybeSingle();
  if (accountError) throw new HttpError(503, "authorization_unavailable");
  if (!account?.enabled) throw new HttpError(403, "access_denied");
  if (claims.aal !== "aal2") throw new HttpError(403, "mfa_required");
  const { data: active, error: sessionError } = await db.rpc(
    "beagu_admin_active_mfa_session", { p_user: id, p_session: claims.session_id }
  );
  if (sessionError) throw new HttpError(503, "authorization_unavailable");
  if (active !== true) throw new HttpError(401, "session_expired");
  return { id, role: String(account.role) };
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
type AuthUser = {
  id: string; email?: string | null; email_confirmed_at?: string | null;
  created_at: string; last_sign_in_at?: string | null; banned_until?: string | null;
};
async function adminMap(): Promise<Map<string, { role: string; enabled: boolean }>> {
  const { data, error } = await db.from("beagu_admin_accounts")
    .select("user_id,role,enabled");
  if (error) throw new HttpError(503, "membership_unavailable");
  return new Map((data || []).map(a => [String(a.user_id), {
    role: String(a.role), enabled: a.enabled === true,
  }]));
}
function maskedEmail(value: string | null | undefined): string {
  const email = String(value || "");
  const at = email.lastIndexOf("@");
  if (at < 1) return "";
  return email.slice(0, 1) + "***" + email.slice(at);
}
async function decorate(users: AuthUser[], admins: Map<string, { role: string; enabled: boolean }>) {
  const ids = users.map(user => user.id);
  let linked = new Map<string, { status: string; linked_at: string | null }>();
  let sms = new Map<string, { sms_consent: boolean; phone_verified: boolean; withdrawn_at: string | null }>();
  if (ids.length) {
    const [links, consent] = await Promise.all([
      db.from("beagu_postit_member_accounts")
        .select("auth_user_id,status,linked_at").in("auth_user_id", ids),
      db.rpc("beagu_admin_member_sms_status_v1", { p_ids: ids }),
    ]);
    if (links.error || consent.error) throw new HttpError(503, "member_status_unavailable");
    linked = new Map((links.data || []).map(row => [String(row.auth_user_id), {
      status: String(row.status), linked_at: row.linked_at,
    }]));
    sms = new Map((consent.data || []).map(row => [String(row.user_id), {
      sms_consent: row.sms_consent === true, phone_verified: row.phone_verified === true,
      withdrawn_at: row.withdrawn_at,
    }]));
  }
  const now = Date.now();
  return users.map(user => {
    const admin = admins.get(user.id);
    const member = linked.get(user.id);
    const consent = sms.get(user.id);
    const until = user.banned_until || null;
    return {
      id: user.id,
      email: maskedEmail(user.email),
      email_confirmed: Boolean(user.email_confirmed_at),
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at || null,
      banned_until: until,
      is_suspended: Boolean(until && Date.parse(until) > now),
      is_admin: Boolean(admin),
      admin_role: admin?.role || null,
      lv2_account_linked: Boolean(member && member.status === "active"),
      lv2_link_status: member?.status || null,
      lv2_linked_at: member?.linked_at || null,
      sms_status: !consent ? "no_record" :
        consent.withdrawn_at ? "withdrawn" :
        consent.sms_consent ? "consented" : "not_consented",
      sms_phone_verified: Boolean(consent?.phone_verified),
    };
  });
}
async function allUsers(): Promise<{ users: AuthUser[]; truncated: boolean }> {
  const result: AuthUser[] = [];
  const perPage = 200;
  const maximumPages = 20;
  for (let page = 1; page <= maximumPages; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw new HttpError(503, "auth_list_unavailable");
    const batch = (data?.users || []) as AuthUser[];
    result.push(...batch);
    if (batch.length < perPage) return { users: result, truncated: false };
  }
  return { users: result, truncated: true };
}
async function listMembers(input: Record<string, unknown>) {
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 100) : "";
  const requestedPage = Number(input.page ?? 1);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 1000000)
    throw new HttpError(400, "invalid_page");
  const page = requestedPage;
  const status = ["all","confirmed","unconfirmed","suspended"].includes(String(input.status))
    ? String(input.status) : "all";
  const sort = ["newest","oldest","email"].includes(String(input.sort))
    ? String(input.sort) : "newest";
  const { data, error } = await db.rpc("beagu_admin_member_directory_v2", {
    p_search: search, p_status: status, p_sort: sort, p_page: page, p_size: 20,
  });
  if (error || !data || !Array.isArray(data.rows))
    throw new HttpError(503, "member_directory_unavailable");
  const admins = await adminMap();
  return { ...data, rows: await decorate(data.rows as AuthUser[], admins) };
}
// Server-only lookup. The RPC returns no identity code, visitor ID, or referral token.
async function challengeSummary(id: string) {
  const { data, error } = await db.rpc("beagu_admin_member_challenge_summary_v1", {
    p_user: id,
  });
  if (error) throw new HttpError(503, "challenge_summary_unavailable");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.link_status !== "active" || row.participant_no == null) {
    return { linked: false, participant_no: null, access_level: null, valid_referrals: null };
  }
  return {
    linked: true,
    participant_no: row.participant_no,
    access_level: row.access_level,
    valid_referrals: row.valid_referrals,
  };
}
async function details(input: Record<string, unknown>) {
  const id = String(input.user_id || "");
  if (!uuid.test(id)) throw new HttpError(400, "invalid_user");
  const [{ data, error }, admins] = await Promise.all([
    db.auth.admin.getUserById(id), adminMap(),
  ]);
  if (error || !data?.user) throw new HttpError(404, "member_not_found");
  const [profile] = await decorate([data.user as AuthUser], admins);
  const { data: events, error: auditError } = await db.from("beagu_admin_audit_events")
    .select("event_type,outcome,occurred_at,details")
    .contains("details", { target_user_id: id })
    .order("occurred_at", { ascending: false }).limit(10);
  if (auditError) throw new HttpError(503, "audit_unavailable");
  const challenge = await challengeSummary(id);
  const moderation_history = (events || []).map(event => ({
    event_type: event.event_type,
    outcome: event.outcome,
    occurred_at: event.occurred_at,
    details: { reason: typeof event.details?.reason === "string"
      ? event.details.reason.slice(0, 200) : "" },
  }));
  return { profile, challenge, moderation_history };
}
async function audit(actor: string, event: string, target: string, reason: string, duration: string) {
  const { error } = await db.from("beagu_admin_audit_events").insert({
    actor_user_id: actor, event_type: event, outcome: "success",
    details: { target_user_id: target, reason, duration },
  });
  if (error) {
    console.error("member_moderation_audit_failed", error.code);
    throw new HttpError(503, "audit_unavailable");
  }
}
async function moderate(input: Record<string, unknown>, actor: { id: string; role: string }) {
  if (actor.role !== "owner") throw new HttpError(403, "owner_required");
  const id = String(input.user_id || "");
  const operation = String(input.operation || "");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!uuid.test(id) || !["suspend_24h", "suspend_7d", "restore"].includes(operation) ||
      reason.length < 8 || reason.length > 200) throw new HttpError(400, "invalid_moderation_request");
  if (id === actor.id) throw new HttpError(403, "cannot_moderate_self");
  const admins = await adminMap();
  if (admins.has(id)) throw new HttpError(403, "cannot_moderate_admin");
  const { data: found, error: findError } = await db.auth.admin.getUserById(id);
  if (findError || !found?.user) throw new HttpError(404, "member_not_found");
  const duration = operation === "suspend_24h" ? "24h" :
    operation === "suspend_7d" ? "168h" : "none";
  const { error: updateError } = await db.auth.admin.updateUserById(id, {
    ban_duration: duration,
  });
  if (updateError) throw new HttpError(503, "moderation_failed");
  try {
    await audit(actor.id, "member_" + operation, id, reason, duration);
  } catch {
    // Do not report a failed moderation action after Auth has already changed.
    // Operator must reconcile the missing audit record before another action.
    return { updated: true, user_id: id, operation, audit_recorded: false };
  }
  return { updated: true, user_id: id, operation, audit_recorded: true };
}
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return reply(origin, 405, { error: "method_not_allowed" });
  if (origin && !origins.has(origin)) return reply(origin, 403, { error: "origin_not_allowed" });
  try {
    const actor = await checkAdmin(request);
    let input: Record<string, unknown>;
    try { input = await request.json(); } catch { throw new HttpError(400, "invalid_request"); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "invalid_request");
    const action = String(input.action || "");
    const data = action === "list" ? await listMembers(input) :
      action === "detail" ? await details(input) :
      action === "moderate" ? await moderate(input, actor) : null;
    if (data === null) throw new HttpError(400, "invalid_action");
    return reply(origin, 200, { ok: true, data, role: actor.role });
  } catch (error) {
    if (error instanceof HttpError) return reply(origin, error.status, { error: error.code });
    console.error("member_admin_unavailable", error instanceof Error ? error.name : "unknown");
    return reply(origin, 503, { error: "service_unavailable" });
  }
});
