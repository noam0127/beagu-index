/* Class diary: school → whose perspective to know → review → colleague prologue → player POV story. */
(function(root){
'use strict';
function init(options){
 const {show,sound,validateSchoolName,openSchoolSearch}=options;
 const $=id=>document.getElementById(id);
 const setup=$('setup'),form=$('profileForm');
 let step=1;
 const partnerNames=Object.freeze({woman:'서지윤',man:'한현우',none:'윤민서',man2:'차도겸',man3:'백태오'});
 function review(){
  $('setupReviewSchool').textContent=$('diarySchoolName').value.trim()||'가상의 초등학교';
  $('setupReviewName').textContent=($('playerName').value.trim()||'새봄')+' 선생님';
  // Neutral internal defaults are not part of the player's chosen profile.
  const traits=$('setupReviewTraits');
  if(traits&&traits.parentElement)traits.parentElement.hidden=true;
  $('setupReviewPartner').textContent=partnerNames[$('partner').value]||'알고 싶은 사람을 선택해 주세요';
 }
 const pageTitles=Object.freeze({
  1:'어느 교실에서 시작할까요?',
  2:'누구의 이야기를 먼저 들어볼까요?',
  3:'어떤 선생님들을 만나게 될까요?',
  4:'프롤로그를 시작할까요?'
 });
 function go(next){
  const upcoming=Math.max(1,Math.min(4,Number(next)||1));
  const previous=step;
  if(previous!==upcoming&&!setup.hidden&&root.BeaguClassDiarySetupBook)
   root.BeaguClassDiarySetupBook.turn(setup,previous,upcoming,pageTitles[previous]);
  step=upcoming;
  setup.dataset.step=String(step);
  $('setupTitle').textContent=pageTitles[step];
  $('setupBack').hidden=step===1;
  $('setupBack').textContent=step===4?'← 선생님들':step===3?'← 알고 싶은 사람':'← 학교 선택';
  $('setupNext').hidden=step===4;
  $('setupNext').textContent=step===1?'알고 싶은 사람 고르기 →':
   step===2?'학교에서 만날 선생님들 →':'프롤로그 준비 →';
  if(step===4)review();
  for(const item of document.querySelectorAll('[data-step-label]')){
   if(Number(item.dataset.stepLabel)===step)item.setAttribute('aria-current','step');
   else item.removeAttribute('aria-current');
  }
  // One viewport throughout: never move the browser document when flipping a page.
 }
 function validate(part){
  if(part===1){
   const school=$('diarySchoolName');
   if(!school.value.trim()){
    if(typeof openSchoolSearch==='function')openSchoolSearch();
    else school.focus();
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
  if(step===2&&validate(2)){sound.note('uiTap');go(3);return;}
  if(step===3){sound.note('uiTap');go(4);}
 });
 $('setupBack').addEventListener('click',()=>{sound.note('uiTap');go(Math.max(1,step-1))});
 form.noValidate=true;
 go(1);
 return {
  ready(){if(step!==4)return false;if(!validate(1)){go(1);return false}if(!validate(2)){go(2);return false}return true},
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
