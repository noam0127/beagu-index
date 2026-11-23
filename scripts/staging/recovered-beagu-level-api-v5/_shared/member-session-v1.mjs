// STAGING ONLY. Parse the session claim AFTER Supabase Auth getUser(jwt)
// has authenticated the JWT and returned the account. Parsing JWT payload
// without getUser() is NEVER a signature verification or an auth decision.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function verifiedAuthSessionId(jwt,verifiedUser,nowSeconds=Math.floor(Date.now()/1000)){
 if(typeof jwt!=='string'||jwt.length>4096||typeof verifiedUser?.id!=='string'
    ||!Number.isInteger(nowSeconds))return null;
 const parts=jwt.split('.');
 if(parts.length!==3||!parts[0]||!parts[2]||!parts[1]||
    parts[1].length>4096||!/^[A-Za-z0-9_-]+$/.test(parts[1]))return null;
 let claims;
 try{
  const payload=parts[1].replace(/-/g,'+').replace(/_/g,'/');
  claims=JSON.parse(atob(payload.padEnd(Math.ceil(payload.length/4)*4,'=')));
 }catch{return null}
 if(!claims||typeof claims!=='object'||
    claims.sub!==verifiedUser.id||!uuid.test(claims.session_id||'')||
    !Number.isInteger(claims.exp)||claims.exp<=nowSeconds)return null;
 return claims.session_id;
}
