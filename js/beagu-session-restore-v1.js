/* Stage 11: Restoring a persisted Supabase Auth session is not the same
 * as earning a participation level. Every page reload re-checks both servers.
 * No tokens, users or level flags are written to browser storage here.
 */
(() => {
 'use strict';
 function create({client,getLevelToken,levelUrl,request}) {
  if(!client?.auth?.getSession||!client?.auth?.getUser||
      typeof getLevelToken!=='function'||typeof request!=='function'||
      !/^https:\/\/[^/]+\/functions\/v1\/beagu-level-api$/.test(levelUrl||'')){
    throw new Error('SESSION_RESTORE_CONFIG_INVALID');
  }
  async function identity(){
    try{
      // getSession can recover an existing Supabase refresh token, but its user
      // object is not authoritative. Always validate against Auth getUser().
      const {data,error}=await client.auth.getSession();
      const token=data?.session?.access_token;
      if(error||!token)return null;
      const check=await client.auth.getUser();
      const user=check?.data?.user;
      if(check?.error||!user||user.is_anonymous===true)return null;
      return {user,token,emailVerified:Boolean(user.email_confirmed_at)};
    }catch(_){return null}
  }
  async function level(){
    let token='';
    try{
      token=getLevelToken();
      if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return false;
      const response=await request(levelUrl,{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json','X-Beagu-Session':token},
        body:JSON.stringify({action:'verify'})
      });
      const answer=await response.json().catch(()=>({}));
      return response.ok&&Number(answer.level)===2&&getLevelToken()===token;
    }catch(_){return false}
  }
  return Object.freeze({identity,level});
 }
 Object.defineProperty(window,'BeaguSessionRestore',{
  configurable:false,enumerable:false,writable:false,
  value:Object.freeze({create})
 });
})();
