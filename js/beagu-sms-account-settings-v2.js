/* SMS consent is managed only after authenticated, email-verified login.
 * Never persist phone numbers into Auth user_metadata or browser storage.
 * Edge API must be deployed with its private SQL migration after backup review.
 */
(()=>{
 'use strict';
 function create({client,container,save,withdraw,status,consent}){
  if(!client||!container||!save||!withdraw||!status||!consent?.payload||
     !consent?.clear)throw Error('SMS_SETTINGS_MISSING');
  let identity=null,sequence=0,busy=false;
  const endpoint='beagu-member-sms-api-v2';
  function message(text){status.textContent=text}
  async function api(action,options={}){
   if(typeof client.functions?.invoke!=='function')throw Error('UNAVAILABLE');
   const {data,error}=await client.functions.invoke(endpoint,{
    body:{action,...options}
   });
   if(error||data?.ok!==true)throw Error('UNAVAILABLE');
   return data;
  }
  function hide(){
   sequence++;
   identity=null;
   container.hidden=true;
   withdraw.hidden=true;
   consent.clear();
   message('문자 수신 신청은 이메일 인증 후 로그인하여 진행합니다.');
  }
  async function showFor(person){
   if(!person?.user?.email_confirmed_at||!person?.token){
    hide();return;
   }
   identity={id:person.user.id,token:person.token};
   const seq=++sequence;
   container.hidden=false;
   withdraw.hidden=true;
   message('문자 수신 신청 상태를 확인하고 있습니다.');
   try{
    const state=await api('status');
    if(seq!==sequence)return;
    withdraw.hidden=state.consented!==true;
    message(state.consented===true
     ?'문자 수신 신청이 기록되어 있습니다. 번호 인증 전에는 발송하지 않습니다.'
     :'문자 수신을 신청하지 않았습니다. 선택 사항이며 가입·이용에 불이익이 없습니다.');
   }catch(_){
    if(seq===sequence)message('문자 수신 신청 상태를 확인할 수 없습니다. 신청·철회는 인증 서비스가 준비되면 이용할 수 있습니다.');
   }
  }
  save.addEventListener('click',async()=>{
   if(busy||!identity)return;
   const choice=consent.payload();
   if(!choice.ok){
    message(choice.reason==='phone-input'
     ?'010으로 시작하는 휴대폰번호 11자리를 확인해 주세요.'
     :'휴대폰번호 수집·이용과 SMS/LMS 수신에 모두 동의해 주세요. 신청하지 않아도 서비스는 이용할 수 있습니다.');
    return;
   }
   if(choice.consent.beagu_sms_opt_in!==true)return;
   busy=true;save.disabled=true;
   const seq=sequence;
   try{
    const result=await api('opt_in',{
     phone:choice.consent.beagu_sms_phone,
     collectionConsent:true,smsConsent:true
    });
    if(seq!==sequence)return;
    consent.clear();
    withdraw.hidden=result.consented!==true;
    message('문자 수신 신청이 안전하게 기록되었습니다. 휴대폰번호 확인 전에는 문자를 발송하지 않습니다.');
   }catch(_){
    if(seq===sequence)message('문자 수신 신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
   }finally{busy=false;save.disabled=false}
  });
  withdraw.addEventListener('click',async()=>{
   if(busy||!identity)return;
   busy=true;withdraw.disabled=true;
   const seq=sequence;
   try{
    const result=await api('withdraw');
    if(seq!==sequence)return;
    if(result.consented!==false)throw Error('WITHDRAW_NOT_CONFIRMED');
    withdraw.hidden=true;
    consent.clear();
    message('수신 동의를 철회했습니다. 저장된 휴대폰번호 삭제가 서버에서 확인되었습니다.');
   }catch(_){
    if(seq===sequence)message('동의 철회 및 번호 삭제를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
   }finally{busy=false;withdraw.disabled=false}
  });
  hide();
  return Object.freeze({hide,showFor});
 }
 Object.defineProperty(window,'BeaguSmsAccountSettings',{
  configurable:false,enumerable:false,writable:false,
  value:Object.freeze({create})
 });
})();