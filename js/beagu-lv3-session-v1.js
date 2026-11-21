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
 // Stage24 narrow school-facts transport: the Lv3 bearer stays in this
 // closure and is never placed in URL, DOM, persistent storage or events.
 // Every request is freshly verified; the Edge Function independently checks
 // Auth + current Lv2 referral + Lv3 token + approved 2026 evidence.
 async function schoolFacts(schoolId){
  if(!/^[A-Z0-9]{7}$/.test(String(schoolId||'')))
   throw Error('INVALID_SCHOOL_ID');
  if(!await verify())throw Error('LV3_NOT_VERIFIED');
  const version=generation;
  const issued=secret;
  const code=String(levelToken()||'');
  const {data,error}=await client.auth.getSession();
  const jwt=error?'':String(data?.session?.access_token||'');
  if(!jwt||!/^[a-f0-9]{64}$/.test(code)||!verified||
     !/^[a-f0-9]{64}$/.test(issued))throw Error('DUAL_PROOF_REQUIRED');
  const endpoint=ENDPOINT.replace(/beagu-lv3-member-api-v1$/,'beagu-lv3-school-facts-v1');
  const response=await request(endpoint,{
   method:'POST',cache:'no-store',referrerPolicy:'no-referrer',
   headers:{
    'Content-Type':'application/json',
    'Authorization':'Bearer '+jwt,
    'X-Beagu-Level-Session':code,
    'X-Beagu-Lv3-Token':issued
   },
   body:JSON.stringify({action:'school',schoolId})
  });
  if(response.status===401||response.status===403)reset();
  const body=await response.json().catch(()=>({}));
  if(version!==generation||!verified)throw Error('LV3_REVOKED');
  if(!response.ok)throw Error('SCHOOL_FACTS_UNAVAILABLE');
  if(body?.referenceYear!==2026||
     !['verified','not_verified'].includes(body.status))
   throw Error('UNVERIFIED_SOURCE');
  if(body.status==='verified'&&
     (body.school?.school_id!==schoolId||body.school?.reference_year!==2026))
   throw Error('MISMATCHED_SCHOOL');
  return body;
 }
 return Object.freeze({issue,verify,logout,reset,getState,schoolFacts});
}
Object.defineProperty(window,'BeaguLv3Session',{
 configurable:false,enumerable:false,writable:false,value:Object.freeze({create})
});
})();
