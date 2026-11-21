// Member administration API: separate from challenge participant codes.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { moderationInput, moderationAuditDetails, selectMemberStatus,
  memberStatusMatches, validUUID } from "../_shared/beagu-member-management-v2.ts";

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
async function decorate(users: AuthUser[], admins: Map<string, { role: string; enabled: boolean }>) {
  const ids = users.map(user => user.id);
  let linked = new Map<string, { status: string; linked_at: string | null }>();
  let sms = new Map<string, { sms_consent: boolean; phone_verified: boolean; withdrawn_at: string | null }>();
  if (ids.length) {
    const [links, consent] = await Promise.all([
      db.from("beagu_postit_member_accounts")
        .select("auth_user_id,status,linked_at").in("auth_user_id", ids),
      db.rpc("beagu_admin_member_sms_status_v2", { p_ids: ids }),
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
      email: user.email || "",
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
  const page = Math.min(200, Math.max(1, Math.floor(Number(input.page) || 1)));
  const filter = selectMemberStatus(input.filter);
  const admins = await adminMap();
  const { users, truncated } = await allUsers();
  const ordered = users.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const q = search.toLocaleLowerCase("ko-KR");
  const filtered = ordered.filter(u =>
    memberStatusMatches(u,filter,Date.now()) &&
    (!q||(u.email || "").toLocaleLowerCase("ko-KR").includes(q) ||
      u.id.toLowerCase().includes(q)));
  const pageSize = 20;
  const selected = filtered.slice((page - 1) * pageSize, page * pageSize);
  return {
    rows: await decorate(selected, admins),
    total_matches: filtered.length,
    page, page_size: pageSize, filter,
    total_users_scanned: users.length,
    total_admins_scanned: users.filter(u => admins.has(u.id)).length,
    unconfirmed_scanned: users.filter(u => !u.email_confirmed_at).length,
    suspended_scanned: users.filter(u => u.banned_until && Date.parse(u.banned_until) > Date.now()).length,
    truncated,
  };
}
async function details(input: Record<string, unknown>) {
  const id = String(input.user_id || "");
  if (!validUUID(id)) throw new HttpError(400, "invalid_user");
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
  return { profile, moderation_history: events || [] };
}
async function audit(actor: string, event: string, target: string,
  reason: string, duration: string, operation: string, requestId: string,
  outcome: "pending"|"success"|"error") {
  const {error}=await db.from("beagu_admin_audit_events").insert({
    actor_user_id:actor,event_type:event,outcome,
    details:moderationAuditDetails(target,reason,
      operation as "suspend_24h"|"suspend_7d"|"restore",requestId,duration),
  });
  if(error){
    // 23505: requested action already recorded. The browser must reload
    // audit history rather than repeat a potentially completed user ban.
    if(error.code==="23505"&&outcome==="pending")
      throw new HttpError(409,"duplicate_request");
    console.error("member_moderation_audit_failed",error.code||"unknown");
    throw new HttpError(503,"audit_unavailable");
  }
}
async function moderate(input: Record<string, unknown>, actor: { id: string; role: string }) {
  if(actor.role!=="owner")throw new HttpError(403,"owner_required");
  const parsed=moderationInput(input);
  if(!parsed)throw new HttpError(400,"invalid_moderation_request");
  const {userId:id,operation,reason,requestId,duration}=parsed;
  if(id===actor.id)throw new HttpError(403,"cannot_moderate_self");
  const admins=await adminMap();
  if(admins.has(id))throw new HttpError(403,"cannot_moderate_admin");
  const {data:found,error:findError}=await db.auth.admin.getUserById(id);
  if(findError||!found?.user)throw new HttpError(404,"member_not_found");

  // Fail closed BEFORE touching an Auth account. The unique request-id index
  // installed by the gated stage-15 migration makes concurrent retries safe.
  await audit(actor.id,"member_moderation_requested",id,reason,duration,
    operation,requestId,"pending");
  const {error:updateError}=await db.auth.admin.updateUserById(id,{
    ban_duration:duration,
  });
  if(updateError){
    try{
      await audit(actor.id,"member_moderation_failed",id,reason,duration,
        operation,requestId,"error");
    }catch(_){
      // Original pending audit is already durable: do not lose evidence.
    }
    throw new HttpError(503,"moderation_failed");
  }
  // A success after this point is not claimed unless the audit confirms it.
  await audit(actor.id,"member_moderation_succeeded",id,reason,duration,
    operation,requestId,"success");
  return {updated:true,user_id:id,operation,request_id:requestId};
}
async function limitedRequest(request:Request):Promise<Record<string,unknown>>{
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new HttpError(400,"invalid_request");
  if(Number(request.headers.get("content-length")||0)>3072)
    throw new HttpError(413,"body_too_large");
  const reader=request.body?.getReader();
  if(!reader)throw new HttpError(400,"invalid_request");
  let size=0,raw="";const decoder=new TextDecoder();
  for(;;){
    const {value,done}=await reader.read();
    if(done)break;
    size+=value?.byteLength||0;
    if(size>3072){
      await reader.cancel();
      throw new HttpError(413,"body_too_large");
    }
    raw+=decoder.decode(value,{stream:true});
  }
  raw+=decoder.decode();
  let body:unknown;
  try{body=JSON.parse(raw)}catch{throw new HttpError(400,"invalid_request")}
  if(!body||typeof body!=="object"||Array.isArray(body))
    throw new HttpError(400,"invalid_request");
  return body as Record<string,unknown>;
}
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return reply(origin, 405, { error: "method_not_allowed" });
  if (origin && !origins.has(origin)) return reply(origin, 403, { error: "origin_not_allowed" });
  try {
    const actor = await checkAdmin(request);
    if(actor.role!=="owner")throw new HttpError(403,"owner_required");
    const input=await limitedRequest(request);
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
