/* Stage 19: client transport for the future, separately authorized Lv3.
 * DO NOT load in production until the stage-19 release gate is approved.
 * This helper does NOT display Lv3 or authorize any school/Post-it features.
 */
(()=>{
'use strict';
const ENDPOINT='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-lv3-member-api-v1';
const KEY='beagu-level-session-v1';
function create({client,request=fetch,levelToken=()=>{
 try{return sessionStorage.getItem(KEY)||''}catch{return ''}
}}={}){
 if(!client?.auth?.getSession||typeof request!=='function')
  throw Error('LV3_CLIENT_MISSING');
 let secret='',verified=false,generation=0;
 function reset(){
  generation++;
  secret='';
  verified=false;
 }
 function getState(){
  return Object.freeze({verified,level:verified?3:null});
 }
 async function send(action,token=''){
  const {data,error}=await client.auth.getSession();
  const jwt=error?'':String(data?.session?.access_token||'');
  const code=String(levelToken()||'');
  if(!jwt||!/^[a-f0-9]{64}$/.test(code))
   throw Error('DUAL_PROOF_REQUIRED');
  const response=await request(ENDPOINT,{
   method:'POST',cache:'no-store',referrerPolicy:'no-referrer',
   headers:{
    'Content-Type':'application/json',
    'Authorization':'Bearer '+jwt,
    'X-Beagu-Level-Session':code
   },
   body:JSON.stringify({action,...(token?{token}:{})})
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body?.ok!==true)throw Error('LV3_UNAVAILABLE');
  return body;
 }
 async function issue(){
  const current=++generation;
  secret='';verified=false;
  try{
   const result=await send('issue');
   if(current!==generation)return false;
   if(result?.level!==3||!/^[a-f0-9]{64}$/.test(result.token||''))
    throw Error('INVALID_SERVER_RESPONSE');
   secret=result.token;
   // The token's mere presence is not authorization: verify with server.
   const check=await send('verify',secret);
   if(current!==generation)return false;
   verified=check?.level===3&&check?.verified===true;
   if(!verified)secret='';
   return verified;
  }catch(_){
   if(current===generation)reset();
   return false;
  }
 }
 async function verify(){
  const current=++generation;
  verified=false;
  if(!/^[a-f0-9]{64}$/.test(secret||''))return false;
  try{
   const result=await send('verify',secret);
   if(current!==generation)return false;
   verified=result?.level===3&&result?.verified===true;
   if(!verified)secret='';
   return verified;
  }catch(_){
   if(current===generation)reset();
   return false;
  }
 }
 async function logout(){
  const former=secret;
  reset();
  if(/^[a-f0-9]{64}$/.test(former)){
   try{await send('logout',former)}catch(_){}
  }
 }
 client.auth.onAuthStateChange?.(event=>{
  if(event==='SIGNED_OUT'||event==='USER_DELETED')reset();
  else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')verified=false;
 });
 return Object.freeze({issue,verify,logout,reset,getState});
}
Object.defineProperty(window,'BeaguLv3Session',{
 configurable:false,enumerable:false,writable:false,value:Object.freeze({create})
});
})();
