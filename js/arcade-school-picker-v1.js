/* School picker shared by both arcade games. No raw survey percentages are shown. */
(function(){
"use strict";
const API="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard";
const difficultyLabels={easy:"EASY",normal:"NORMAL",hard:"HARD",very_hard:"VERY HARD",extreme:"EXTREME"};
const isSafe=s=>typeof s==="string" && s.length>0;
function make(tag,cls,label){const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=label;return el;}
class ArcadeSchoolPicker{
 constructor(mount){
  this.mount=typeof mount==="string"?document.querySelector(mount):mount;
  if(!this.mount)throw new Error("school picker mount unavailable");
  this.selected=null;this.locked=false;this.onChange=null;this.onRequestChange=null;this.serial=0;this.timer=null;
  const heading=make("div","arcade-school-heading","🏫 SELECT YOUR SCHOOL");
  const note=make("p","arcade-school-guide","2023~2026년 중 조사 결과가 한 해라도 있으면 플레이할 수 있습니다. 난이도는 공개·확인된 연도별 배구지수 백분위의 평균으로 결정됩니다.");
  this.input=make("input","arcade-school-input");
  this.input.type="search";this.input.placeholder="학교명 2글자 이상 입력";this.input.maxLength=30;this.input.autocomplete="off";
  this.input.setAttribute("aria-label","학교명 검색");this.input.setAttribute("aria-controls","arcade-school-results");
  this.results=make("div","arcade-school-results");this.results.id="arcade-school-results";
  this.changeButton=make("button","arcade-school-change","⏹ 정지 · 학교 변경");
  this.changeButton.type="button";this.changeButton.hidden=true;
  this.changeButton.addEventListener("click",()=>{
   if(typeof this.onRequestChange==="function")this.onRequestChange();
   else this.resetForChange();
  });
  this.status=make("p","arcade-school-status","2023~2026년 중 한 해 이상 백분위가 확인되면 플레이할 수 있습니다.");
  this.status.setAttribute("role","status");this.status.setAttribute("aria-live","polite");
  this.mount.classList.add("arcade-school-picker");
  this.surveyLink=make("a","arcade-school-survey","📝 2026년 배구지수 조사 참여하기");
  this.surveyLink.href="https://forms.gle/TPyCakK6Sj2zchRy7";
  this.surveyLink.target="_blank";this.surveyLink.rel="noopener noreferrer";
  this.surveyLink.hidden=true;
  this.mount.append(heading,note,this.input,this.changeButton,this.results,this.status,this.surveyLink);
  this.input.addEventListener("input",()=>{this.clear();clearTimeout(this.timer);this.timer=setTimeout(()=>this.search(),250);});
 }
 clear(){
  this.serial++;this.selected=null;this.changeButton.hidden=true;this.surveyLink.hidden=true;this.results.replaceChildren();this.status.textContent="2023~2026년 중 한 해 이상 백분위가 확인되면 플레이할 수 있습니다.";
  if(typeof this.onChange==="function")this.onChange(null);
 }
 focus(){this.input.focus();}
 resetForChange(){
  this.setLocked(false);clearTimeout(this.timer);
  this.input.value="";this.clear();
  this.status.textContent="다른 학교를 검색해 선택하세요. 중단한 경기 점수는 저장되지 않습니다.";
  this.focus();
 }
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
   if(!school||!isSafe(school.school_name)||typeof school.eligible!=="boolean"||
      (school.eligible&&!["easy","normal","hard","very_hard","extreme"].includes(school.difficulty)))throw new Error("invalid_school");
   this.selected=school;
   this.changeButton.hidden=false;
   this.surveyLink.hidden=school.eligible===true;
   this.input.value=school.school_name+" · "+(school.region||"");
   this.results.replaceChildren();
   if(school.eligible){
    const years=Array.isArray(school.available_years)?school.available_years.filter(y=>[2023,2024,2025,2026].includes(y)):[];
    this.status.textContent="✅ "+school.school_name+" | 난이도 "+difficultyLabels[school.difficulty]+
      " · 확인된 "+years.length+"개년("+years.join("·")+") 백분위 평균 기준 · 백분위가 높을수록 어려움";
   }else{
    this.status.textContent="🔒 플레이 불가 · 2023~2026년 조사 백분위가 한 해도 확인되지 않았습니다. 2026년 배구지수 조사에 참여해 주세요. 조사 후 백분위 반영이 완료되면 시작할 수 있습니다.";
   }
   if(typeof this.onChange==="function")this.onChange(school);
  }catch(e){if(ticket===this.serial)this.status.textContent="학교 확인 실패. 다시 선택해 주세요.";}
 }
 get(){return this.selected;}
}
window.ArcadeSchoolPicker=ArcadeSchoolPicker;
})();