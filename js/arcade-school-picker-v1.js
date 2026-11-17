/* School picker shared by both arcade games. No raw survey percentages are shown. */
(function(){
"use strict";
const API="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard";
const difficultyLabels={easy:"하 · 쉬움",normal:"중 · 보통",hard:"상 · 어려움"};
const isSafe=s=>typeof s==="string" && s.length>0;
function make(tag,cls,label){const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=label;return el;}
class ArcadeSchoolPicker{
 constructor(mount){
  this.mount=typeof mount==="string"?document.querySelector(mount):mount;
  if(!this.mount)throw new Error("school picker mount unavailable");
  this.selected=null;this.locked=false;this.onChange=null;this.serial=0;this.timer=null;
  const heading=make("div","arcade-school-heading","🏫 SELECT YOUR SCHOOL");
  const note=make("p","arcade-school-guide","학교 이름을 검색해 선택하면 2025 배구지수 백분위에 따라 난이도가 정해집니다.");
  this.input=make("input","arcade-school-input");
  this.input.type="search";this.input.placeholder="학교명 2글자 이상 입력";this.input.maxLength=30;this.input.autocomplete="off";
  this.input.setAttribute("aria-label","학교명 검색");this.input.setAttribute("aria-controls","arcade-school-results");
  this.results=make("div","arcade-school-results");this.results.id="arcade-school-results";
  this.status=make("p","arcade-school-status","학교를 선택해야 게임을 시작할 수 있습니다.");
  this.status.setAttribute("role","status");this.status.setAttribute("aria-live","polite");
  this.mount.classList.add("arcade-school-picker");
  this.mount.append(heading,note,this.input,this.results,this.status);
  this.input.addEventListener("input",()=>{this.clear();clearTimeout(this.timer);this.timer=setTimeout(()=>this.search(),250);});
 }
 clear(){
  this.selected=null;this.results.replaceChildren();this.status.textContent="학교를 선택해야 게임을 시작할 수 있습니다.";
  if(typeof this.onChange==="function")this.onChange(null);
 }
 focus(){this.input.focus();}
 setLocked(value){this.locked=Boolean(value);this.input.disabled=this.locked;this.results.hidden=this.locked;}
 async request(path){
  const r=await fetch(API+path,{cache:"no-store",headers:{"Accept":"application/json"}});
  if(!r.ok)throw new Error("school_api_"+r.status);
  return await r.json();
 }
 async search(){
  if(this.locked)return;
  const q=this.input.value.trim();const ticket=++this.serial;
  if(q.length<2){this.results.replaceChildren();return;}
  this.status.textContent="학교 검색 중…";
  try{
   const data=await this.request("?schools="+encodeURIComponent(q));
   if(ticket!==this.serial||this.locked)return;
   this.results.replaceChildren();
   const schools=Array.isArray(data.schools)?data.schools:[];
   if(!schools.length){this.status.textContent="검색 결과가 없습니다. 학교명을 다시 확인해 주세요.";return;}
   this.status.textContent="목록에서 정확한 학교를 선택해 주세요.";
   for(const school of schools){
    if(!isSafe(school.school_id)||!isSafe(school.school_name))continue;
    const btn=make("button","arcade-school-option",school.school_name+" · "+(school.sido_standard||""));
    btn.type="button";btn.addEventListener("click",()=>this.select(school));
    this.results.append(btn);
   }
  }catch(e){if(ticket===this.serial)this.status.textContent="학교 검색 연결에 실패했습니다. 다시 검색해 주세요.";}
 }
 async select(record){
  if(this.locked)return;
  const ticket=++this.serial;
  this.status.textContent="학교의 게임 난이도 확인 중…";
  try{
   const data=await this.request("?school_id="+encodeURIComponent(record.school_id));
   if(ticket!==this.serial||this.locked)return;
   const school=data.school;
   if(!school||!isSafe(school.school_name)||!["easy","normal","hard"].includes(school.difficulty))throw new Error("invalid_school");
   this.selected=school;
   this.input.value=school.school_name+" · "+(school.region||"");
   this.results.replaceChildren();
   const suffix=school.has_index?"2025년 공개 백분위 기준":"2025년 백분위 자료 없음 · 보통 난이도 적용";
   this.status.textContent=school.school_name+" | 난이도 "+difficultyLabels[school.difficulty]+" ("+suffix+")";
   if(typeof this.onChange==="function")this.onChange(school);
  }catch(e){if(ticket===this.serial)this.status.textContent="학교 확인 실패. 다시 선택해 주세요.";}
 }
 get(){return this.selected;}
}
window.ArcadeSchoolPicker=ArcadeSchoolPicker;
})();