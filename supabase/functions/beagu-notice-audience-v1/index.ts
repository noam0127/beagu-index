import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { makeNoticeHandler } from "./handler.mjs";
const url=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
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

async function verifyLevel(token:string):Promise<number|null>{
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 // Delegate to the exact existing level API, including expiry and earned-referral revocation.
 const response=await fetch(url+"/functions/v1/beagu-level-api",{method:"POST",headers:{"Content-Type":"application/json","X-Beagu-Session":token},body:JSON.stringify({action:"verify"}),signal:AbortSignal.timeout(8000)});
 if(response.status===401||response.status===403)return null;
 if(!response.ok)throw Error("level_unavailable");
 const data=await response.json();
 return Number.isInteger(data.level)&&[1,2].includes(data.level)?data.level:null;
}
Deno.serve(makeNoticeHandler({db,verifyAdmin,verifyLevel}));
