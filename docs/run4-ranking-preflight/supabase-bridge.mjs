// Review-only Edge-compatible bridge. No Deno.serve or automatic network configuration.
const enc=new TextEncoder(),hex=b=>Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
const keyBytes=s=>Uint8Array.from(s.match(/../g),x=>parseInt(x,16));
const tiers=new Set(["easy","normal","hard","very_hard","extreme"]);
const hash=async s=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))));
const hmac=async(secret,message)=>{
 const key=await crypto.subtle.importKey("raw",keyBytes(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(message))));
};
export function createRemoteVerifier({workerUrl,secret,getIdentityToken,fetcher=fetch,now=Date.now}){
 const url=new URL(workerUrl);
 if(url.protocol!=="https:"||!url.hostname.endsWith(".run.app")||url.username||url.password||url.search||url.hash||url.port||url.pathname!=="/")throw Error("invalid_worker_url");
 if(!/^[a-f0-9]{64}$/.test(secret||"")||typeof getIdentityToken!=="function")throw Error("verification_unavailable");
 return async ({seed,difficulty,replay,elapsed})=>{
  const raw=JSON.stringify({seed,difficulty,replay,elapsed});
  if(enc.encode(raw).length>1048576)throw Error("invalid_replay");
  const id=await getIdentityToken(url.origin);
  if(typeof id!=="string"||!/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(id))throw Error("verification_unavailable");
  const ts=String(now()),nonce=hex(crypto.getRandomValues(new Uint8Array(16))),signature=await hmac(secret,"run4-v1\n"+ts+"\n"+nonce+"\n"+raw);
  const response=await fetcher(url.origin+"/v1/replay",{method:"POST",redirect:"error",signal:AbortSignal.timeout(25000),headers:{"content-type":"application/json","authorization":"Bearer "+id,"x-run4-time":ts,"x-run4-nonce":nonce,"x-run4-signature":signature},body:raw});
  if(!response.ok)throw Error(response.status===429?"verification_busy":"verification_unavailable");
  const data=await response.json();if(!data?.result||typeof data.result!=="object")throw Error("invalid_result");
  return data.result;
 };
}
// Uses the existing server-side level session table and earned-code revalidation.
// The administrative bearer is checked if present; it is never forwarded to Cloud Run.
// Shared Lv.1 codes do not identify individuals; quota is per current token plus global.
export function createSupabaseAdapters({admin,supabaseUrl,actorSecret,fetcher=fetch,now=Date.now}){
 const base=new URL(supabaseUrl);
 if(base.protocol!=="https:"||!base.hostname.endsWith(".supabase.co")||base.username||base.password||base.port||base.pathname!=="/"||base.search||base.hash||!(/^[a-f0-9]{64}$/.test(actorSecret||"")))throw Error("invalid_gateway_config");
 async function authenticate(credentials){
  const token=credentials?.levelToken,bearer=credentials?.adminBearer;
  if(typeof token!=="string"||!(/^[a-f0-9]{64}$/.test(token)))return null;
  const digest=await hash(token);
  const {data,error}=await admin.from("beagu_level_sessions").select("access_level,expires_at,identity_visitor_id,identity_campaign").eq("token_sha256",digest).maybeSingle();
  if(error||!data||!Number.isInteger(Number(data.access_level))||Number(data.access_level)<1||!(Date.parse(data.expires_at)>now()))return null;
  if(data.identity_campaign==="2026"&&data.identity_visitor_id&&Number(data.access_level)>=2){
   const earned=await admin.rpc("beagu_has_earned_challenge_visitor",{p_visitor:data.identity_visitor_id});if(earned.error||earned.data!==true)return null;
  }
  if(bearer!==undefined&&bearer!==null&&bearer!==""){
   if(typeof bearer!=="string"||!/^Bearer [A-Za-z0-9_.-]+$/.test(bearer))return null;
   const {data:user,error:authError}=await admin.auth.getUser(bearer.slice(7));
   if(authError||!user?.user?.id)return null;
   const account=await admin.from("beagu_admin_accounts").select("user_id").eq("user_id",user.user.id).eq("enabled",true).maybeSingle();
   if(account.error||account.data)return null;
  }
  const identity=data.identity_campaign==="2026"&&data.identity_visitor_id?"visitor:"+data.identity_visitor_id:"session:"+digest;
  return {level:Number(data.access_level),hash:await hmac(actorSecret,"run4-actor-v1:"+identity),admin:false};
 }
 async function resolveSchool(schoolId){
  if(typeof schoolId!=="string"||!(/^[A-Z0-9]{7}$/.test(schoolId)))return null;
  const url=new URL("/functions/v1/arcade-leaderboard",base);url.searchParams.set("school_id",schoolId);
  const res=await fetcher(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(5000)});
  if(!res.ok)return null;
  const s=(await res.json())?.school;
  if(s?.school_id!==schoolId||s.eligible!==true||!tiers.has(s.difficulty))return null;
  return {eligible:true,difficulty:s.difficulty};
 }
 async function rpc(name,params){
  const r=await admin.rpc(name,params);if(r.error)throw Error("store_unavailable");return r.data;
 }
 const store={
  async createIfBelowLimit(s,limit){
   if(limit.windowMs!==900000||limit.max!==40)throw Error("unsupported_limit");
   return (await rpc("run4_candidate_start",{p_id:s.id,p_actor:s.actorHash,p_school:s.schoolId,p_tier:s.difficulty,p_seed:s.seed,p_started:new Date(s.startedAt).toISOString()}))===true;
  },
  async get(id){
   const s=await rpc("run4_candidate_get",{p_id:id});if(!s)return null;
   return {id:s.id,version:s.version,actorHash:s.actor_hash,schoolId:s.school_id,difficulty:s.difficulty,startedAt:Date.parse(s.started_at),seed:Number(s.replay_seed),submitted:s.submitted};
  },
  async claimAttempt(s){return (await rpc("run4_candidate_claim",{p_id:s.id,p_actor:s.actorHash}))===true;},
  async insertVerifiedOnce(s,result){return (await rpc("run4_candidate_save",{p_id:s.id,p_actor:s.actorHash,p_result:result}))===true;}
 };
 async function listRecords(difficulty,outcome){
  if(!["all",...tiers].includes(difficulty)||!["all","retired","all_bosses"].includes(outcome))throw Error("invalid_filter");
  return rpc("run4_candidate_list",{p_tier:difficulty,p_outcome:outcome});
 }
 return {authenticate,resolveSchool,store,listRecords};
}
