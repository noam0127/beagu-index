import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Staged, disabled-by-default. No production deployment or main merge.
// Authentication and email are handled by Supabase Auth, never logged or saved
// in the app's own tables. No visitor UUID or challenge code grants an account.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RATE_PEPPER = Deno.env.get('BEAGU_ACCOUNT_RATE_PEPPER') || '';
const CAPTCHA_CONFIRMED = Deno.env.get('BEAGU_AUTH_CAPTCHA_CONFIRMED') === 'true';
// The operator must verify Auth native CAPTCHA actually enforces challenges
// (including direct requests to Auth), not merely the presence of tokens. 
// Production must enable Auth -> Bot and Abuse Protection -> CAPTCHA. Without
// this setting, a client could call Auth directly and bypass the Edge layer.
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
// A NEW client for EVERY auth request avoids session sharing across concurrent users.
function newAuth() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
const allowed = new Set([
  'https://baeguindex.com', 'https://www.baeguindex.com',
  'https://noam0127.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'
]);
const usernamePattern = /^[a-z][a-z0-9_]{3,19}$/;
const emailPattern = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const encoder = new TextEncoder();
function headers(origin: string) {
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://baeguindex.com',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '300',
    'Vary': 'Origin',
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };
}
function respond(origin: string, status: number, value: Record<string, unknown>) {
  return Response.json(value, {status, headers: headers(origin)});
}
function name(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function email(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
function password(value: unknown) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}
function bearer(req: Request): string {
  const match = /^Bearer ([A-Za-z0-9._~-]{50,8000})$/.exec(req.headers.get('Authorization') || '');
  return match?.[1] || '';
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes,b => b.toString(16).padStart(2,'0')).join('');
}
async function hmac(value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(RATE_PEPPER),
    { name: 'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))));
}
async function enabled(flag: string) {
  const {data,error} = await admin.rpc('beagu_account_v1_feature',{p_name:flag});
  return !error && data === true;
}
async function takeSlot(scope: string, value: string, limit: number, seconds = 900) {
  const {data,error} = await admin.rpc('beagu_account_v1_take_slot', {
    p_key_sha256: await hmac(scope+':'+value),
    p_limit:limit, p_window_seconds:seconds
  });
  return !error && data === true;
}
async function gate(scope: string, value: string, limit: number) {
  // Global backstop + per-account/email budget; no plaintext identifiers in DB.
  if (!await takeSlot('global:'+scope,'2026',200,900)) return false;
  return await takeSlot(scope,value,limit,900);
}
async function validatedUser(req: Request) {
  const jwt = bearer(req);
  if (!jwt) return null;
  const {data,error}=await admin.auth.getUser(jwt);
  if (error || !data?.user?.id || !data.user.email_confirmed_at) return null;
  return data.user;
}
async function profile(userId: string) {
  const {data,error}=await admin.rpc('beagu_account_v1_profile',{p_auth_user_id:userId});
  if (error) throw new Error('PROFILE_UNAVAILABLE');
  return data || null;
}
function sessionResponse(value: any, account: any) {
  const session=value?.session;
  if (!session?.access_token || !session?.refresh_token ||
      !Number.isFinite(session?.expires_in)) return null;
  return {
    ok:true, registered:!!account,
    level: account ? Number(account.level) : 0,
    session: {
      access_token:session.access_token, refresh_token:session.refresh_token,
      expires_in:session.expires_in,token_type:'bearer'
    }
  };
}
function refuseLogin(origin: string) {
  // Same error for nonexistent username, wrong password, blocked account.
  return respond(origin,401,{error:'INVALID_CREDENTIALS'});
}
async function handler(req: Request): Promise<Response> {
  const origin=req.headers.get('Origin')||'';
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:headers(origin)});
  if (req.method!=='POST') return respond(origin,405,{error:'METHOD_NOT_ALLOWED'});
  if (origin && !allowed.has(origin)) return respond(origin,403,{error:'ORIGIN_NOT_ALLOWED'});
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || RATE_PEPPER.length < 32)
    return respond(origin,503,{error:'AUTH_NOT_CONFIGURED'});
  let input: Record<string,unknown>;
  try {
    const raw=await req.text();
    if (encoder.encode(raw).length>4096) return respond(origin,413,{error:'REQUEST_TOO_LARGE'});
    input=JSON.parse(raw);
    if (!input || typeof input!=='object' || Array.isArray(input))
      return respond(origin,400,{error:'INVALID_REQUEST'});
  } catch { return respond(origin,400,{error:'INVALID_REQUEST'}); }
  const action=input.action;
  // Signup, login, recovery request and credential reauthentication must not
  // be released before the project's native Auth CAPTCHA has been configured.
  const captchaActions = new Set(['sign-up','bootstrap-sign-in','sign-in',
      'request-recovery','delete-account']);
  if (captchaActions.has(String(action)) && !CAPTCHA_CONFIRMED)
    return respond(origin,423,{error:'CAPTCHA_NOT_CONFIGURED'});
  try {
    if (action==='sign-up') {
      if (!await enabled('signup_enabled')) return respond(origin,423,{error:'SIGNUP_DISABLED'});
      const loginEmail=email(input.email);
      const chosen=name(input.username);
      if (!emailPattern.test(loginEmail) || !usernamePattern.test(chosen) ||
          !password(input.password)) return respond(origin,400,{error:'INVALID_SIGNUP_FIELDS'});
      if (!await gate('signup-email',loginEmail.toLowerCase(),4) ||
          !await takeSlot('signup-username',chosen,8))
        return respond(origin,429,{error:'TOO_MANY_ATTEMPTS'});
      const proof = typeof input.captchaToken==='string' ? input.captchaToken : '';
      if (!/^[A-Za-z0-9._~-]{20,2048}$/.test(proof))
        return respond(origin,400,{error:'CAPTCHA_REQUIRED'});
      const auth=newAuth();
      // Auth's own native CAPTCHA setting MUST also be ON, or direct Auth calls
      // can bypass this Edge API. This field is not validated by the Edge itself.
      // Username here is only a preference; it MUST NOT grant access or level.
      // Binding occurs separately after a confirmed Auth session.
      const {error}=await auth.auth.signUp({
        email:loginEmail,password:input.password as string,
        options:{
          emailRedirectTo:'https://baeguindex.com/account-email-confirmed.html',
          captchaToken:proof,
          data:{beagu_preferred_username:chosen}
        }
      });
      // Do not disclose if this email already has an account.
      if (error) return respond(origin,200,{ok:true,confirmationRequired:true});
      return respond(origin,200,{ok:true,confirmationRequired:true});
    }

    if (action==='bootstrap-sign-in' || action==='sign-in') {
      if (!await enabled('login_enabled')) return respond(origin,423,{error:'LOGIN_DISABLED'});
      if (!password(input.password))
        return refuseLogin(origin);
      const proof = typeof input.captchaToken==='string' ? input.captchaToken : '';
      if (!/^[A-Za-z0-9._~-]{20,2048}$/.test(proof))
        return respond(origin,400,{error:'CAPTCHA_REQUIRED'});
      const auth=newAuth();
      let loginEmail='';
      let expectedUserId:string|null=null;
      if (action==='sign-in') {
        const chosen=name(input.username);
        if (!usernamePattern.test(chosen)) return refuseLogin(origin);
        if (!await gate('login-name',chosen,6))
          return respond(origin,429,{error:'TOO_MANY_ATTEMPTS'});
        const {data:id,error:lookupError}=await admin.rpc('beagu_account_v1_owner',{p_username:chosen});
        // A lookup result is never returned to the caller.
        // For an unknown username still perform a dummy Auth password check.
        // This reduces timing-based username enumeration. Never allow the dummy
        // identity to authenticate: expectedUserId must be present and match.
        loginEmail='nonexistent-beagu-login@invalid.invalid';
        if (!lookupError && id) {
          expectedUserId=String(id);
          const {data}=await admin.auth.admin.getUserById(expectedUserId);
          if (data?.user?.email) loginEmail=data.user.email;
          else expectedUserId=null;
        }
      } else {
        loginEmail=email(input.email);
        if (!emailPattern.test(loginEmail)) return refuseLogin(origin);
        if (!await gate('login-email',loginEmail.toLowerCase(),6))
          return respond(origin,429,{error:'TOO_MANY_ATTEMPTS'});
      }
      const {data,error}=await auth.auth.signInWithPassword({
        email:loginEmail,password:input.password as string,
        options:{captchaToken:proof}
      });
      if (error || !data?.user?.id || !data.user.email_confirmed_at ||
          (action==='sign-in' && (!expectedUserId || data.user.id!==expectedUserId)))
        return refuseLogin(origin);
      const account=await profile(data.user.id);
      if (account?.disabled) return refuseLogin(origin);
      if (action==='sign-in' && !account) return refuseLogin(origin);
      const payload=sessionResponse(data,account);
      return payload ? respond(origin,200,payload) : refuseLogin(origin);
    }

    if (action==='complete-registration') {
      if (!await enabled('registration_enabled'))
        return respond(origin,423,{error:'REGISTRATION_DISABLED'});
      const user=await validatedUser(req);
      if (!user) return respond(origin,401,{error:'AUTH_REQUIRED'});
      const chosen=name(input.username);
      if (!usernamePattern.test(chosen))
        return respond(origin,400,{error:'INVALID_USERNAME'});
      if (!await gate('register-user',user.id,6))
        return respond(origin,429,{error:'TOO_MANY_ATTEMPTS'});
      const {data,error}=await admin.rpc('beagu_account_v1_bind',{
        p_auth_user_id:user.id,p_username:chosen
      });
      if (error) return respond(origin,409,{error:
        error.code==='23505' ? 'USERNAME_UNAVAILABLE' : 'ACCOUNT_BIND_UNAVAILABLE'});
      return respond(origin,200,{ok:true,registered:true,username:data?.username,level:0});
    }

    if (action==='me') {
      if (!await enabled('login_enabled')) return respond(origin,423,{error:'LOGIN_DISABLED'});
      const user=await validatedUser(req);
      if (!user) return respond(origin,401,{error:'AUTH_REQUIRED'});
      const account=await profile(user.id);
      if (account?.disabled) return respond(origin,403,{error:'ACCOUNT_DISABLED'});
      return respond(origin,200,{ok:true,registered:!!account,
        username:account?.username||null,level:account?Number(account.level):0});
    }

    if (action==='refresh') {
      if (!await enabled('login_enabled')) return respond(origin,423,{error:'LOGIN_DISABLED'});
      if (typeof input.refreshToken!=='string' || input.refreshToken.length>2048)
        return refuseLogin(origin);
      if (!await takeSlot('refresh-global','2026',500,900))
        return respond(origin,429,{error:'TOO_MANY_ATTEMPTS'});
      const auth=newAuth();
      const {data,error}=await auth.auth.refreshSession({refresh_token:input.refreshToken});
      if (error || !data?.user?.id || !data.user.email_confirmed_at)
        return refuseLogin(origin);
      const account=await profile(data.user.id);
      if (account?.disabled) return refuseLogin(origin);
      const payload=sessionResponse(data,account);
      return payload?respond(origin,200,payload):refuseLogin(origin);
    }

    if (action==='request-recovery') {
      if (!await enabled('recovery_enabled'))
        return respond(origin,423,{error:'RECOVERY_DISABLED'});
      const loginEmail=email(input.email);
      if (!emailPattern.test(loginEmail))
        return respond(origin,400,{error:'INVALID_EMAIL'});
      if (!await gate('recovery-email',loginEmail.toLowerCase(),3))
        return respond(origin,429,{error:'TOO_MANY_ATTEMPTS'});
      const proof = typeof input.captchaToken==='string' ? input.captchaToken : '';
      if (!/^[A-Za-z0-9._~-]{20,2048}$/.test(proof))
        return respond(origin,400,{error:'CAPTCHA_REQUIRED'});
      const auth=newAuth();
      // The recovery email template must use {{ .TokenHash }} and point to
      // /account-password-reset.html?token_hash=... (never tokens in fragments).
      await auth.auth.resetPasswordForEmail(loginEmail, {
        redirectTo:'https://baeguindex.com/account-password-reset.html',
        captchaToken:proof
      });
      return respond(origin,200,{ok:true,message:'IF_REGISTERED_EMAIL_WILL_BE_SENT'});
    }

    if (action==='complete-recovery') {
      if (!await enabled('recovery_enabled'))
        return respond(origin,423,{error:'RECOVERY_DISABLED'});
      const hash=typeof input.tokenHash==='string' ? input.tokenHash : '';
      if (!/^[a-f0-9]{64}$/.test(hash) || !password(input.password))
        return respond(origin,400,{error:'INVALID_RECOVERY'});
      if (!await gate('recovery-proof',hash,4))
        return respond(origin,429,{error:'TOO_MANY_ATTEMPTS'});
      // A one-use, recovery-only OTP hash from the email template is required;
      // a normal JWT, user ID, UUID or old identity code cannot change password.
      const auth=newAuth();
      const {data:proof,error:verifyError}=await auth.auth.verifyOtp({
        token_hash:hash,type:'recovery'
      });
      if (verifyError || !proof?.user?.id || !proof.session?.access_token)
        return respond(origin,401,{error:'RECOVERY_INVALID_OR_EXPIRED'});
      const {error:updateError}=await auth.auth.updateUser({
        password:input.password as string
      });
      if (updateError) {
        await auth.auth.signOut({scope:'global'}).catch(()=>{});
        return respond(origin,503,{error:'PASSWORD_UPDATE_UNAVAILABLE'});
      }
      // Revoke refresh tokens after recovery. Short-lived access tokens remain
      // valid until expiry; all sensitive actions must re-check live user state.
      const {error:revokeError}=await auth.auth.signOut({scope:'global'});
      if (revokeError) return respond(origin,503,{error:'SESSION_REVOCATION_UNAVAILABLE'});
      return respond(origin,200,{ok:true,passwordUpdated:true,loginRequired:true});
    }

    if (action==='delete-account') {
      if (!await enabled('account_deletion_enabled'))
        return respond(origin,423,{error:'DELETION_DISABLED'});
      const user=await validatedUser(req);
      if (!user?.email) return respond(origin,401,{error:'AUTH_REQUIRED'});
      const current=await profile(user.id);
      if (!current || current.disabled)
        return respond(origin,403,{error:'ACCOUNT_NOT_ELIGIBLE'});
      if (input.confirm!=='DELETE_MY_ACCOUNT' || !password(input.password))
        return respond(origin,400,{error:'CONFIRMATION_REQUIRED'});
      const proof = typeof input.captchaToken==='string' ? input.captchaToken : '';
      if (!/^[A-Za-z0-9._~-]{20,2048}$/.test(proof))
        return respond(origin,400,{error:'CAPTCHA_REQUIRED'});
      if (!await gate('delete-user',user.id,3))
        return respond(origin,429,{error:'TOO_MANY_ATTEMPTS'});
      const auth=newAuth();
      // Fresh password verification prevents stolen access-token-only deletion.
      const {data:verified,error:verifyError}=await auth.auth.signInWithPassword({
        email:user.email,password:input.password as string,options:{captchaToken:proof}
      });
      if (verifyError || verified?.user?.id!==user.id)
        return refuseLogin(origin);
      // Revoke all refresh sessions BEFORE Auth user removal. Never return the
      // account password or email. App profile is FK ON DELETE CASCADE.
      const jwt=bearer(req);
      const {error:logoutError}=await admin.auth.admin.signOut(jwt,'global');
      if (logoutError) return respond(origin,503,{error:'DELETION_UNAVAILABLE'});
      const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);
      if (deleteError) return respond(origin,503,{error:'DELETION_UNAVAILABLE'});
      // Purge HMAC-budget records derived from the deleted account. Other
      // shared/global counters cannot identify the account and expire by TTL.
      const canonicalEmail=user.email.toLowerCase();
      const username=typeof current.username==='string' ? current.username : '';
      const hashedKeys=await Promise.all([
        'signup-email:'+canonicalEmail,'login-email:'+canonicalEmail,
        'recovery-email:'+canonicalEmail,'signup-username:'+username,
        'login-name:'+username,'register-user:'+user.id,'delete-user:'+user.id
      ].map(hmac));
      const {error:cleanupError}=await admin.rpc('beagu_account_v1_purge_budgets',{
        p_hashes:hashedKeys
      });
      // Existing survey_submissions.user_id is ON DELETE SET NULL; anonymized
      // survey data is NOT automatically deleted, see retention policy.
      return respond(origin,200,{
        ok:true,accountDeleted:true,securityBudgetCleanupPending:!!cleanupError
      });
    }

    if (action==='sign-out') {
      const jwt=bearer(req);
      if (!jwt) return respond(origin,401,{error:'AUTH_REQUIRED'});
      const user=await validatedUser(req);
      if (!user) return respond(origin,401,{error:'AUTH_REQUIRED'});
      const {error}=await admin.auth.admin.signOut(jwt,'local');
      if (error) return respond(origin,503,{error:'SIGNOUT_UNAVAILABLE'});
      return respond(origin,200,{ok:true});
    }

    return respond(origin,400,{error:'UNKNOWN_ACTION'});
  } catch {
    // Never log passwords, emails, tokens, account IDs, form data or UUIDs.
    return respond(origin,503,{error:'AUTH_UNAVAILABLE'});
  }
}
Deno.serve(handler);
