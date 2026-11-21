/* Optional SMS privacy controls. Two independent, initially unchecked
 * choices: personal-information collection and SMS/LMS reception.
 *
 * This module only prepares consent data for Auth signup. It is NOT a
 * trustworthy server-side marketing consent registry; stage 14 must verify
 * secure persistence, auditability and withdrawal.
 */
(()=>{
'use strict';
function create({phone,collectionConsent,marketingConsent}){
 if(!phone||!collectionConsent||!marketingConsent)throw Error('SMS_CONSENT_UI_MISSING');
 function clear(){
  collectionConsent.checked=false;
  marketingConsent.checked=false;
  phone.value='';
  phone.disabled=true;
 }
 function sync(){
  const allowed=collectionConsent.checked===true&&marketingConsent.checked===true;
  if(!allowed){
   phone.value='';
   phone.disabled=true;
  }else{
   phone.disabled=false;
  }
  return allowed;
 }
 function payload(){
  const collection=collectionConsent.checked===true;
  const marketing=marketingConsent.checked===true;
  // Neither an optional phone field nor an unchecked choice may block signup.
  if(!collection&&!marketing)return {
   ok:true,consent:{beagu_sms_opt_in:false,beagu_phone_collection_opt_in:false,
    beagu_sms_phone:null}
  };
  // A partial choice must never imply marketing permission or collect a number.
  if(!collection||!marketing)return {ok:false,reason:'consent-incomplete'};
  const digits=String(phone.value||'').replace(/[^0-9]/g,'');
  if(!/^010[0-9]{8}$/.test(digits))return {ok:false,reason:'phone-input'};
  return {ok:true,consent:{beagu_sms_opt_in:true,
   beagu_phone_collection_opt_in:true,beagu_sms_phone:digits}};
 }
 collectionConsent.addEventListener('change',sync);
 marketingConsent.addEventListener('change',sync);
 clear();
 return Object.freeze({payload,sync,clear});
}
Object.defineProperty(window,'BeaguSmsConsent',{
 configurable:false,enumerable:false,writable:false,
 value:Object.freeze({create})
});
})();