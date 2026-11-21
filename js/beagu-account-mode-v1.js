/* Unified Lv2 account login / signup presentation.
 * Only controls presentation and browser-level form constraints. Supabase Auth,
 * server-verified participation codes, membership binding and RLS own all access.
 */
(() => {
 'use strict';
 const MODES=Object.freeze({SIGNIN:'signin',SIGNUP:'signup'});
 const MIN_NEW_PASSWORD=10;
 function create(options) {
  const {form,title,description,password,submit,switchButton,smsFields,
         smsPhone,smsConsent,forgot,google}=options||{};
  if (![form,title,description,password,submit,switchButton,smsFields,
         smsPhone,smsConsent].every(Boolean))
   throw new Error('ACCOUNT_UI_MISSING_ELEMENT');
  const labels={
   signin:{
    title:'Lv2 로그인',
    description:'정식 계정으로 로그인하세요. Lv2 참여코드는 별도로 인증됩니다.',
    submit:'로그인하기',
    switch:'계정이 없어요 · 회원가입'
   },
   signup:{
    title:'Lv2 회원가입',
    description:'이메일로 계정을 만들고 인증 메일을 확인하세요. Lv2 참여코드는 유지됩니다.',
    submit:'회원가입',
    switch:'이미 계정이 있어요 · 로그인하기'
   }
  };
  let current=null;
  function mode(){return current||MODES.SIGNIN;}
  function setMode(requested) {
   const next=requested===MODES.SIGNUP?MODES.SIGNUP:MODES.SIGNIN;
   const changed=current!==next;
   const info=labels[next];
   current=next;
   form.dataset.mode=next;
   title.textContent=info.title;
   description.textContent=info.description;
   submit.textContent=info.submit;
   switchButton.textContent=info.switch;
   password.autocomplete=next===MODES.SIGNUP?'new-password':'current-password';
   password.minLength=next===MODES.SIGNUP?MIN_NEW_PASSWORD:1;
   password.placeholder=next===MODES.SIGNUP?'새 비밀번호 (10자 이상)':'기존 비밀번호';
   smsFields.hidden=next!==MODES.SIGNUP;
   if(forgot)forgot.hidden=next!==MODES.SIGNIN;
   if(google)google.hidden=next!==MODES.SIGNIN;
   if(changed) {
    // Never carry one mode's secret (or incidental marketing selection) into another.
    password.value='';
    smsPhone.value='';
    smsConsent.checked=false;
   }
   return next;
  }
  return Object.freeze({mode,setMode,
   toggle(){return setMode(mode()===MODES.SIGNIN?MODES.SIGNUP:MODES.SIGNIN);}
  });
 }
 Object.defineProperty(window,'BeaguAccountMode',{
  configurable:false,enumerable:false,writable:false,
  value:Object.freeze({create})
 });
})();
