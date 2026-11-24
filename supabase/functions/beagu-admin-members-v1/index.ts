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
async function summary() {
  const {data,error}=await db.rpc("beagu_account_admin_counts_v1");
  if(error||!data)throw new HttpError(503,"membership_unavailable");
  const result={members:Number(data.members),lv2:Number(data.lv2),suspended:Number(data.suspended)};
  if(Object.values(result).some(v=>!Number.isSafeInteger(v)||v<0)||result.lv2>result.members||result.suspended>result.members)
    throw new HttpError(503,"membership_unavailable");
  return result;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function reportQueue(){
 const {data,error}=await db.rpc("beagu_postit_report_queue_v1");
 if(error||!Array.isArray(data))throw new HttpError(503,"reports_unavailable");
 return {rows:data.slice(0,50).map(row=>({target_type:row.target_type,target_id:row.target_id,body:String(row.body||"").slice(0,200),status:row.status,reports:Number(row.reports),case_id:row.case_id||null,decision:row.decision||null,expires_at:row.expires_at||null}))};
}
async function decide(input:Record<string,unknown>,actor:{id:string;role:string}){
 if(actor.role!=="owner")throw new HttpError(403,"owner_required");
 const type=String(input.target_type||""),id=String(input.target_id||""),decision=String(input.decision||""),reason=typeof input.reason==="string"?input.reason.trim():"";
 if(!["post","comment"].includes(type)||!uuid.test(id)||!["dismiss","restrict_24h","restrict_7d","restore"].includes(decision)||reason.length<8||reason.length>200)throw new HttpError(400,"invalid_decision");
 const {data,error}=await db.rpc("beagu_postit_report_decide_v1",{p_type:type,p_target:id,p_decision:decision,p_reason:reason,p_admin:actor.id});
 if(error)throw new HttpError(503,"decision_unavailable");
 if(data?.ok!==true||!uuid.test(String(data.case_id||"")))throw new HttpError(409,"case_unavailable");
 return {ok:true,case_id:data.case_id};
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
    const data = action === "summary" ? await summary() : action === "report_queue" ? await reportQueue() : action === "report_decide" ? await decide(input,actor) : null;
    if (data === null) throw new HttpError(400, "invalid_action");
    return reply(origin, 200, { ok: true, data, role: actor.role });
  } catch (error) {
    if (error instanceof HttpError) return reply(origin, error.status, { error: error.code });
    console.error("member_admin_unavailable", error instanceof Error ? error.name : "unknown");
    return reply(origin, 503, { error: "service_unavailable" });
  }
});
