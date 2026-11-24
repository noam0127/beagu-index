// Review-only: explicit enable gate and server-side secrets.
import {createGoogleIdentityProvider} from "./google-identity.mjs";
import {createOfficialHandler} from "./edge-entry.mjs";
export function createRuntime({getEnv,createClient,fetcher=fetch,identityProvider=null}){
 const unavailable=()=>new Response(JSON.stringify({error:"verification_unavailable"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}});
 if(getEnv("RUN4_OFFICIAL_ENABLED")!=="true")return unavailable;
 try{
  const supabaseUrl=getEnv("SUPABASE_URL"),serviceKey=getEnv("SUPABASE_SERVICE_ROLE_KEY"),actorSecret=getEnv("RUN4_ACTOR_HMAC"),workerUrl=getEnv("RUN4_WORKER_URL"),workerSecret=getEnv("RUN4_WORKER_HMAC");
  if(typeof serviceKey!=="string"||serviceKey.length<20||actorSecret===workerSecret)throw Error("invalid_config");
  let getIdentityToken=identityProvider;
  if(!getIdentityToken){
   if(getEnv("RUN4_IDENTITY_MODE")!=="approved-dedicated-key")throw Error("identity_unavailable");
   getIdentityToken=createGoogleIdentityProvider({workerUrl,credential:JSON.parse(getEnv("RUN4_GOOGLE_SERVICE_ACCOUNT_JSON")||"null"),allowKey:true,fetcher});
  }
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  return createOfficialHandler({admin,supabaseUrl,actorSecret,workerUrl,workerSecret,getIdentityToken,enabled:()=>getEnv("RUN4_OFFICIAL_ENABLED")==="true",fetcher});
 }catch{return unavailable;}
}
