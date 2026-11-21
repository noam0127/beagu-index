/* Stage 12: Account error messages must not expose identities, inputs,
 * raw Supabase Auth error bodies, tokens or internal debugging details.
 * Official Auth error.code and HTTP status are trusted ONLY for safe UX.
 */
(() => {
 'use strict';
 const outputs=Object.freeze({
  'signin-input':'이메일 주소와 기존 비밀번호를 입력해 주세요.',
  'signup-input':'이메일 주소와 10자 이상의 새 비밀번호를 입력해 주세요.',
  'phone-input':'문자 안내를 신청할 경우 010으로 시작하는 휴대폰번호 11자리를 입력해 주세요.',
  'sms-consent-incomplete':'문자 안내를 신청하려면 번호 수집과 문자 수신에 모두 동의해 주세요. 두 항목을 모두 해제하면 휴대폰번호 없이 가입할 수 있습니다.',
  'level-required':'Lv2 참여코드 인증을 다시 확인해 주세요.',
  'signin-failed':'로그인하지 못했습니다. 이메일·비밀번호를 확인하고, 필요한 경우 인증 메일 또는 비밀번호 재설정을 확인해 주세요.',
  'signup-failed':'회원가입 요청을 처리하지 못했습니다. 잠시 후 다시 시도하거나 이메일 인증·로그인을 확인해 주세요.',
  'rate-limit':'요청이 많아 잠시 제한되었습니다. 몇 분 뒤 다시 시도해 주세요.',
  'network':'인증 서비스와 연결되지 않았습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  'weak-password':'새 비밀번호가 보안 기준에 맞지 않습니다. 10자 이상으로 더 안전하게 설정해 주세요.',
  'provider-unavailable':'현재 계정 인증 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  'oauth-failed':'소셜 로그인을 완료하지 못했습니다. 다시 시도하거나 이메일 로그인을 이용해 주세요.'
 });
 function classify(error,action='signin'){
  const mode=action==='signup'?'signup':action==='oauth'?'oauth':'signin';
  const code=typeof error?.code==='string'?error.code:'';
  const status=Number(error?.status);
  if(status===429||['over_request_rate_limit','over_email_send_rate_limit','over_sms_send_rate_limit'].includes(code))
   return 'rate-limit';
  if(error?.name==='AuthRetryableFetchError'||error?.name==='TypeError')
   return 'network';
  if(code==='weak_password'&&mode==='signup')return 'weak-password';
  if(status>=500&&status<=599)return 'provider-unavailable';
  if(mode==='oauth')return 'oauth-failed';
  // Never distinguish missing accounts, wrong passwords, duplicate signups,
  // banned users, disabled signup, or email-not-confirmed via raw error body.
  return mode==='signup'?'signup-failed':'signin-failed';
 }
 function show(node,kind){
  if(!node||!node.dataset)throw Error('AUTH_ERROR_STATUS_REQUIRED');
  const safe=Object.prototype.hasOwnProperty.call(outputs,kind)?kind:'signin-failed';
  node.dataset.state=safe;
  node.textContent=outputs[safe];
  return safe;
 }
 function fromError(node,error,action){
  return show(node,classify(error,action));
 }
 Object.defineProperty(window,'BeaguAuthErrorUI',{
  configurable:false,enumerable:false,writable:false,
  value:Object.freeze({classify,show,fromError})
 });
})();
