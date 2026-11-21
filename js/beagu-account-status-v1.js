/* Account progress presentation only. It does NOT grant Lv3 or authorize writes.
 * Never derive an authorization level from these texts or DOM attributes.
 */
(() => {
 'use strict';
 const states=Object.freeze({
  'signin-required':'계정 로그인 전입니다. Lv2 참여코드 인증과 계정 로그인은 별도 과정입니다.',
  'signup-ready':'새 계정을 신청하는 화면입니다. 이메일 인증과 로그인, Lv2 계정 연결은 별도로 진행합니다.',
  'signup-requested':'회원가입 요청을 접수했습니다. 이메일 인증이 필요하면 메일을 확인한 뒤 로그인해 주세요. 가입 요청만으로 Lv3가 되지는 않습니다.',
  'checking':'서버에서 로그인 및 이메일 인증 상태를 확인하고 있습니다.',
  'email-pending':'이메일 인증이 아직 확인되지 않았습니다. 받은편지함의 인증 링크를 확인한 후 다시 로그인해 주세요.',
  'level-required':'계정 로그인 완료 · Lv2 참여코드가 아직 인증되지 않았습니다. 참여코드를 먼저 인증해 주세요.',
  'login-verified':'계정 로그인 및 이메일 인증 완료 · Lv2 계정 연결 상태는 아직 확인되지 않았습니다.',
  'link-ready':'계정 로그인 및 이메일 인증 완료 · 원래 챌린지 발급 기기에서 Lv2 계정 연결을 진행해 주세요.',
  'device-required':'계정 로그인 및 이메일 인증 완료 · 작성 권한 연결은 챌린지를 진행한 원래 기기에서 할 수 있습니다.',
  'linked':'Lv2 계정 연결 완료 · 서버에서 연결 상태를 확인했습니다. Lv3 권한은 별도 서버 검증 후 적용됩니다.',
  'signed-out':'계정 로그아웃 완료 · Lv2 참여코드 인증은 별도로 유지됩니다.',
  'signup-failed':'회원가입 요청을 완료하지 못했습니다. 이메일과 인증 설정을 확인해 주세요.',
  'signin-failed':'계정 로그인에 실패했습니다. 이메일, 비밀번호 및 이메일 인증 여부를 확인해 주세요.',
  'error':'계정 상태를 확인하지 못했습니다. 다시 시도해 주세요.'
 });
 function set(node,state){
  if(!node||!node.dataset)throw new Error('ACCOUNT_STATUS_MISSING');
  const safe=Object.prototype.hasOwnProperty.call(states,state)?state:'error';
  node.dataset.state=safe;
  node.textContent=states[safe];
  return safe;
 }
 Object.defineProperty(window,'BeaguAccountStatus',{
  configurable:false,enumerable:false,writable:false,
  value:Object.freeze({set})
 });
})();
