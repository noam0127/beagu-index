/* Class diary: school → colleague → story, no separate personal questionnaire. */
(function(root){
'use strict';
function init(options){
 const {show,sound,validateSchoolName}=options;
 const $=id=>document.getElementById(id);
 const setup=$('setup'),form=$('profileForm');
 let step=1;
 function go(next){
  step=Math.max(1,Math.min(2,Number(next)||1));
  setup.dataset.step=String(step);
  $('setupBack').hidden=step===1;
  $('setupNext').hidden=false;
  $('setupNext').textContent=step===1?'함께할 동료 만나기 →':'첫 등교 준비 →';
  for(const item of document.querySelectorAll('[data-step-label]')){
   if(Number(item.dataset.stepLabel)===step)item.setAttribute('aria-current','step');
   else item.removeAttribute('aria-current');
  }
  if(!setup.hidden)setup.scrollIntoView({block:'start',behavior:'instant'});
 }
 function validate(part){
  if(part===1){
   const school=$('diarySchoolName');
   if(!school.value.trim()){
    school.setCustomValidity('학교 이름을 입력해 주세요.');
    school.reportValidity();
    school.focus();
    return false;
   }
   school.setCustomValidity('');
   if(!school.checkValidity()){school.reportValidity();school.focus();return false}
   if(typeof validateSchoolName==='function'&&!validateSchoolName())return false;
  }
  if(part===2&&!$('partner').checkValidity()){
   const first=form.querySelector('[data-partner-choice]');
   if(first)first.focus();
   return false;
  }
  return true;
 }
 $('openingStart').addEventListener('click',()=>{sound.note('uiStart');show('setup');go(1)});
 $('setupNext').addEventListener('click',()=>{
  if(step===1){if(validate(1)){sound.note('uiTap');go(2)}return;}
  if(step===2&&validate(2)){sound.note('uiTap');form.requestSubmit();}
 });
 $('setupBack').addEventListener('click',()=>{sound.note('uiTap');go(1)});
 form.noValidate=true;
 go(1);
 return {
  ready(){if(step!==2)return false;if(!validate(1)){go(1);return false}return validate(2)},
  go,
  openChoice(){
   const target=$('choiceSection');target.hidden=false;
   document.body.classList.add('is-choosing');sound.note('uiPick');
   const first=target.querySelector('.choice');if(first)first.focus();
  },
  closeChoice(){$('choiceSection').hidden=true;document.body.classList.remove('is-choosing')}
 };
}
root.BeaguClassDiaryJourney=Object.freeze({init});
})(typeof window!=='undefined'?window:globalThis);
