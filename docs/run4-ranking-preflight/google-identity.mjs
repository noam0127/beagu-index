// Dedicated invoker only. Key mode is explicit opt-in, never selected automatically.
const endpoint="https://oauth2.googleapis.com/token";
const enc=new TextEncoder(),dec=new TextDecoder();
const b64url=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const encode=v=>b64url(enc.encode(JSON.stringify(v)));
const decode=s=>JSON.parse(dec.decode(Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"=")),c=>c.charCodeAt(0))));
function audience(url){
 const u=new URL(url);
 if(u.protocol!=="https:"||!u.hostname.endsWith(".run.app")||u.pathname!=="/"||u.username||u.password||u.port||u.search||u.hash)throw Error("invalid_audience");
 return u.origin;
}
export function createGoogleIdentityProvider({workerUrl,credential,allowKey=false,fetcher=fetch,now=Date.now}){
 const target=audience(workerUrl);
 if(allowKey!==true||credential?.type!=="service_account"||!(/^[a-z0-9][a-z0-9._-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(credential.client_email||""))||!(/^[a-f0-9]{40}$/.test(credential.private_key_id||""))||typeof credential.private_key!=="string"||credential.private_key.length>10000)throw Error("identity_unavailable");
 // Do not trust a credential-supplied token_uri. Only Google's fixed TLS endpoint.
 const email=credential.client_email,kid=credential.private_key_id;
 const pem=credential.private_key.trim().match(/^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PRIVATE KEY-----$/);
 if(!pem)throw Error("identity_unavailable");
 const der=Uint8Array.from(atob(pem[1].replace(/\s/g,"")),c=>c.charCodeAt(0));
 let keyPromise,cache=null,pending=null;
 async function exchange(){
  try{
   keyPromise??=crypto.subtle.importKey("pkcs8",der,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
   const key=await keyPromise,t=Math.floor(now()/1000);
   const claim=encode({alg:"RS256",typ:"JWT",kid})+"."+encode({iss:email,aud:endpoint,iat:t,exp:t+300,target_audience:target});
   const signed=claim+"."+b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(claim))));
   const r=await fetcher(endpoint,{method:"POST",redirect:"error",signal:AbortSignal.timeout(8000),headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:signed})});
   if(!r.ok)throw Error("identity_unavailable");
   const token=(await r.json())?.id_token;
   if(typeof token!=="string"||token.length>16384||!/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error("identity_unavailable");
   // TLS exchange is trusted; Cloud Run IAM independently validates signature.
   // These local claim checks only prevent wrong audience/expiry being forwarded.
   const claims=decode(token.split(".")[1]),at=Math.floor(now()/1000);
   if(!["https://accounts.google.com","accounts.google.com"].includes(claims.iss)||claims.aud!==target||!Number.isInteger(claims.exp)||claims.exp<=at+60||claims.exp>at+3700||(claims.email!==undefined&&claims.email!==email))throw Error("identity_unavailable");
   cache={token,expires:claims.exp};return token;
  }catch{cache=null;throw Error("identity_unavailable");}
 }
 return async requested=>{
  if(requested!==target)throw Error("invalid_audience");
  if(cache&&cache.expires>Math.floor(now()/1000)+90)return cache.token;
  if(!pending)pending=exchange().finally(()=>pending=null);
  return pending;
 };
}
