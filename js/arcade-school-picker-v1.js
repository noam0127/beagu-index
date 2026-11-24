/* School picker shared by both arcade games. No raw survey percentages are shown. */
(function(){
"use strict";
const API="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard";
const difficultyLabels={easy:"EASY",normal:"NORMAL",hard:"HARD",very_hard:"VERY HARD",extreme:"EXTREME"};
const requestCache=new Map(); // public suggestions and server-approved difficulty only
function cachedRequest(path){
 const item=requestCache.get(path);
 if(item&&item.expires>Date.now())return item.promise;
 if(item)requestCache.delete(path);
 return null;
}

const isSafe=s=>typeof s==="string" && s.length>0;
function make(tag,cls,label){const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=label;return el;}
class ArcadeSchoolPicker{
 constructor(mount){
  this.mount=typeof mount==="string"?document.querySelector(mount):mount;
  if(!this.mount)throw new Error("school picker mount unavailable");
  this.selected=null;this.locked=false;this.onChange=null;this.onRequestChange=null;this.serial=0;this.timer=null;
  const heading=make("div","arcade-school-heading","🏫 학교 선택");
  // 2023~2026년 자료 기준은 서버에서 검증합니다.
  this.input=make("input","arcade-school-input");
  this.input.type="search";this.input.placeholder="학교명 검색";this.input.maxLength=30;this.input.autocomplete="off";
  this.input.setAttribute("aria-label","학교명 검색");this.input.setAttribute("aria-controls","arcade-school-results");
  this.guide=make("p","arcade-school-brief-note","학교를 선택해주세요. 배구지수 자료가 없는 학교는 2026 조사에 참여해야 진행이 가능합니다.");
  this.guide.id="arcade-school-brief-note";
  this.input.setAttribute("aria-describedby",this.guide.id);
  this.results=make("div","arcade-school-results");this.results.id="arcade-school-results";
  this.changeButton=make("button","arcade-school-change","⏹ 정지 · 학교 변경");
  this.changeButton.type="button";this.changeButton.hidden=true;
  this.changeButton.addEventListener("click",()=>{
   if(typeof this.onRequestChange==="function")this.onRequestChange();
   else this.resetForChange();
  });
  this.status=make("p","arcade-school-status","");
  this.status.setAttribute("role","status");this.status.setAttribute("aria-live","polite");
  this.mount.classList.add("arcade-school-picker");
  this.surveyLink=make("a","arcade-school-survey","📝 2026년 배구지수 조사 참여하기");
  this.surveyLink.href="https://forms.gle/TPyCakK6Sj2zchRy7";
  this.surveyLink.target="_blank";this.surveyLink.rel="noopener noreferrer";
  this.surveyLink.hidden=true;
  this.mount.append(heading,this.input,this.guide,this.changeButton,this.results,this.status,this.surveyLink);
  this.input.addEventListener("input",()=>{this.clear();clearTimeout(this.timer);this.timer=setTimeout(()=>this.search(),250);});
  const target=new URLSearchParams(window.location?.search||"").get("school_id");
  if(/^[A-Z0-9]{7}$/.test(target||""))setTimeout(()=>{if(this.serial===0&&!this.locked)void this.select({school_id:target});},0);
 }
 clear(){
  this.serial++;this.selected=null;delete this.mount.dataset.schoolId;this.changeButton.hidden=true;this.surveyLink.hidden=true;this.results.replaceChildren();this.status.textContent="";
  if(typeof this.onChange==="function")this.onChange(null);
 }
 focus(){this.input.focus();}
 resetForChange(){
  this.setLocked(false);clearTimeout(this.timer);
  this.input.value="";this.clear();
  this.status.textContent="";
  this.focus();
 }
 setLocked(value){this.locked=Boolean(value);this.input.disabled=this.locked;this.results.hidden=this.locked;this.changeButton.textContent=this.locked?"⏹ 학교 변경":"🏫 학교 변경";}
 async request(path){
  const cached=cachedRequest(path);
  if(cached)return cached;
  // Cache is a display optimization only. Game start and scoring always
  // revalidate eligibility server-side; no protected survey rows are stored.
  const ttl=path.startsWith("?schools=")?90000:30000;
  const promise=fetch(API+path,{cache:"no-store",headers:{"Accept":"application/json"}})
   .then(async response=>{
    if(!response.ok)throw new Error("school_api_"+response.status);
    return response.json();
   });
  requestCache.set(path,{expires:Date.now()+ttl,promise});
  if(requestCache.size>50)requestCache.delete(requestCache.keys().next().value);
  try{return await promise}
  catch(error){requestCache.delete(path);throw error}
 }
 async search(){
  if(this.locked)return;
  const q=this.input.value.trim();const ticket=++this.serial;
  if(q.length<2){this.results.replaceChildren();return;}
  this.status.textContent="학교 검색 중…";
  const perfStarted=performance.now();let perfSucceeded=false;
  try{
   const data=await this.request("?schools="+encodeURIComponent(q));
   if(ticket!==this.serial||this.locked)return;
   this.results.replaceChildren();
   const schools=Array.isArray(data.schools)?data.schools:[];
   perfSucceeded=true;
   if(!schools.length){this.status.textContent="검색 결과가 없습니다. 학교명을 다시 확인해 주세요.";return;}
   this.status.textContent="";
   for(const school of schools){
    if(!isSafe(school.school_id)||!isSafe(school.school_name))continue;
    const btn=make("button","arcade-school-option",school.school_name+" · "+(school.sido_standard||""));
    btn.type="button";
    // Desktop hover/keyboard focus can warm a single possible choice;
    // the subsequent click reuses the same in-flight request.
    let prefetchTimer=null;
    const prefetch=()=>{
      clearTimeout(prefetchTimer);
      prefetchTimer=setTimeout(()=>{
        if(!this.locked&&ticket===this.serial)
          void this.request("?school_id="+encodeURIComponent(school.school_id)).catch(()=>{});
      },180);
    };
    btn.addEventListener("pointerenter",prefetch);
    btn.addEventListener("focus",prefetch);
    btn.addEventListener("pointerleave",()=>clearTimeout(prefetchTimer));
    btn.addEventListener("blur",()=>clearTimeout(prefetchTimer));
    btn.addEventListener("click",()=>this.select(school));
    this.results.append(btn);
   }
  }catch(e){if(ticket===this.serial)this.status.textContent="학교 검색 연결에 실패했습니다. 다시 검색해 주세요.";}
  finally{if(ticket===this.serial&&!this.locked)
   window.BeaguPerf?.record('school_search',performance.now()-perfStarted,perfSucceeded);}
 }
 async select(record){
  if(this.locked)return;
  const ticket=++this.serial;
  this.status.textContent="학교의 게임 난이도 확인 중…";
  const perfStarted=performance.now();let perfSucceeded=false;
  try{
   const data=await this.request("?school_id="+encodeURIComponent(record.school_id));
   if(ticket!==this.serial||this.locked)return;
   const school=data.school;
   if(!school||String(school.school_id)!==String(record.school_id)||!isSafe(school.school_name)||typeof school.eligible!=="boolean"||
      (school.eligible&&!["easy","normal","hard","very_hard","extreme"].includes(school.difficulty)))throw new Error("invalid_school");
   this.selected=school;
   this.mount.dataset.schoolId=String(school.school_id);
   this.changeButton.hidden=false;
   this.surveyLink.hidden=school.eligible===true;
   this.input.value=school.school_name+" · "+(school.region||"");
   this.results.replaceChildren();
   if(school.eligible){
    this.status.textContent="✅ "+school.school_name+" · "+difficultyLabels[school.difficulty];
   }else{
    this.status.textContent="🔒 조사 자료 없음 · 2026 조사 참여";
   }
   if(typeof this.onChange==="function")this.onChange(school);
   perfSucceeded=true;
  }catch(e){if(ticket===this.serial)this.status.textContent="학교 확인 실패. 다시 선택해 주세요.";}
  finally{if(ticket===this.serial&&!this.locked)
   window.BeaguPerf?.record('school_selection',performance.now()-perfStarted,perfSucceeded);}
 }
 get(){return this.selected;}
}
window.ArcadeSchoolPicker=ArcadeSchoolPicker;
})();