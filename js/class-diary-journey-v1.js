/* Stage 7 quick interactive walkthrough. State stays only in memory; no storage, no network. */
(function(root){
'use strict';
function init(options){
 const {show,sound}=options;
 const $=id=>document.getElementById(id);
 const setup=$('setup'),form=$('profileForm');
 let step=1;
 function review(){
  $('setupReviewName').textContent=($('playerName').value.trim()||'—')+' 선생님 · '+$('age').value+'세';
  const ex=$('experience'),gender=$('gender'),mbti=$('mbti'),partner=$('partner');
  $('setupReviewTraits').textContent=[ex.selectedOptions[0]?.textContent,gender.selectedOptions[0]?.textContent,mbti.value].filter(Boolean).join(' · ');
  $('setupReviewPartner').textContent=partner.selectedOptions[0]?.textContent||'—';
 }
 function go(next){
  step=Math.max(1,Math.min(3,next));
  setup.dataset.step=String(step);
  $('setupBack').hidden=step===1;
  $('setupNext').hidden=step===3;
  $('setupNext').textContent=step===1?'동료 고르기 →':'첫 등교 준비 →';
  for(const el of document.querySelectorAll('[data-step-label]')){
   if(Number(el.dataset.stepLabel)===step)el.setAttribute('aria-current','step');
   else el.removeAttribute('aria-current');
  }
  if(step===3)review();
  setup.scrollIntoView({block:'start',behavior:'instant'});
 }
 function validate(part){
  const ids=part===1?['playerName','age','experience','gender','mbti']:part===2?['partner']:[];
  for(const id of ids){
   const el=$(id);
   if(!el.checkValidity()){el.reportValidity();el.focus();return false;}
  }
  return true;
 }
 $('openingStart').addEventListener('click',()=>{sound.note('uiStart');show('setup');go(1)});
 $('setupNext').addEventListener('click',()=>{if(validate(step)){sound.note('uiTap');go(step+1)}});
 $('setupBack').addEventListener('click',()=>{sound.note('uiTap');go(step-1)});
 form.noValidate=true;
 go(1);
 return {
  ready(){
   if(step!==3)return false;
   if(!validate(1)){go(1);validate(1);return false}
   if(!validate(2)){go(2);validate(2);return false}
   return true;
  },
  go,
  openChoice(){
   const target=$('choiceSection');
   target.hidden=false;document.body.classList.add('is-choosing');
   sound.note('uiPick');
   const first=target.querySelector('.choice');if(first)first.focus();
  },
  closeChoice(){ $('choiceSection').hidden=true;document.body.classList.remove('is-choosing') }
 };
}
root.BeaguClassDiaryJourney=Object.freeze({init});
})(typeof window!=='undefined'?window:globalThis);
